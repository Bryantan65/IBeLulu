# Python Telegram Bot for IBeLulu Town Council

This folder contains the **Python backend** for the Telegram bot, using **polling** instead of webhooks.

## ✅ Advantages Over Webhooks

1. **Easier Local Development** - Run on your laptop, no HTTPS needed
2. **Simpler Debugging** - See logs in real-time in your terminal
3. **More Control** - Full Python ecosystem for customization
4. **Better Error Handling** - Retry logic, better exception handling
5. **No Edge Function Limits** - Run anywhere (your PC, VPS, cloud)

## 📋 Current Setup (Webhook-based)

Your current setup uses:
- **Supabase Edge Functions** (TypeScript/Deno)
- **Webhooks** - Telegram sends messages to your Edge Function URL
- Deployed at: `https://gsbpchneovtpqgnyfttp.supabase.co/functions/v1/telegram-webhook`

**Pros**: Serverless, auto-scaling
**Cons**: Harder to debug, limited customization, cold starts

## 🆕 New Setup (Polling-based Python)

This Python bot uses:
- **Polling** - Bot continuously asks Telegram "any new messages?"
- **Local or Cloud** - Run anywhere you want
- **Full Python** - Easy to customize, add features, debug

## 🚀 Quick Start

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Copy the example file:
```bash
cp .env.example .env
```

Edit `.env` and fill in your values:
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
IBM_API_KEY=your_ibm_api_key
COMPLAINT_AGENT_ID=your_agent_id
COMPLAINT_AGENT_ENV_ID=your_env_id
SUPABASE_URL=https://gsbpchneovtpqgnyfttp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Disable Webhook (Important!)

Before running the polling bot, you must disable the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook"
```

Or use Python:
```python
import requests
token = "YOUR_BOT_TOKEN"
requests.post(f"https://api.telegram.org/bot{token}/deleteWebhook")
```

### 4. Run the Bot

```bash
python telegram_bot.py
```

You should see:
```
2026-01-28 12:34:56 - __main__ - INFO - 🤖 Bot started! Press Ctrl+C to stop.
```

### 5. Test It!

Open Telegram and send:
```
/start
```

You should see the welcome message!

## 🔧 How It Works

### Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Telegram  │ ◄─────► │  Python Bot  │ ◄─────► │ IBM Watsonx │
│   Servers   │  Polling│  (Local/VPS) │   JWT   │  Orchestrate│
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │   Supabase   │
                        │   Database   │
                        └──────────────┘
```

### Code Flow

1. **Bot polls Telegram** every few seconds for new messages
2. **Receives message** → Checks if it's a command or complaint
3. **Get IBM JWT** → Calls `get_watson_jwt()` (same as your edge function)
4. **Send to Watson** → Forwards complaint to IBM Watsonx Agent
5. **Watson processes** → Agent analyzes complaint, calls `submit-complaint` edge function
6. **Reply to user** → Sends confirmation message back

### Key Functions

- `get_watson_jwt()` - Gets JWT from IBM (same logic as your edge function)
- `send_to_watson_agent()` - Sends complaint to Watson
- `process_complaint()` - Main complaint handling logic
- `queue_failed_message()` - Saves failed messages to Supabase

## 🎨 Easy Customization Examples

### Add Photo Support

```python
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle photos with captions"""
    photo = update.message.photo[-1]  # Highest quality
    caption = update.message.caption or "No description"
    
    # Download photo
    file = await context.bot.get_file(photo.file_id)
    photo_bytes = await file.download_as_bytearray()
    
    # Upload to Supabase Storage
    storage_path = f"complaints/{update.message.from_user.id}/{photo.file_id}.jpg"
    supabase.storage.from_('complaint-photos').upload(storage_path, photo_bytes)
    
    # Process complaint with photo URL
    photo_url = supabase.storage.from_('complaint-photos').get_public_url(storage_path)
    await process_complaint(update, caption, photo_url=photo_url)

# Add handler
application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
```

### Add Multi-Language Support

```python
MESSAGES = {
    'en': {
        'welcome': '👋 Welcome to Lulu Town Council!',
        'processing': '⏳ Processing your complaint...',
        'success': '✅ Complaint submitted!'
    },
    'zh': {
        'welcome': '👋 欢迎来到Lulu镇议会！',
        'processing': '⏳ 正在处理您的投诉...',
        'success': '✅ 投诉已提交！'
    }
}

def get_message(user_language: str, key: str) -> str:
    lang = user_language if user_language in MESSAGES else 'en'
    return MESSAGES[lang].get(key, MESSAGES['en'][key])
```

### Add Admin Commands

```python
ADMIN_USER_IDS = [123456789, 987654321]  # Your admin IDs

async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show complaint statistics (admin only)"""
    if update.message.from_user.id not in ADMIN_USER_IDS:
        await update.message.reply_text("⛔ Admin only!")
        return
    
    # Get stats from database
    total = supabase.table('complaints').select('*', count='exact').execute()
    pending = supabase.table('complaints').select('*', count='exact').eq('status', 'pending').execute()
    
    await update.message.reply_text(
        f"📊 *Statistics*\n\n"
        f"Total complaints: {total.count}\n"
        f"Pending: {pending.count}",
        parse_mode=ParseMode.MARKDOWN
    )

application.add_handler(CommandHandler("stats", stats_command))
```

## 🐛 Debugging Tips

### See Full Logs

Change logging level:
```python
logging.basicConfig(level=logging.DEBUG)  # Very detailed
```

### Test Without Telegram

```python
# Create a test complaint
if __name__ == '__main__':
    # Test IBM connection
    try:
        jwt = get_watson_jwt()
        print(f"✓ Got JWT: {jwt[:50]}...")
        
        result = send_to_watson_agent(jwt, "Test complaint", {})
        print(f"✓ Watson response: {result}")
    except Exception as e:
        print(f"✗ Error: {e}")
```

### Add Breakpoints

```python
async def process_complaint(update: Update, complaint_text: str):
    import pdb; pdb.set_trace()  # Debugger will pause here
    # ... rest of code
```

## 🚀 Deployment Options

### Option 1: Your Laptop (Development)

Just run:
```bash
python telegram_bot.py
```

Keep terminal open. Bot runs until you Ctrl+C.

### Option 2: Cloud VPS (Production)

**Railway.app** (Free tier):
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Deploy
railway init
railway up
```

**Heroku**:
```bash
# Create Procfile
echo "worker: python telegram_bot.py" > Procfile

# Deploy
heroku create ibelulu-bot
git push heroku main
heroku ps:scale worker=1
```

### Option 3: Systemd Service (Linux VPS)

Create `/etc/systemd/system/telegram-bot.service`:
```ini
[Unit]
Description=IBeLulu Telegram Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/IBeLulu/backend
Environment="PATH=/home/your-user/.local/bin:/usr/bin"
ExecStart=/usr/bin/python3 telegram_bot.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Start:
```bash
sudo systemctl enable telegram-bot
sudo systemctl start telegram-bot
sudo systemctl status telegram-bot
```

## 🔄 Migration from Webhook

### Step 1: Keep Webhook Running

Your webhook still works! No rush to migrate.

### Step 2: Test Python Bot Locally

1. Delete webhook temporarily
2. Run Python bot
3. Test everything works
4. If issues, re-enable webhook

### Step 3: Decide

**Keep Webhook** if:
- You like serverless
- Don't need heavy customization
- Want auto-scaling

**Switch to Python** if:
- Need easier debugging
- Want more control
- Plan to add complex features
- Want to run locally

## 📚 Next Steps

1. **Read the code** - `telegram_bot.py` is well-commented
2. **Test locally** - Run it on your laptop first
3. **Customize** - Add features you need
4. **Deploy** - Pick a deployment option above

## 🆘 Troubleshooting

### "Conflict: terminated by other getUpdates request"

You have both webhook AND polling running!
```bash
# Delete webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

### "No module named 'telegram'"

```bash
pip install -r requirements.txt
```

### "Missing required environment variables"

Check your `.env` file has all values filled in.

### Bot doesn't respond

1. Check bot is running (`python telegram_bot.py`)
2. Check logs for errors
3. Verify environment variables
4. Test `/start` command first

## 📞 Support

- Check logs: `tail -f telegram_bot.log`
- Test IBM auth: Run the test script above
- Verify Supabase: Check Edge Functions logs
- Ask your colleague! They suggested Python for a reason 😊
