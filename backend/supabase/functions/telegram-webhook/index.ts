/**
 * Telegram Webhook Handler for IBeLulu Town Council Complaint Bot
 * 
 * v18: Using SAME env var names as working ibm-chat function
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
// Try both env var names, with fallback to default
const WATSON_HOST = Deno.env.get('WATSON_HOST') || 'https://ap-southeast-1.dl.watson-orchestrate.ibm.com'
const WATSON_AGENT_ID = Deno.env.get('WATSON_AGENT_ID')!
const WATSON_AGENT_ENV_ID = Deno.env.get('WATSON_AGENT_ENV_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/**
 * Get JWT token from watson-token-internal (RS256 signed, no auth required)
 */
async function getWatsonJWT(userId: string, username: string): Promise<string> {
  console.log('[JWT] Getting token from watson-token-internal...')
  
  const tokenResponse = await fetch(`${SUPABASE_URL}/functions/v1/watson-token-internal`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: `telegram-${userId}`,
      name: username,
      email: `${userId}@telegram.bot`
    })
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    console.error('[JWT] Failed:', errorText)
    throw new Error(`Token failed: ${tokenResponse.status}`)
  }

  const tokenData = await tokenResponse.json()
  console.log('[JWT] ✓ Got token')
  return tokenData.token
}

/**
 * Send message to Watson Agent using AGENT API (same as ibm-chat)
 */
async function sendToWatsonAgent(jwt: string, message: string): Promise<any> {
  console.log('[Watson] Sending via agent API...')
  console.log('[Watson] Agent ID:', WATSON_AGENT_ID)
  console.log('[Watson] Env ID:', WATSON_AGENT_ENV_ID)
  
  // Use AGENT API endpoint (same as working ibm-chat function)
  const url = `${WATSON_HOST}/api/v1/agents/${WATSON_AGENT_ID}/environments/${WATSON_AGENT_ENV_ID}/chat/completions`
  console.log('[Watson] URL:', url)
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      messages: [
        { 
          role: 'user', 
          content: message
        }
      ]
    })
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Watson] Error:', errorText)
    throw new Error(`Watson ${response.status}: ${errorText}`)
  }
  
  console.log('[Watson] ✓ Success')
  return await response.json()
}

async function sendTelegramMessage(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      ...(replyToMessageId && { reply_to_message_id: replyToMessageId })
    })
  })
}

async function queueFailedMessage(supabase: any, telegramUserId: string, chatId: string, messageText: string, errorMessage: string): Promise<void> {
  await supabase.from('failed_messages').insert({
    telegram_user_id: telegramUserId,
    telegram_chat_id: chatId,
    message_text: messageText,
    error_message: errorMessage,
    status: 'pending'
  })
}

async function checkComplaintStatus(supabase: any, complaintId: string): Promise<string> {
  const { data, error } = await supabase
    .from('complaints')
    .select('id, status, category_pred, severity_pred, created_at')
    .eq('id', complaintId)
    .single()
  
  if (error || !data) return '❌ Complaint not found.'
  
  return `📋 *Complaint Status*\n\n🆔 \`${data.id}\`\n📊 Status: *${data.status}*\n📂 Category: ${data.category_pred || 'Processing...'}\n⚡ Severity: ${data.severity_pred || '?'}/5\n📅 Submitted: ${new Date(data.created_at).toLocaleDateString()}`
}

async function getUserComplaints(supabase: any, telegramUserId: string): Promise<string> {
  const { data, error } = await supabase
    .from('complaints')
    .select('id, text, status, created_at')
    .eq('telegram_user_id', telegramUserId)
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (error || !data || data.length === 0) return 'You have no complaints on record.'
  
  let message = '📋 *Your Recent Complaints*\n\n'
  data.forEach((c: any, i: number) => {
    message += `${i + 1}. ${c.text.substring(0, 50)}...\n`
    message += `   🆔 \`${c.id.substring(0, 8)}\` | ${c.status}\n\n`
  })
  return message
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const update = await req.json()
    
    if (update.message) {
      const message = update.message
      const chatId = message.chat.id
      const messageId = message.message_id
      const userId = message.from.id
      const username = message.from.username || 'anonymous'
      const text = message.text || message.caption || ''
      
      // /start
      if (text.startsWith('/start')) {
        await sendTelegramMessage(chatId, 
          `👋 *Welcome to Lulu Town Council Bot!*\n\n📝 Send me your complaint with location\n🔍 /status <ID> - Check complaint\n📋 /mycomplaints - Your history\n❓ /help - Show help`,
          messageId
        )
        return new Response('OK', { status: 200 })
      }
      
      // /help
      if (text.startsWith('/help')) {
        await sendTelegramMessage(chatId,
          `🆘 *Help & Commands*\n\n*Submit:* Just type your complaint\n*Check:* /status <ID>\n*History:* /mycomplaints\n\n✅ Include location\n✅ Be specific\n\nUrgent? Call 6123-4567`,
          messageId
        )
        return new Response('OK', { status: 200 })
      }
      
      // /status
      if (text.startsWith('/status')) {
        const parts = text.split(' ')
        if (parts.length < 2) {
          await sendTelegramMessage(chatId, '⚠️ Usage: `/status <complaint_id>`', messageId)
        } else {
          const statusMsg = await checkComplaintStatus(supabase, parts[1])
          await sendTelegramMessage(chatId, statusMsg, messageId)
        }
        return new Response('OK', { status: 200 })
      }
      
      // /mycomplaints
      if (text.startsWith('/mycomplaints')) {
        const complaints = await getUserComplaints(supabase, userId.toString())
        await sendTelegramMessage(chatId, complaints, messageId)
        return new Response('OK', { status: 200 })
      }
      
      // Submit complaint
      if (text.startsWith('/complain') || (!text.startsWith('/'))) {
        const complaintText = text.replace(/^\/complain\s*/, '').trim()
        
        if (!complaintText) {
          await sendTelegramMessage(chatId, '📝 Please describe your complaint.', messageId)
          return new Response('OK', { status: 200 })
        }
        
        try {
          await sendTelegramMessage(chatId, '⏳ Processing...', messageId)

          const jwt = await getWatsonJWT(userId.toString(), username)
          
          const watsonResponse = await sendToWatsonAgent(jwt, complaintText)
          
          const choices = watsonResponse.choices || []
          let responseText = '✅ *Complaint Submitted!*\n\n'

          if (choices.length > 0 && choices[0].message?.content) {
            responseText += choices[0].message.content + '\n\n'
          }
          
          responseText += `Submitted to Lulu Town Council.\n\n📱 /status <id>\n📋 /mycomplaints\n\nThank you! 🌟`
          
          await sendTelegramMessage(chatId, responseText, messageId)
          
        } catch (error: any) {
          console.error('[Complaint] Error:', error)
          
          await queueFailedMessage(supabase, userId.toString(), chatId.toString(), complaintText, error.message)
          
          await sendTelegramMessage(chatId,
            `⚠️ *Error*\n\n${error.message}\n\nYour complaint has been queued. Urgent? Call 6123-4567.`,
            messageId
          )
        }
        
        return new Response('OK', { status: 200 })
      }
    }
    
    return new Response('OK', { status: 200 })
    
  } catch (error: any) {
    console.error('[Webhook] Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 200 })
  }
})
