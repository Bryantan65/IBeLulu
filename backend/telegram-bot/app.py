import json
import os
import time
import urllib.request
from typing import Dict, List, Optional


def load_env_file(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            raw = line.strip()
            if not raw or raw.startswith('#') or '=' not in raw:
                continue
            key, value = raw.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_env_file(os.path.join(BASE_DIR, '.env.local'))

TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip()
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '').strip()

WXO_HOST_URL = os.environ.get('WXO_HOST_URL', 'https://api.ap-southeast-1.dl.watson-orchestrate.ibm.com').strip()
WXO_INSTANCE_ID = os.environ.get('WXO_INSTANCE_ID', '20260126-1332-1571-30ef-acf1a3847d97').strip()
WXO_AGENT_ID = os.environ.get('WXO_AGENT_ID', 'addd6d7a-97ab-44db-8774-30fb15f7a052').strip()

POLL_TIMEOUT = int(os.environ.get('TELEGRAM_POLL_TIMEOUT', '50'))
MAX_HISTORY = int(os.environ.get('WXO_MAX_HISTORY', '12'))

TOKEN_ENDPOINT = f"{SUPABASE_URL}/functions/v1/watson-token" if SUPABASE_URL else ''

cached_token: Optional[str] = None
token_expiry: Optional[int] = None

history_by_user: Dict[int, List[Dict[str, str]]] = {}


def log(msg: str) -> None:
    print(msg, flush=True)


def http_request(url: str, method: str = 'GET', headers: Optional[dict] = None, body: Optional[dict] = None) -> dict:
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url=url, data=data, method=method)
    if headers:
        for key, value in headers.items():
            req.add_header(key, value)
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = resp.read().decode('utf-8')
        if not payload:
            return {}
        return json.loads(payload)


def get_valid_token() -> str:
    global cached_token, token_expiry
    if cached_token and token_expiry and int(time.time()) < (token_expiry - 300):
        return cached_token

    if not TOKEN_ENDPOINT or not SUPABASE_ANON_KEY:
        raise RuntimeError('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars.')

    log('Fetching IBM token via Supabase Edge Function...')
    data = http_request(
        TOKEN_ENDPOINT,
        method='POST',
        headers={
            'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body={},
    )

    token = data.get('token')
    expires_at = data.get('expires_at')
    if not token:
        raise RuntimeError(f'No token in response: {data}')

    cached_token = token
    token_expiry = int(expires_at) if expires_at else int(time.time()) + 3600
    return cached_token


def call_review_agent(messages: List[Dict[str, str]]) -> str:
    token = get_valid_token()
    url = f"{WXO_HOST_URL}/instances/{WXO_INSTANCE_ID}/v1/orchestrate/{WXO_AGENT_ID}/chat/completions"

    api_messages = [
        {
            'role': msg['role'],
            'content': [{'response_type': 'text', 'text': msg['text']}],
        }
        for msg in messages
    ]

    data = http_request(
        url,
        method='POST',
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body={
            'stream': False,
            'messages': api_messages,
        },
    )

    choices = data.get('choices') or []
    if choices:
        message = choices[0].get('message') or {}
        content = message.get('content')
        if isinstance(content, str):
            return content
        if isinstance(content, list) and content:
            first = content[0]
            if isinstance(first, dict) and 'text' in first:
                return str(first['text'])

    return 'No response text received from agent.'


def build_history(user_id: int, user_text: str) -> List[Dict[str, str]]:
    history = history_by_user.get(user_id, [])
    history.append({'role': 'user', 'text': user_text})
    history = history[-MAX_HISTORY:]
    history_by_user[user_id] = history
    return history


def store_assistant_reply(user_id: int, reply_text: str) -> None:
    history = history_by_user.get(user_id, [])
    history.append({'role': 'assistant', 'text': reply_text})
    history_by_user[user_id] = history[-MAX_HISTORY:]


def send_telegram_message(chat_id: int, text: str, parse_mode: str = 'Markdown') -> None:
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    http_request(
        url,
        method='POST',
        headers={'Content-Type': 'application/json'},
        body={'chat_id': chat_id, 'text': text, 'parse_mode': parse_mode},
    )


def save_complaint_to_supabase(text: str, telegram_user_id: int, telegram_username: Optional[str]) -> Optional[str]:
    """Save a complaint to the Supabase complaints table and return the complaint ID."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        log('Cannot save complaint: Missing Supabase configuration')
        return None

    try:
        url = f"{SUPABASE_URL}/rest/v1/complaints"
        complaint_data = {
            'text': text,
            'telegram_user_id': str(telegram_user_id),
            'telegram_username': telegram_username or 'anonymous',
            'status': 'RECEIVED',
            'confidence': 0.5,
        }

        response = http_request(
            url,
            method='POST',
            headers={
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
            },
            body=complaint_data,
        )

        # Response should be a list with the created record
        if isinstance(response, list) and len(response) > 0:
            complaint_id = response[0].get('id')
            log(f'Complaint saved to Supabase: {complaint_id}')
            return complaint_id
        elif isinstance(response, dict):
            complaint_id = response.get('id')
            if complaint_id:
                log(f'Complaint saved to Supabase: {complaint_id}')
                return complaint_id

        log(f'Unexpected response format from Supabase: {response}')
        return None
    except Exception as exc:
        log(f'Error saving complaint to Supabase: {exc}')
        return None


def cluster_complaint(complaint_id: str) -> None:
    """Trigger clustering for a newly created complaint."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        log('Cannot cluster complaint: Missing Supabase configuration')
        return

    try:
        url = f"{SUPABASE_URL}/functions/v1/cluster-complaints"
        http_request(
            url,
            method='POST',
            headers={
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body={'complaint_id': complaint_id},
        )
        log(f'Clustering triggered for complaint {complaint_id}')
    except Exception as exc:
        log(f'Error triggering cluster-complaints: {exc}')


def check_complaint_status(complaint_id: str) -> str:
    """Check the status of a complaint by ID."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return '❌ Database not configured.'

    try:
        url = f"{SUPABASE_URL}/rest/v1/complaints?id=eq.{complaint_id}&select=id,status,category_pred,severity_pred,created_at"
        response = http_request(
            url,
            method='GET',
            headers={
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
            },
        )

        if isinstance(response, list) and len(response) > 0:
            data = response[0]
            created = data.get('created_at', '')
            if created:
                from datetime import datetime
                dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                created = dt.strftime('%Y-%m-%d')

            return (
                f"📋 *Complaint Status*\n\n"
                f"🆔 `{data.get('id', 'N/A')}`\n"
                f"📊 Status: *{data.get('status', 'N/A')}*\n"
                f"📂 Category: {data.get('category_pred') or 'Processing...'}\n"
                f"⚡ Severity: {data.get('severity_pred') or '?'}/5\n"
                f"📅 Submitted: {created}"
            )
        return '❌ Complaint not found.'
    except Exception as exc:
        log(f'Error checking complaint status: {exc}')
        return f'❌ Error: {exc}'


def get_user_complaints(telegram_user_id: str) -> str:
    """Get the recent complaints for a user."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return '❌ Database not configured.'

    try:
        url = f"{SUPABASE_URL}/rest/v1/complaints?telegram_user_id=eq.{telegram_user_id}&select=id,text,status,created_at&order=created_at.desc&limit=5"
        response = http_request(
            url,
            method='GET',
            headers={
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
            },
        )

        if isinstance(response, list) and len(response) > 0:
            message = '📋 *Your Recent Complaints*\n\n'
            for i, complaint in enumerate(response, 1):
                text_preview = complaint.get('text', '')[:50]
                complaint_id = complaint.get('id', 'N/A')[:8]
                status = complaint.get('status', 'N/A')
                message += f"{i}. {text_preview}...\n"
                message += f"   🆔 `{complaint_id}` | {status}\n\n"
            return message
        return 'You have no complaints on record.'
    except Exception as exc:
        log(f'Error getting user complaints: {exc}')
        return f'❌ Error: {exc}'


def queue_failed_message(telegram_user_id: str, chat_id: str, message_text: str, error_message: str) -> None:
    """Queue a failed message for later retry."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        log('Cannot queue failed message: Missing Supabase configuration')
        return

    try:
        url = f"{SUPABASE_URL}/rest/v1/failed_messages"
        failed_data = {
            'telegram_user_id': telegram_user_id,
            'telegram_chat_id': chat_id,
            'message_text': message_text,
            'error_message': error_message,
            'status': 'pending',
        }

        http_request(
            url,
            method='POST',
            headers={
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
                'Content-Type': 'application/json',
            },
            body=failed_data,
        )
        log(f'Failed message queued for user {telegram_user_id}')
    except Exception as exc:
        log(f'Error queuing failed message: {exc}')


def handle_update(update: dict) -> None:
    message = update.get('message') or update.get('edited_message')
    if not message:
        return

    chat = message.get('chat') or {}
    chat_id = chat.get('id')
    if not chat_id:
        return

    # Extract user information
    user = message.get('from') or {}
    user_id = user.get('id')
    username = user.get('username')

    text = message.get('text') or ''
    if not text:
        return

    # Handle /start command
    if text.strip().lower() == '/start':
        welcome_msg = (
            "👋 *Welcome to Lulu Town Council Bot!*\n\n"
            "📝 Send me your complaint with location\n"
            "🔍 /status <ID> - Check complaint\n"
            "📋 /mycomplaints - Your history\n"
            "❓ /help - Show help"
        )
        send_telegram_message(chat_id, welcome_msg)
        return

    # Handle /help command
    if text.strip().lower() == '/help':
        help_msg = (
            "🆘 *Help & Commands*\n\n"
            "*Submit:* Just type your complaint\n"
            "*Check:* /status <ID>\n"
            "*History:* /mycomplaints\n\n"
            "✅ Include location\n"
            "✅ Be specific\n\n"
            "Urgent? Call 6123-4567"
        )
        send_telegram_message(chat_id, help_msg)
        return

    # Handle /status command
    if text.strip().lower().startswith('/status'):
        parts = text.split()
        if len(parts) < 2:
            send_telegram_message(chat_id, '⚠️ Usage: `/status <complaint_id>`')
        else:
            status_msg = check_complaint_status(parts[1])
            send_telegram_message(chat_id, status_msg)
        return

    # Handle /mycomplaints command
    if text.strip().lower() == '/mycomplaints':
        if user_id:
            complaints_msg = get_user_complaints(str(user_id))
            send_telegram_message(chat_id, complaints_msg)
        else:
            send_telegram_message(chat_id, '❌ Unable to identify user.')
        return

    # Handle complaint submission (any other text)
    try:
        send_telegram_message(chat_id, '⏳ Processing...')

        history = build_history(chat_id, text)
        reply = call_review_agent(history)
        store_assistant_reply(chat_id, reply)

        # Only save complaint if agent confirms it's ready to submit
        # Check if agent's response indicates they need more info
        reply_lower = reply.lower()
        is_asking_questions = any(phrase in reply_lower for phrase in [
            'need', 'tell me', 'where', 'when', 'what', 'how', 'please provide',
            'can you', 'could you', 'more details', 'few more', 'i need'
        ])

        if is_asking_questions:
            # Agent is asking for more information, don't save yet
            send_telegram_message(chat_id, reply)
        else:
            # Agent has enough info, save the complaint
            complaint_id = None
            if user_id:
                # Get the full conversation context for the complaint
                full_context = '\n'.join([msg['text'] for msg in history if msg['role'] == 'user'])
                complaint_id = save_complaint_to_supabase(full_context, user_id, username)

            # Build response message
            response_text = f"✅ *Complaint Submitted!*\n\n{reply}\n\n"

            if complaint_id:
                response_text += f"🆔 Complaint ID: `{complaint_id[:8]}`\n\n"
                cluster_complaint(complaint_id)

            response_text += "📱 /status <id>\n📋 /mycomplaints\n\nThank you! 🌟"

            send_telegram_message(chat_id, response_text)

    except Exception as exc:
        log(f'Error handling message: {exc}')

        # Queue failed message for retry
        if user_id:
            queue_failed_message(str(user_id), str(chat_id), text, str(exc))

        error_msg = (
            f"⚠️ *Error*\n\n{str(exc)}\n\n"
            "Your complaint has been queued. Urgent? Call 6123-4567."
        )
        send_telegram_message(chat_id, error_msg)


def main() -> None:
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError('Missing TELEGRAM_BOT_TOKEN in .env.local or environment.')

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.')

    log('Starting Telegram bot long-polling...')
    offset = 0
    while True:
        try:
            updates_url = (
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates"
                f"?timeout={POLL_TIMEOUT}&offset={offset}"
            )
            data = http_request(updates_url, method='GET')
            results = data.get('result') or []
            for update in results:
                update_id = update.get('update_id', 0)
                offset = max(offset, update_id + 1)
                handle_update(update)
        except Exception as exc:
            log(f'Polling error: {exc}')
            time.sleep(2)


if __name__ == '__main__':
    main()
