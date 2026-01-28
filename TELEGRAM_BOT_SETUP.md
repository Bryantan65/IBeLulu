# 🤖 Telegram Bot Setup Guide - IBeLulu Town Council

## Complete Step-by-Step Setup (15 minutes)

---

## **STEP 1: Run Database Migration** ⏱️ 2 mins

This adds Telegram support to your existing database.

### Using Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/gsbpchneovtpqgnyfttp
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy and paste contents from: `supabase/migrations/add_telegram_support.sql`
5. Click **Run**
6. ✅ Should see: "Telegram support migration completed successfully!"

### Verify Migration:

```sql
-- Check that columns were added
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'complaints' 
  AND column_name IN ('telegram_user_id', 'telegram_username');
  
-- Should return 2 rows
```

---

## **STEP 2: Create Telegram Bot** ⏱️ 3 mins

### 2.1 Open Telegram & Find BotFather

1. Open Telegram app (mobile or desktop)
2. Search for: `@BotFather`
3. Start chat with BotFather

### 2.2 Create New Bot

Send these messages to BotFather:

```
/newbot
```

BotFather will ask for a name. Reply:

```
Lulu Town Council Complaints
```

BotFather will ask for a username. Reply (must end in 'bot'):

```
lulu_complaints_bot
```

Or if taken, try:
```
lulu_council_bot
lulutown_bot
lulu_complaint_helper_bot
```

### 2.3 Save Your Bot Token

BotFather will send you a message like:

```
Done! Congratulations on your new bot...

Use this token to access the HTTP API:
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890

Keep your token secure...
```

**⚠️ IMPORTANT:** Copy this token! You'll need it in Step 3.

### 2.4 Configure Bot Commands (Optional but Recommended)

Send to BotFather:

```
/setcommands
```

Select your bot, then paste:

```
start - Welcome message and introduction
complain - Submit a new complaint
status - Check complaint status
mycomplaints - View your recent complaints
help - Get help and instructions
```

### 2.5 Set Bot Description

```
/setdescription
```

Select your bot, then paste:

```
Submit complaints about litter, cleanliness, and other town council issues. We're here to keep our community clean! 🌟
```

---

## **STEP 3: Deploy Edge Function** ⏱️ 5 mins

### 3.1 Set Environment Variables

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/gsbpchneovtpqgnyfttp
2. Click **Edge Functions** (left sidebar)
3. Click **Manage secrets** (top right)
4. Add these secrets:

| Secret Name | Value | Where to Get It |
|-------------|-------|-----------------|
| `TELEGRAM_BOT_TOKEN` | `1234567890:ABC...` | From BotFather (Step 2.3) |
| `WATSON_HOST` | `https://ap-southeast-1.dl.watson-orchestrate.ibm.com` | Already configured |
| `ORCHESTRATION_ID` | `20260126-1305-0189-1099-b2cf449c589c_20260126-1332-1571-30ef-acf1a3847d97` | From your IBM setup |
| `COMPLAINT_AGENT_ID` | `addd6d7a-97ab-44db-8774-30fb15f7a052` | From MULTI_AGENT_GUIDE.md |
| `COMPLAINT_AGENT_ENV_ID` | `e1af0ec2-0a5c-490a-9ae1-5e3327eb3d0c` | From MULTI_AGENT_GUIDE.md |

**Note:** You said "take it as working" - if any secrets are wrong, that's where errors will come from!

### 3.2 Deploy Edge Function

**Option A: Using Supabase CLI (Recommended)**

```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref gsbpchneovtpqgnyfttp

# Deploy the function
supabase functions deploy telegram-webhook
```

**Option B: Using Supabase Dashboard**

1. Go to **Edge Functions** → **Deploy a new function**
2. Name: `telegram-webhook`
3. Upload file: `supabase/functions/telegram-webhook/index.ts`
4. Click **Deploy**

### 3.3 Verify Deployment

Check that function appears in Edge Functions list as **ACTIVE**.

---

## **STEP 4: Connect Telegram to Your Function** ⏱️ 2 mins

Now tell Telegram where to send messages.

### 4.1 Set Webhook URL

Open terminal and run this command (replace `YOUR_BOT_TOKEN`):

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://gsbpchneovtpqgnyfttp.supabase.co/functions/v1/telegram-webhook"
  }'
```

**Windows PowerShell:**
```powershell
$token = "YOUR_BOT_TOKEN"
$url = "https://gsbpchneovtpqgnyfttp.supabase.co/functions/v1/telegram-webhook"

Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{url=$url} | ConvertTo-Json)
```

### 4.2 Verify Webhook

Check if webhook is set correctly:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

Should return:
```json
{
  "ok": true,
  "result": {
    "url": "https://gsbpchneovtpqgnyfttp.supabase.co/functions/v1/telegram-webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## **STEP 5: Test Your Bot!** ⏱️ 3 mins

### 5.1 Find Your Bot

1. Open Telegram
2. Search for: `@lulu_complaints_bot` (or whatever username you chose)
3. Click **Start**

### 5.2 Test Commands

**Test 1: Start Command**
```
/start
```

Expected response:
```
👋 Welcome to Lulu Town Council Complaint Bot!
...
```

**Test 2: Submit Complaint**
```
There's a lot of litter at Block 123 void deck
```

Expected response:
```
⏳ Processing your complaint...
```

Then:
```
✅ Complaint Submitted!
...
```

**Test 3: Check Status**
```
/mycomplaints
```

Should show your submitted complaint.

### 5.3 Check Database

Go to Supabase Dashboard → **Table Editor** → `complaints`

You should see a new row with:
- `channel` = 'telegram'
- `telegram_user_id` = your Telegram user ID
- `telegram_username` = your @username

---

## **STEP 6: Monitor & Debug** ⏱️ Ongoing

### View Logs

**Supabase Edge Function Logs:**
1. Dashboard → Edge Functions → telegram-webhook
2. Click **Logs** tab
3. See real-time execution logs

**Check Failed Messages Queue:**
```sql
SELECT * FROM failed_messages 
WHERE status = 'pending' 
ORDER BY created_at DESC;
```

### Common Issues & Solutions

#### ❌ Bot doesn't respond

**Check 1:** Is webhook set correctly?
```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

**Check 2:** Are Edge Function secrets set?
- Dashboard → Edge Functions → Manage secrets

**Check 3:** Check function logs for errors
- Dashboard → Edge Functions → telegram-webhook → Logs

#### ❌ "Failed to get JWT"

**Issue:** `watson-token` function not working or secrets missing

**Fix:** 
```bash
# Test watson-token manually
curl -X POST "https://gsbpchneovtpqgnyfttp.supabase.co/functions/v1/watson-token" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test_user"}'
```

**You said "take it as working"** - if this fails, that's the issue!

#### ❌ "Failed to create Watson session"

**Issue:** IBM Watsonx credentials wrong or agent ID incorrect

**Fix:** 
- Check ORCHESTRATION_ID, COMPLAINT_AGENT_ID, COMPLAINT_AGENT_ENV_ID secrets
- Verify JWT signing keys are correct in watson-token function

#### ❌ Message queued (IBM down)

**This is expected!** The bot queues messages when IBM is unavailable.

**To retry failed messages:**
```sql
-- View failed messages
SELECT * FROM failed_messages WHERE status = 'pending';

-- Mark for retry (manual for now)
UPDATE failed_messages 
SET status = 'pending', retry_count = retry_count + 1
WHERE status = 'failed' AND retry_count < max_retries;
```

---

## **STEP 7: Production Checklist** ✅

Before launching to 4,000 users/day:

- [ ] Database migration applied successfully
- [ ] Edge Function deployed and ACTIVE
- [ ] All secrets configured in Supabase
- [ ] Webhook connected to Telegram
- [ ] Test complaint submitted successfully
- [ ] Check complaint appears in database
- [ ] Verify IBM Watsonx integration works
- [ ] Test error handling (send gibberish)
- [ ] Test /status command
- [ ] Test /mycomplaints command
- [ ] Set up monitoring alerts (optional)
- [ ] Add rate limiting (if spam occurs)
- [ ] Document bot username for town council staff

---

## **STEP 8: Enable Photo Support (Later)** 🖼️

When ready to add photos:

1. Uncomment photo handling code in `telegram-webhook/index.ts` (lines ~250-260)
2. Create Supabase Storage bucket:
   ```sql
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('complaint-photos', 'complaint-photos', true);
   ```
3. Update `submit-complaint` Edge Function to accept `photo_url`
4. Deploy updated functions

---

## **Quick Reference**

### Bot Commands
```
/start - Welcome message
/complain - Submit complaint
/status <ID> - Check status
/mycomplaints - Your complaints
/help - Help menu
```

### Important URLs
- Supabase Dashboard: https://supabase.com/dashboard/project/gsbpchneovtpqgnyfttp
- Webhook URL: https://gsbpchneovtpqgnyfttp.supabase.co/functions/v1/telegram-webhook
- Bot: @lulu_complaints_bot (or your chosen username)

### Emergency Contacts
- If IBM Watsonx down → Messages queued automatically
- If bot completely broken → Check Edge Function logs
- Users see friendly error messages and can call hotline

---

## **Cost Breakdown**

| Service | Free Tier | Usage @ 4k/day |
|---------|-----------|----------------|
| Telegram Bot | ✅ Free forever | Free |
| Supabase Edge Functions | 500k invocations/month | ~120k/month = Free |
| Supabase Database | 500MB | ~50MB = Free |
| IBM Watsonx | Pay per request | ~$0.01/request = $40/month |

**Total: ~$40/month** (all Telegram/Supabase components are FREE!)

---

## **Support**

Issues? Check:
1. Edge Function logs in Supabase Dashboard
2. `failed_messages` table for queued complaints
3. Telegram webhook info: `/getWebhookInfo`

**Remember:** You said "take it as working" - so if errors occur, check:
- JWT key files exist and are correct
- IBM Watsonx credentials are valid
- All Supabase secrets are set properly

Good luck! 🚀
