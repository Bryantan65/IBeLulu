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


def send_telegram_message(chat_id: int, text: str) -> None:
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    http_request(
        url,
        method='POST',
        headers={'Content-Type': 'application/json'},
        body={'chat_id': chat_id, 'text': text},
    )


def handle_update(update: dict) -> None:
    message = update.get('message') or update.get('edited_message')
    if not message:
        return

    chat = message.get('chat') or {}
    chat_id = chat.get('id')
    if not chat_id:
        return

    text = message.get('text') or ''
    if not text:
        return

    if text.strip().lower() == '/start':
        send_telegram_message(chat_id, "Hello! Tell me about the issue and I'll file a report.")
        return

    try:
        history = build_history(chat_id, text)
        reply = call_review_agent(history)
        store_assistant_reply(chat_id, reply)
        send_telegram_message(chat_id, reply)
    except Exception as exc:
        log(f'Error handling message: {exc}')
        send_telegram_message(chat_id, "Sorry, I'm having trouble processing that right now.")


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
