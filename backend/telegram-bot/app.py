import json
import os
import time
import urllib.request
import urllib.parse
from typing import Dict, List, Optional, Set
from datetime import datetime, timezone


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
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
SUPABASE_API_KEY = (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY).strip()

WXO_HOST_URL = os.environ.get('WXO_HOST_URL', 'https://api.ap-southeast-1.dl.watson-orchestrate.ibm.com').strip()
WXO_INSTANCE_ID = os.environ.get('WXO_INSTANCE_ID', '20260126-1332-1571-30ef-acf1a3847d97').strip()
WXO_AGENT_ID = os.environ.get('WXO_AGENT_ID', 'addd6d7a-97ab-44db-8774-30fb15f7a052').strip()

POLL_TIMEOUT = int(os.environ.get('TELEGRAM_POLL_TIMEOUT', '50'))
MAX_HISTORY = int(os.environ.get('WXO_MAX_HISTORY', '12'))
DISPATCH_POLL_INTERVAL = int(os.environ.get('DISPATCH_POLL_INTERVAL', '15'))
DISPATCH_TELEGRAM_USER_ID = os.environ.get('DISPATCH_TELEGRAM_USER_ID', '297484629').strip()
DISPATCH_MEDIA_TELEGRAM_USER_ID = os.environ.get('DISPATCH_MEDIA_TELEGRAM_USER_ID', '836447627').strip()
DISPATCH_LOOKBACK_SECONDS = int(os.environ.get('DISPATCH_LOOKBACK_SECONDS', '3600'))

TOKEN_ENDPOINT = f"{SUPABASE_URL}/functions/v1/watson-token" if SUPABASE_URL else ''

cached_token: Optional[str] = None
token_expiry: Optional[int] = None

history_by_user: Dict[int, List[Dict[str, str]]] = {}
last_dispatch_check: int = int(time.time()) - DISPATCH_LOOKBACK_SECONDS
last_dispatch_poll: float = 0.0
sent_dispatch_ids: Set[str] = set()
last_evidence_check: int = int(time.time()) - DISPATCH_LOOKBACK_SECONDS
sent_evidence_ids: Set[str] = set()


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

    if not TOKEN_ENDPOINT or not SUPABASE_API_KEY:
        raise RuntimeError('Missing SUPABASE_URL or SUPABASE_API_KEY env vars.')

    log('Fetching IBM token via Supabase Edge Function...')
    data = http_request(
        TOKEN_ENDPOINT,
        method='POST',
        headers={
            'Authorization': f'Bearer {SUPABASE_API_KEY}',
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
    try:
        http_request(
            url,
            method='POST',
            headers={'Content-Type': 'application/json'},
            body={'chat_id': chat_id, 'text': text, 'parse_mode': parse_mode},
        )
    except Exception as exc:
        # Telegram often throws 400 if Markdown can't parse entities; retry without formatting.
        log(f'Telegram sendMessage failed ({parse_mode}): {exc}. Retrying without parse_mode.')
        http_request(
            url,
            method='POST',
            headers={'Content-Type': 'application/json'},
            body={'chat_id': chat_id, 'text': text},
        )


def send_telegram_photo(chat_id: int, photo_url: str, caption: Optional[str] = None) -> None:
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
    body = {'chat_id': chat_id, 'photo': photo_url}
    if caption:
        body['caption'] = caption
        body['parse_mode'] = 'Markdown'
    http_request(
        url,
        method='POST',
        headers={'Content-Type': 'application/json'},
        body=body,
    )


def _safe_parse_summary(value: Optional[dict]) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def build_dispatch_message(payload: dict, run_sheet_id: str) -> str:
    team = payload.get('team_name') or 'Field Team'
    date = payload.get('date') or 'Upcoming'
    time_window = payload.get('time_window') or 'N/A'
    tasks = payload.get('tasks') or payload.get('tasks_count') or 'N/A'
    zones = payload.get('zones') or payload.get('zones_covered') or 'N/A'
    capacity = payload.get('capacity_used_percent')
    task_summary = payload.get('task') or payload.get('task_summary') or 'N/A'
    notes = payload.get('notes') or 'N/A'
    capacity_text = f"{capacity}%" if capacity is not None else 'N/A'

    return (
        "🚨 *Dispatch Update*\n\n"
        f"Team: *{team}*\n"
        f"Run Sheet: `{run_sheet_id[:8]}`\n"
        f"Date: {date}\n"
        f"Window: {time_window}\n"
        f"Tasks: {tasks}\n"
        f"Zones: {zones}\n"
        f"Issue: {task_summary}\n"
        f"Notes: {notes}\n"
        f"Capacity used: {capacity_text}\n\n"
        "Please acknowledge and proceed."
    )


def _fetch_json(url: str) -> list:
    return http_request(
        url,
        method='GET',
        headers={
            'apikey': SUPABASE_API_KEY,
            'Authorization': f'Bearer {SUPABASE_API_KEY}',
        },
    )


def fetch_run_sheet_task_summary(run_sheet_id: str) -> str:
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        return ''

    tasks_url = (
        f"{SUPABASE_URL}/rest/v1/run_sheet_tasks?"
        f"select=task_id&run_sheet_id=eq.{run_sheet_id}"
    )
    try:
        task_links = _fetch_json(tasks_url)
    except Exception as exc:
        log(f'Error fetching run_sheet_tasks: {exc}')
        return ''

    if not isinstance(task_links, list) or not task_links:
        return ''

    task_ids = [row.get('task_id') for row in task_links if row.get('task_id')]
    if not task_ids:
        return ''

    task_ids_csv = ','.join(task_ids)
    task_ids_filter = urllib.parse.quote(task_ids_csv, safe=',')
    task_details_url = (
        f"{SUPABASE_URL}/rest/v1/tasks?"
        f"select=id,cluster_id,task_type&id=in.({task_ids_filter})"
    )

    try:
        tasks = _fetch_json(task_details_url)
    except Exception as exc:
        log(f'Error fetching tasks: {exc}')
        return ''

    cluster_ids = list({row.get('cluster_id') for row in tasks if row.get('cluster_id')})
    cluster_map: dict = {}
    if cluster_ids:
        cluster_ids_csv = ','.join(cluster_ids)
        cluster_ids_filter = urllib.parse.quote(cluster_ids_csv, safe=',')
        cluster_url = (
            f"{SUPABASE_URL}/rest/v1/clusters?"
            f"select=id,description,location_label,zone_id,category&id=in.({cluster_ids_filter})"
        )
        try:
            clusters = _fetch_json(cluster_url)
            if isinstance(clusters, list):
                cluster_map = {row.get('id'): row for row in clusters if row.get('id')}
        except Exception as exc:
            log(f'Error fetching clusters: {exc}')

    lines: list[str] = []
    for task in tasks:
        cluster = cluster_map.get(task.get('cluster_id'), {})
        desc = cluster.get('description') or cluster.get('location_label') or cluster.get('zone_id') or 'Unspecified issue'
        category = cluster.get('category') or 'issue'
        task_type = task.get('task_type') or 'task'
        lines.append(f"{category}: {desc} ({task_type})")

    # Deduplicate while preserving order
    seen = set()
    cleaned = []
    for line in lines:
        if line in seen:
            continue
        seen.add(line)
        cleaned.append(line)

    return ' | '.join(cleaned)


def fetch_run_sheet_evidence(run_sheet_id: str) -> List[dict]:
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        return []

    tasks_url = (
        f"{SUPABASE_URL}/rest/v1/run_sheet_tasks?"
        f"select=task_id&run_sheet_id=eq.{run_sheet_id}"
    )
    try:
        task_links = _fetch_json(tasks_url)
    except Exception as exc:
        log(f'Error fetching run_sheet_tasks for evidence: {exc}')
        return []

    if not isinstance(task_links, list) or not task_links:
        return []

    task_ids = [row.get('task_id') for row in task_links if row.get('task_id')]
    if not task_ids:
        return []

    task_ids_csv = ','.join(task_ids)
    task_ids_filter = urllib.parse.quote(task_ids_csv, safe=',')
    evidence_url = (
        f"{SUPABASE_URL}/rest/v1/evidence?"
        f"select=id,task_id,before_image_url,after_image_url,submitted_at"
        f"&task_id=in.({task_ids_filter})"
        f"&order=submitted_at.desc"
        f"&limit=10"
    )

    try:
        evidence_rows = _fetch_json(evidence_url)
    except Exception as exc:
        log(f'Error fetching evidence: {exc}')
        return []

    return evidence_rows if isinstance(evidence_rows, list) else []


def fetch_task_cluster_map(task_ids: List[str]) -> dict:
    if not task_ids or not SUPABASE_URL or not SUPABASE_API_KEY:
        return {}

    task_ids_csv = ','.join(task_ids)
    task_ids_filter = urllib.parse.quote(task_ids_csv, safe=',')
    task_url = (
        f"{SUPABASE_URL}/rest/v1/tasks?"
        f"select=id,cluster_id,task_type&id=in.({task_ids_filter})"
    )
    try:
        tasks = _fetch_json(task_url)
    except Exception as exc:
        log(f'Error fetching tasks for evidence: {exc}')
        return {}

    cluster_ids = list({row.get('cluster_id') for row in tasks if row.get('cluster_id')})
    cluster_map: dict = {}
    if cluster_ids:
        cluster_ids_csv = ','.join(cluster_ids)
        cluster_ids_filter = urllib.parse.quote(cluster_ids_csv, safe=',')
        cluster_url = (
            f"{SUPABASE_URL}/rest/v1/clusters?"
            f"select=id,description,location_label,zone_id,category&id=in.({cluster_ids_filter})"
        )
        try:
            clusters = _fetch_json(cluster_url)
            if isinstance(clusters, list):
                cluster_map = {row.get('id'): row for row in clusters if row.get('id')}
        except Exception as exc:
            log(f'Error fetching clusters for evidence: {exc}')

    task_map = {row.get('id'): row for row in tasks if row.get('id')}
    return {'tasks': task_map, 'clusters': cluster_map}


def poll_evidence_notifications() -> None:
    global last_evidence_check
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        return

    since_iso = datetime.fromtimestamp(last_evidence_check, tz=timezone.utc).isoformat()
    encoded_since = urllib.parse.quote(since_iso, safe='')
    url = (
        f"{SUPABASE_URL}/rest/v1/evidence?"
        f"select=id,task_id,before_image_url,after_image_url,submitted_at,notes"
        f"&submitted_at=gt.{encoded_since}"
        f"&order=submitted_at.asc"
        f"&limit=10"
    )

    try:
        response = http_request(
            url,
            method='GET',
            headers={
                'apikey': SUPABASE_API_KEY,
                'Authorization': f'Bearer {SUPABASE_API_KEY}',
            },
        )
    except Exception as exc:
        log(f'Error polling evidence notifications: {exc}')
        log(f'Evidence polling URL: {url}')
        return

    if not isinstance(response, list) or not response:
        return

    task_ids = [row.get('task_id') for row in response if row.get('task_id')]
    maps = fetch_task_cluster_map(task_ids)
    task_map = maps.get('tasks', {})
    cluster_map = maps.get('clusters', {})

    for row in response:
        evidence_id = row.get('id')
        if not evidence_id or evidence_id in sent_evidence_ids:
            continue

        task_id = row.get('task_id') or ''
        task_info = task_map.get(task_id, {})
        cluster_info = cluster_map.get(task_info.get('cluster_id'), {})
        desc = cluster_info.get('description') or cluster_info.get('location_label') or cluster_info.get('zone_id') or 'Task evidence'
        category = cluster_info.get('category') or 'issue'
        notes = row.get('notes') or 'Verified'

        try:
            chat_id = int(DISPATCH_MEDIA_TELEGRAM_USER_ID)
        except Exception:
            chat_id = 0

        if chat_id:
            header = f"✅ *Verification Complete*\n\nIssue: {category} — {desc}\nNotes: {notes}\n"
            send_telegram_message(chat_id, header)

            before_url = row.get('before_image_url')
            after_url = row.get('after_image_url')
            if before_url:
                caption = f"📸 *Before* (task {str(task_id)[:8]})"
                send_telegram_photo(chat_id, before_url, caption)
            if after_url:
                caption = f"✅ *After* (task {str(task_id)[:8]})"
                send_telegram_photo(chat_id, after_url, caption)

        sent_evidence_ids.add(evidence_id)
        ts = row.get('submitted_at')
        if ts:
            try:
                last_evidence_check = max(
                    last_evidence_check,
                    int(datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()),
                )
            except Exception:
                last_evidence_check = int(time.time())


def poll_dispatch_notifications() -> None:
    global last_dispatch_check
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        return

    since_iso = datetime.fromtimestamp(last_dispatch_check, tz=timezone.utc).isoformat()
    encoded_since = urllib.parse.quote(since_iso, safe='')
    url = (
        f"{SUPABASE_URL}/rest/v1/run_sheets?"
        f"select=id,date,time_window,zones_covered,capacity_used_percent,dispatched_at,task,notes,teams(name)"
        f"&status=eq.dispatched"
        f"&dispatched_at=gt.{encoded_since}"
        f"&order=dispatched_at.asc"
        f"&limit=10"
    )

    try:
        response = http_request(
            url,
            method='GET',
            headers={
                'apikey': SUPABASE_API_KEY,
                'Authorization': f'Bearer {SUPABASE_API_KEY}',
            },
        )
    except Exception as exc:
        log(f'Error polling dispatch notifications: {exc}')
        log(f'Polling URL: {url}')
        return

    if not isinstance(response, list) or not response:
        return

    for entry in response:
        run_sheet_id = entry.get('id')
        if not run_sheet_id:
            continue

        dispatch_id = f"runsheet-{run_sheet_id}"
        if dispatch_id in sent_dispatch_ids:
            continue

        team = entry.get('teams') or {}
        team_name = team.get('name') if isinstance(team, dict) else None
        zones = entry.get('zones_covered') or []
        zones_text = ', '.join(zones) if isinstance(zones, list) and zones else 'N/A'
        task_summary = entry.get('task') or ''
        notes = entry.get('notes') or 'N/A'

        if not task_summary:
            task_summary = fetch_run_sheet_task_summary(str(run_sheet_id))
            if task_summary:
                try:
                    http_request(
                        f"{SUPABASE_URL}/rest/v1/run_sheets?id=eq.{run_sheet_id}",
                        method='PATCH',
                        headers={
                            'apikey': SUPABASE_API_KEY,
                            'Authorization': f'Bearer {SUPABASE_API_KEY}',
                            'Content-Type': 'application/json',
                        },
                        body={'task': task_summary},
                    )
                except Exception as exc:
                    log(f'Error updating run_sheets.task: {exc}')

        payload = {
            'team_name': team_name or 'Field Team',
            'date': entry.get('date'),
            'time_window': entry.get('time_window'),
            'tasks': 'N/A',
            'zones': zones_text,
            'capacity_used_percent': entry.get('capacity_used_percent'),
            'task': task_summary or 'N/A',
            'notes': notes,
        }

        try:
            chat_id = int(DISPATCH_TELEGRAM_USER_ID)
        except Exception:
            chat_id = 0

        if chat_id:
            message = build_dispatch_message(payload, str(run_sheet_id))
            send_telegram_message(chat_id, message)

        sent_dispatch_ids.add(dispatch_id)
        ts = entry.get('dispatched_at')
        if ts:
            try:
                last_dispatch_check = max(
                    last_dispatch_check,
                    int(datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()),
                )
            except Exception:
                last_dispatch_check = int(time.time())


def save_complaint_to_supabase(text: str, telegram_user_id: int, telegram_username: Optional[str]) -> Optional[str]:
    """Save a complaint to the Supabase complaints table and return the complaint ID."""
    if not SUPABASE_URL or not SUPABASE_API_KEY:
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
                'apikey': SUPABASE_API_KEY,
                'Authorization': f'Bearer {SUPABASE_API_KEY}',
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
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        log('Cannot cluster complaint: Missing Supabase configuration')
        return

    try:
        url = f"{SUPABASE_URL}/functions/v1/cluster-complaints"
        http_request(
            url,
            method='POST',
            headers={
                'Authorization': f'Bearer {SUPABASE_API_KEY}',
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
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        return '❌ Database not configured.'

    try:
        url = f"{SUPABASE_URL}/rest/v1/complaints?id=eq.{complaint_id}&select=id,status,category_pred,severity_pred,created_at"
        response = http_request(
            url,
            method='GET',
            headers={
                'apikey': SUPABASE_API_KEY,
                'Authorization': f'Bearer {SUPABASE_API_KEY}',
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
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        return '❌ Database not configured.'

    try:
        url = f"{SUPABASE_URL}/rest/v1/complaints?telegram_user_id=eq.{telegram_user_id}&select=id,text,status,created_at&order=created_at.desc&limit=5"
        response = http_request(
            url,
            method='GET',
            headers={
                'apikey': SUPABASE_API_KEY,
                'Authorization': f'Bearer {SUPABASE_API_KEY}',
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
    if not SUPABASE_URL or not SUPABASE_API_KEY:
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
                'apikey': SUPABASE_API_KEY,
                'Authorization': f'Bearer {SUPABASE_API_KEY}',
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

    # Handle /register command
    if text.strip().lower() == '/register':
        register_msg = (
            "✅ *Registration Complete*\n\n"
            f"Your chat_id is: `{chat_id}`\n\n"
            "Share this ID with the dispatcher if needed."
        )
        send_telegram_message(chat_id, register_msg)
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
    global last_dispatch_poll
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError('Missing TELEGRAM_BOT_TOKEN in .env.local or environment.')

    if not SUPABASE_URL or not SUPABASE_API_KEY:
        raise RuntimeError('Missing SUPABASE_URL or SUPABASE_API_KEY in environment.')

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
            if time.time() - last_dispatch_poll > DISPATCH_POLL_INTERVAL:
                poll_dispatch_notifications()
                poll_evidence_notifications()
                last_dispatch_poll = time.time()
        except Exception as exc:
            log(f'Polling error: {exc}')
            time.sleep(2)


if __name__ == '__main__':
    main()
