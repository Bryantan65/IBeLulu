/**
 * Telegram Webhook Handler for IBeLulu Town Council Complaint Bot
 * 
 * v19: Bypass Watson Agent - submit directly to database
 * Watson triage can happen via background process
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/**
 * Submit complaint directly to database (bypass Watson)
 */
async function submitComplaint(supabase: any, complaintText: string, userId: string, username: string): Promise<any> {
  console.log('[Submit] Inserting complaint directly to database...')
  
  const { data, error } = await supabase
    .from('complaints')
    .insert({
      text: complaintText,
      telegram_user_id: userId,
      telegram_username: username,
      status: 'pending_triage',
      source: 'telegram'
    })
    .select()
    .single()
  
  if (error) {
    console.error('[Submit] Error:', error)
    throw new Error(`Database error: ${error.message}`)
  }
  
  console.log('[Submit] ✓ Complaint saved:', data.id)
  return data
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

          // Submit directly to database (bypass Watson for now)
          const complaint = await submitComplaint(supabase, complaintText, userId.toString(), username)
          
          let responseText = '✅ *Complaint Submitted!*\n\n'
          responseText += `🆔 ID: \`${complaint.id.substring(0, 8)}\`\n`
          responseText += `📝 "${complaintText.substring(0, 50)}${complaintText.length > 50 ? '...' : ''}"\n\n`
          responseText += `Status: Pending review\n\n`
          responseText += `📱 /status ${complaint.id.substring(0, 8)}\n📋 /mycomplaints\n\nThank you! 🌟`
          
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
