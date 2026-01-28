# IBeLulu Telegram Bot - Python Backend

Telegram bot for IBeLulu Town Council complaint system, hosted on Railway.

## Features

- 📝 Submit complaints via Telegram
- 🤖 Watson Orchestrate AI triage
- 📊 Check complaint status
- 📋 View complaint history

## Deployment to Railway

### 1. Push to GitHub

```bash
git add .
git commit -m "Add Telegram bot Python backend"
git push origin main
```

### 2. Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `IBeLulu` repository
5. Set the root directory to `backend/telegram-bot`

### 3. Set Environment Variables

In Railway dashboard, add these variables:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `WATSON_HOST` | `https://ap-southeast-1.dl.watson-orchestrate.ibm.com` |
| `WATSON_AGENT_ID` | Your Watson agent ID |
| `WATSON_AGENT_ENV_ID` | Your Watson agent environment ID |
| `WATSON_PRIVATE_KEY` | Full PEM private key (with headers) |
| `IBM_PUBLIC_KEY` | Full PEM IBM public key (with headers) |
| `SUPABASE_URL` | `https://gsbpchneovtpqgnyfttp.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |

### 4. Deploy

Railway will auto-deploy when you push to GitHub.

### 5. Set Telegram Webhook

After deployment, get your Railway URL (e.g., `https://your-app.up.railway.app`)

Option A - Use the helper endpoint:
```
https://your-app.up.railway.app/set-webhook?url=https://your-app.up.railway.app
```

Option B - Use curl:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.up.railway.app/webhook"}'
```

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Run locally
python app.py

# Use ngrok for local webhook testing
ngrok http 5000
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | Show help |
| `/status <id>` | Check complaint status |
| `/mycomplaints` | View your complaints |
| `/complain <text>` | Submit complaint |
| `<any text>` | Submit complaint |

## Troubleshooting

### 401 Authorization Error from Watson
- Check that `WATSON_PRIVATE_KEY` and `IBM_PUBLIC_KEY` are correct
- Ensure keys include `-----BEGIN...-----` and `-----END...-----` headers
- Verify `WATSON_AGENT_ID` and `WATSON_AGENT_ENV_ID` are correct

### Webhook not receiving messages
- Verify webhook is set: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Check Railway logs for errors
- Ensure HTTPS URL (Railway provides this automatically)

### Database errors
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Verify the `complaints` and `failed_messages` tables exist
