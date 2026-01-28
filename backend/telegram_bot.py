"""
Telegram Bot for IBeLulu Town Council - Python Backend
Uses polling instead of webhooks for easier local development and customization.

Features:
- Multi-language support via IBM Watsonx
- Complaint submission & tracking
- Status checking
- Error handling & retry queue
- Local development friendly

Requirements:
    pip install python-telegram-bot supabase requests python-dotenv
"""

import os
import logging
import json
from datetime import datetime
from typing import Optional, Dict, Any

import requests
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters
)
from telegram.constants import ParseMode
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
WATSON_HOST = os.getenv('WATSON_HOST', 'https://ap-southeast-1.dl.watson-orchestrate.ibm.com')
COMPLAINT_AGENT_ID = os.getenv('COMPLAINT_AGENT_ID')
COMPLAINT_AGENT_ENV_ID = os.getenv('COMPLAINT_AGENT_ENV_ID')
IBM_API_KEY = os.getenv('IBM_API_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ============================================================================
# IBM WATSONX INTEGRATION
# ============================================================================

def get_watson_jwt() -> str:
    """
    Get JWT token from IBM Auth API
    Same logic as your watson-token edge function
    """
    try:
        logger.info("[IBM Auth] Exchanging API key for token...")
        
        response = requests.post(
            'https://iam.platform.saas.ibm.com/siusermgr/api/1.0/apikeys/token',
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            json={'apikey': IBM_API_KEY}
        )
        
        if not response.ok:
            logger.error(f"[IBM Auth] Error: {response.status_code} - {response.text}")
            raise Exception(f"IBM Auth Failed: {response.status_code}")
        
        data = response.json()
        token = data.get('token') or data.get('access_token') or data.get('accessToken')
        
        if not token:
            raise Exception(f"No token in IBM response: {data}")
        
        logger.info("[IBM Auth] ✓ Successfully got token")
        return token
        
    except Exception as e:
        logger.error(f"[IBM Auth] Failed: {e}")
        raise


def send_to_watson_agent(jwt: str, message: str, metadata: Dict[str, Any]) -> Dict:
    """
    Send message to IBM Watsonx Complaint Agent
    """
    try:
        logger.info("[Watson Agent] Sending message...")
        
        url = f"{WATSON_HOST}/api/v1/agents/{COMPLAINT_AGENT_ID}/environments/{COMPLAINT_AGENT_ENV_ID}/chat/completions"
        
        payload = {
            'messages': [
                {
                    'role': 'user',
                    'content': message
                }
            ]
        }
        
        if metadata:
            payload['context'] = metadata
        
        response = requests.post(
            url,
            headers={
                'Authorization': f'Bearer {jwt}',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            json=payload
        )
        
        logger.info(f"[Watson Agent] Response status: {response.status_code}")
        
        if not response.ok:
            logger.error(f"[Watson Agent] Error: {response.text}")
            raise Exception(f"Watson Agent returned {response.status_code}: {response.text}")
        
        result = response.json()
        logger.info("[Watson Agent] ✓ Success")
        return result
        
    except Exception as e:
        logger.error(f"[Watson Agent] Failed: {e}")
        raise

# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

def queue_failed_message(user_id: str, chat_id: str, message_text: str, error: str):
    """Queue failed message for retry"""
    try:
        supabase.table('failed_messages').insert({
            'telegram_user_id': user_id,
            'telegram_chat_id': chat_id,
            'message_text': message_text,
            'error_message': error,
            'status': 'pending'
        }).execute()
        logger.info(f"Queued failed message for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to queue message: {e}")


def get_complaint_status(complaint_id: str) -> Optional[Dict]:
    """Get complaint status by ID"""
    try:
        response = supabase.table('complaints') \
            .select('id, status, category_pred, severity_pred, created_at') \
            .eq('id', complaint_id) \
            .single() \
            .execute()
        return response.data
    except Exception as e:
        logger.error(f"Failed to get complaint status: {e}")
        return None


def get_user_complaints(user_id: str, limit: int = 5) -> list:
    """Get user's recent complaints"""
    try:
        response = supabase.table('complaints') \
            .select('id, text, status, created_at') \
            .eq('telegram_user_id', user_id) \
            .order('created_at', desc=True) \
            .limit(limit) \
            .execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Failed to get user complaints: {e}")
        return []

# ============================================================================
# TELEGRAM BOT HANDLERS
# ============================================================================

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    await update.message.reply_text(
        "👋 *Welcome to Lulu Town Council Complaint Bot!*\n\n"
        "I help you submit complaints about litter, cleanliness, and other town council issues.\n\n"
        "*How to use:*\n"
        "📝 Just send me your complaint with location details\n"
        "📷 You can attach photos (coming soon!)\n"
        "📍 Send location pin for exact coordinates\n\n"
        "*Commands:*\n"
        "/complain - Submit a new complaint\n"
        "/status <ID> - Check complaint status\n"
        "/mycomplaints - View your recent complaints\n"
        "/help - Show this message\n\n"
        "Let's keep our community clean! 🌟",
        parse_mode=ParseMode.MARKDOWN
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command"""
    await update.message.reply_text(
        "🆘 *Help & Commands*\n\n"
        "*Submit a complaint:*\n"
        "Just type your complaint naturally, like:\n"
        '"There\'s a lot of litter at Block 123 void deck"\n\n'
        "*Commands:*\n"
        "/complain - Start complaint submission\n"
        "/status <ID> - Check status (e.g., /status abc123)\n"
        "/mycomplaints - Your complaint history\n"
        "/help - Show this help\n\n"
        "*Tips:*\n"
        "✅ Include block number or location\n"
        "✅ Be specific about the issue\n"
        "✅ Mention any safety hazards\n\n"
        "Need urgent help? Call 6123-4567",
        parse_mode=ParseMode.MARKDOWN
    )


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /status command"""
    if not context.args:
        await update.message.reply_text(
            "⚠️ Please provide a complaint ID\n\n"
            "Usage: `/status <complaint_id>`",
            parse_mode=ParseMode.MARKDOWN
        )
        return
    
    complaint_id = context.args[0]
    complaint = get_complaint_status(complaint_id)
    
    if not complaint:
        await update.message.reply_text("❌ Complaint not found. Please check your reference ID.")
        return
    
    created_date = datetime.fromisoformat(complaint['created_at'].replace('Z', '+00:00'))
    
    await update.message.reply_text(
        f"📋 *Complaint Status*\n\n"
        f"🆔 Reference: `{complaint['id']}`\n"
        f"📊 Status: *{complaint['status']}*\n"
        f"📂 Category: {complaint.get('category_pred', 'Processing...')}\n"
        f"⚡ Severity: {complaint.get('severity_pred', '?')}/5\n"
        f"📅 Submitted: {created_date.strftime('%Y-%m-%d')}\n\n"
        f"Your complaint is being processed by our team.",
        parse_mode=ParseMode.MARKDOWN
    )


async def mycomplaints_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /mycomplaints command"""
    user_id = str(update.message.from_user.id)
    complaints = get_user_complaints(user_id)
    
    if not complaints:
        await update.message.reply_text("You have no complaints on record.")
        return
    
    message = "📋 *Your Recent Complaints*\n\n"
    for i, complaint in enumerate(complaints, 1):
        text_preview = complaint['text'][:50] + "..." if len(complaint['text']) > 50 else complaint['text']
        message += f"{i}. {text_preview}\n"
        message += f"   🆔 `{complaint['id'][:8]}` | Status: {complaint['status']}\n\n"
    
    await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN)


async def complain_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /complain command"""
    # Extract complaint text after /complain
    complaint_text = update.message.text.replace('/complain', '').strip()
    
    if not complaint_text:
        await update.message.reply_text(
            "📝 Please describe your complaint.\n\n"
            'Example: "There is a dead rat at Block 456 void deck"'
        )
        return
    
    # Process complaint
    await process_complaint(update, complaint_text)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle regular text messages as complaints"""
    complaint_text = update.message.text.strip()
    
    if not complaint_text:
        await update.message.reply_text("Please send a valid complaint message.")
        return
    
    await process_complaint(update, complaint_text)


async def process_complaint(update: Update, complaint_text: str):
    """
    Process complaint submission
    This is the core logic that sends to IBM Watsonx
    """
    user = update.message.from_user
    chat_id = update.message.chat_id
    
    try:
        logger.info(f"[Complaint] Processing from user {user.id}: {complaint_text}")
        
        # 1. Send processing message
        await update.message.reply_text("⏳ Processing your complaint...")
        
        # 2. Get JWT token from IBM
        jwt = get_watson_jwt()
        
        # 3. Prepare metadata
        metadata = {
            'source': 'telegram',
            'telegram_user_id': str(user.id),
            'telegram_username': user.username or 'anonymous',
            'channel': 'telegram'
        }
        
        # 4. Send to Watson Agent
        watson_response = send_to_watson_agent(jwt, complaint_text, metadata)
        
        # 5. Extract response
        choices = watson_response.get('choices', [])
        response_text = "✅ *Complaint Submitted!*\n\n"
        
        # Extract triage info if available
        if choices and choices[0].get('message', {}).get('content'):
            content = choices[0]['message']['content']
            if 'Category:' in content:
                response_text += content + "\n\n"
        
        response_text += (
            "Your complaint has been submitted to Lulu Town Council.\n\n"
            "📱 Track with: /status <your_id>\n"
            "📋 View all: /mycomplaints\n\n"
            "Thank you for helping keep our community clean! 🌟"
        )
        
        await update.message.reply_text(response_text, parse_mode=ParseMode.MARKDOWN)
        
    except Exception as e:
        logger.error(f"[Complaint] Processing failed: {e}")
        
        # Queue for retry
        queue_failed_message(
            str(user.id),
            str(chat_id),
            complaint_text,
            str(e)
        )
        
        # Send error message
        await update.message.reply_text(
            f"⚠️ *Error Processing Complaint*\n\n"
            f"Details: {str(e)}\n\n"
            f"Your complaint has been queued for manual review.\n\n"
            f"For urgent issues, call 6123-4567.",
            parse_mode=ParseMode.MARKDOWN
        )


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle errors"""
    logger.error(f"Update {update} caused error {context.error}")


# ============================================================================
# MAIN APPLICATION
# ============================================================================

def main():
    """Run the bot"""
    # Validate required environment variables
    required_vars = [
        'TELEGRAM_BOT_TOKEN',
        'IBM_API_KEY',
        'COMPLAINT_AGENT_ID',
        'COMPLAINT_AGENT_ENV_ID',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY'
    ]
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
        logger.error("Please set them in your .env file")
        return
    
    # Create application
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    
    # Add command handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("status", status_command))
    application.add_handler(CommandHandler("mycomplaints", mycomplaints_command))
    application.add_handler(CommandHandler("complain", complain_command))
    
    # Add message handler for regular messages (treated as complaints)
    application.add_handler(MessageHandler(
        filters.TEXT & ~filters.COMMAND,
        handle_message
    ))
    
    # Add error handler
    application.add_error_handler(error_handler)
    
    # Start bot
    logger.info("🤖 Bot started! Press Ctrl+C to stop.")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
