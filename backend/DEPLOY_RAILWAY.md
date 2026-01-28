# Deploy IBeLulu Telegram Bot to Railway.app

**Railway.app** is perfect for Telegram polling bots - it keeps them running 24/7.

## ☁️ Why Railway?

- ✅ **FREE tier** (500 execution hours/month = ~20 days running 24/7)
- ✅ **Always running** (no cold starts, no timeouts)
- ✅ **One-click deploy** from GitHub
- ✅ **Easy logs** (see your bot in action)
- ✅ **Automatic restarts** if bot crashes

## 🚀 Quick Deploy (5 minutes)

### Step 1: Create Railway Account

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Sign in with GitHub

### Step 2: Deploy from GitHub

```bash
# 1. Push your code to GitHub
git add backend/
git commit -m "Add Python Telegram bot"
git push origin main

# 2. In Railway dashboard:
# - Click "New Project"
# - Choose "Deploy from GitHub repo"
# - Select your IBeLulu repo
# - Set root directory: /backend
```

### Step 3: Configure Environment Variables

In Railway dashboard:
1. Click your project → **Variables**
2. Add these variables:

```
TELEGRAM_BOT_TOKEN=your_bot_token
IBM_API_KEY=your_ibm_api_key
WATSON_HOST=https://ap-southeast-1.dl.watson-orchestrate.ibm.com
COMPLAINT_AGENT_ID=your_agent_id
COMPLAINT_AGENT_ENV_ID=your_env_id
SUPABASE_URL=https://gsbpchneovtpqgnyfttp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Step 4: Configure Deployment

Railway auto-detects Python! But you need to tell it how to start:

Create `backend/railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "python telegram_bot.py",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Step 5: Deploy!

Railway will automatically:
1. Install dependencies from `requirements.txt`
2. Run `python telegram_bot.py`
3. Keep it running 24/7

## 📊 Monitor Your Bot

In Railway dashboard:
- **Deployments** - See deploy history
- **Metrics** - CPU, memory usage
- **Logs** - Real-time bot logs (same as local!)

## 💰 Cost

**FREE tier includes:**
- 500 hours execution/month
- $5 credit
- Good for small bots

**Paid ($5/month after free credit):**
- Unlimited hours
- Better resources

## 🔧 Before Deploying - IMPORTANT!

### Delete Telegram Webhook

Before Railway starts your polling bot:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook"
```

Otherwise you'll get "Conflict: terminated by other getUpdates request"

### Stop Supabase telegram-webhook Edge Function

You can't have both webhook AND polling running!

Option 1: Delete the edge function
Option 2: Just delete the webhook (keeps function but it won't be called)

## 🎯 Alternative: Render.com

If you prefer Render:

1. Go to https://render.com
2. Click "New +"
3. Choose "Background Worker"
4. Connect GitHub repo
5. Set:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python telegram_bot.py`
6. Add environment variables
7. Deploy!

**Render FREE tier is better** - no hour limits, but may sleep after 15 min inactivity.

## 🎯 Alternative: Fly.io

If you prefer Fly.io:

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Deploy
cd backend
flyctl launch

# Set environment variables
flyctl secrets set TELEGRAM_BOT_TOKEN=your_token
flyctl secrets set IBM_API_KEY=your_key
# ... set all other variables

# Deploy
flyctl deploy
```

## ⚡ Quick Comparison

| Platform | Free Tier | Setup Difficulty | Best For |
|----------|-----------|------------------|----------|
| **Railway** | 500hrs/month | ⭐ Easiest | Quick start |
| **Render** | Unlimited | ⭐⭐ Easy | Always-on free |
| **Fly.io** | 3 small VMs | ⭐⭐⭐ Medium | Full control |
| **Vercel** | ❌ Not supported | - | Won't work! |
| **Heroku** | ❌ No free tier | - | Costs $$ |

## 🆘 Troubleshooting

### "Conflict: terminated by other getUpdates"
You forgot to delete webhook:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

### Bot stops after deployment
Check Railway logs - probably missing environment variable.

### "Application failed to respond"
This is OK for polling bots! They don't respond to HTTP, they run continuously.

## 📝 Deployment Checklist

- [ ] Push code to GitHub
- [ ] Delete Telegram webhook
- [ ] Stop/remove Supabase telegram-webhook edge function
- [ ] Create Railway account
- [ ] Deploy from GitHub
- [ ] Add all environment variables
- [ ] Check logs - should see "🤖 Bot started!"
- [ ] Test bot in Telegram

## 🎉 Done!

Your bot will now run 24/7 on Railway (or your chosen platform).

You can still:
- ✅ See logs in real-time
- ✅ Push updates via GitHub (auto-deploys)
- ✅ Keep all debugging benefits
- ✅ No local machine needed!
