"""
Telegram Bot Backend for IBeLulu Town Council
Hosted on Railway - handles webhook and Watson integration
"""

import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from supabase import create_client, Client
from jwt_generator import WatsonJWTGenerator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Environment variables
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
WATSON_HOST = os.environ.get('WATSON_HOST', 'https://ap-southeast-1.dl.watson-orchestrate.ibm.com')
WATSON_AGENT_ID = os.environ.get('WATSON_AGENT_ID')
WATSON_AGENT_ENV_ID = os.environ.get('WATSON_AGENT_ENV_ID')
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
WATSON_PRIVATE_KEY = os.environ.get('WATSON_PRIVATE_KEY')
IBM_PUBLIC_KEY = os.environ.get('IBM_PUBLIC_KEY')

# Initialize clients
supabase: Client = None
jwt_generator: WatsonJWTGenerator = None

def init_clients():
    """Initialize Supabase and JWT generator"""
    global supabase, jwt_generator
    
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        logger.info("✅ Supabase client initialized")
    
    if WATSON_PRIVATE_KEY and IBM_PUBLIC_KEY:
        jwt_generator = WatsonJWTGenerator(
            private_key_pem=WATSON_PRIVATE_KEY,
            ibm_public_key_pem=IBM_PUBLIC_KEY
        )
        logger.info("✅ JWT generator initialized")

def send_telegram_message(chat_id: int, text: str, reply_to_message_id: int = None):
    """Send message via Telegram API"""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    if reply_to_message_id:
        payload["reply_to_message_id"] = reply_to_message_id
    
    response = requests.post(url, json=payload)
    return response.json()

def get_watson_jwt(user_id: str, username: str) -> str:
    """Generate JWT token for Watson API"""
    if not jwt_generator:
        raise Exception("JWT generator not initialized")
    
    token = jwt_generator.generate_token(
        user_id=f"telegram-{user_id}",
        user_data={"name": username, "email": f"{user_id}@telegram.bot"},
        context={"source": "telegram", "user_id": user_id}
    )
    logger.info(f"✅ JWT generated for user {user_id}")
    return token

def send_to_watson_agent(jwt: str, message: str) -> dict:
    """Send message to Watson Agent API"""
    url = f"{WATSON_HOST}/api/v1/agents/{WATSON_AGENT_ID}/environments/{WATSON_AGENT_ENV_ID}/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    payload = {
        "messages": [
            {"role": "user", "content": message}
        ]
    }
    
    logger.info(f"📤 Sending to Watson: {url}")
    response = requests.post(url, headers=headers, json=payload)
    
    if not response.ok:
        logger.error(f"❌ Watson error: {response.status_code} - {response.text}")
        raise Exception(f"Watson {response.status_code}: {response.text}")
    
    logger.info("✅ Watson response received")
    return response.json()

def queue_failed_message(telegram_user_id: str, chat_id: str, message_text: str, error_message: str):
    """Save failed message to database for retry"""
    if supabase:
        supabase.table('failed_messages').insert({
            "telegram_user_id": telegram_user_id,
            "telegram_chat_id": chat_id,
            "message_text": message_text,
            "error_message": error_message,
            "status": "pending"
        }).execute()

def check_complaint_status(complaint_id: str) -> str:
    """Check complaint status from database"""
    if not supabase:
        return "❌ Database not available"
    
    response = supabase.table('complaints').select(
        'id, status, category_pred, severity_pred, created_at'
    ).eq('id', complaint_id).single().execute()
    
    if not response.data:
        return "❌ Complaint not found."
    
    data = response.data
    return f"""📋 *Complaint Status*

🆔 `{data['id']}`
📊 Status: *{data['status']}*
📂 Category: {data.get('category_pred') or 'Processing...'}
⚡ Severity: {data.get('severity_pred') or '?'}/5
📅 Submitted: {data['created_at'][:10]}"""

def get_user_complaints(telegram_user_id: str) -> str:
    """Get user's recent complaints"""
    if not supabase:
        return "❌ Database not available"
    
    response = supabase.table('complaints').select(
        'id, text, status, created_at'
    ).eq('telegram_user_id', telegram_user_id).order(
        'created_at', desc=True
    ).limit(5).execute()
    
    if not response.data:
        return "You have no complaints on record."
    
    message = "📋 *Your Recent Complaints*\n\n"
    for i, c in enumerate(response.data, 1):
        text_preview = c['text'][:50] + '...' if len(c['text']) > 50 else c['text']
        message += f"{i}. {text_preview}\n"
        message += f"   🆔 `{c['id'][:8]}` | {c['status']}\n\n"
    
    return message

@app.route('/')
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "service": "IBeLulu Telegram Bot",
        "watson_configured": jwt_generator is not None,
        "supabase_configured": supabase is not None
    })

@app.route('/webhook', methods=['POST'])
def telegram_webhook():
    """Handle incoming Telegram webhook updates"""
    try:
        update = request.get_json()
        
        if 'message' not in update:
            return jsonify({"status": "ok"})
        
        message = update['message']
        chat_id = message['chat']['id']
        message_id = message['message_id']
        user_id = message['from']['id']
        username = message['from'].get('username', 'anonymous')
        text = message.get('text') or message.get('caption') or ''
        
        logger.info(f"📩 Message from {username} ({user_id}): {text[:50]}")
        
        # /start command
        if text.startswith('/start'):
            send_telegram_message(chat_id,
                "👋 *Welcome to Lulu Town Council Bot!*\n\n"
                "📝 Send me your complaint with location\n"
                "🔍 /status <ID> - Check complaint\n"
                "📋 /mycomplaints - Your history\n"
                "❓ /help - Show help",
                message_id
            )
            return jsonify({"status": "ok"})
        
        # /help command
        if text.startswith('/help'):
            send_telegram_message(chat_id,
                "🆘 *Help & Commands*\n\n"
                "*Submit:* Just type your complaint\n"
                "*Check:* /status <ID>\n"
                "*History:* /mycomplaints\n\n"
                "✅ Include location\n"
                "✅ Be specific\n\n"
                "Urgent? Call 6123-4567",
                message_id
            )
            return jsonify({"status": "ok"})
        
        # /status command
        if text.startswith('/status'):
            parts = text.split(' ')
            if len(parts) < 2:
                send_telegram_message(chat_id, "⚠️ Usage: `/status <complaint_id>`", message_id)
            else:
                status_msg = check_complaint_status(parts[1])
                send_telegram_message(chat_id, status_msg, message_id)
            return jsonify({"status": "ok"})
        
        # /mycomplaints command
        if text.startswith('/mycomplaints'):
            complaints = get_user_complaints(str(user_id))
            send_telegram_message(chat_id, complaints, message_id)
            return jsonify({"status": "ok"})
        
        # Submit complaint (any text or /complain)
        if text.startswith('/complain') or not text.startswith('/'):
            complaint_text = text.replace('/complain', '').strip()
            
            if not complaint_text:
                send_telegram_message(chat_id, "📝 Please describe your complaint.", message_id)
                return jsonify({"status": "ok"})
            
            try:
                send_telegram_message(chat_id, "⏳ Processing...", message_id)
                
                # Generate JWT and send to Watson
                jwt = get_watson_jwt(str(user_id), username)
                watson_response = send_to_watson_agent(jwt, complaint_text)
                
                # Extract response
                choices = watson_response.get('choices', [])
                response_text = "✅ *Complaint Submitted!*\n\n"
                
                if choices and choices[0].get('message', {}).get('content'):
                    response_text += choices[0]['message']['content'] + "\n\n"
                
                response_text += "Submitted to Lulu Town Council.\n\n📱 /status <id>\n📋 /mycomplaints\n\nThank you! 🌟"
                
                send_telegram_message(chat_id, response_text, message_id)
                
            except Exception as e:
                logger.error(f"❌ Complaint error: {e}")
                
                # Queue failed message
                queue_failed_message(str(user_id), str(chat_id), complaint_text, str(e))
                
                send_telegram_message(chat_id,
                    f"⚠️ *Error*\n\n{str(e)}\n\nYour complaint has been queued. Urgent? Call 6123-4567.",
                    message_id
                )
            
            return jsonify({"status": "ok"})
        
        return jsonify({"status": "ok"})
        
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 200

@app.route('/set-webhook', methods=['GET'])
def set_webhook():
    """Helper endpoint to set Telegram webhook"""
    webhook_url = request.args.get('url')
    if not webhook_url:
        return jsonify({"error": "Missing 'url' parameter"}), 400
    
    telegram_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook"
    response = requests.post(telegram_url, json={"url": f"{webhook_url}/webhook"})
    return jsonify(response.json())

if __name__ == '__main__':
    init_clients()
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"🚀 Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
