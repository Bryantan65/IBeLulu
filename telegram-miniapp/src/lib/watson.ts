// Server-side Watson Orchestrate agent utility
// Mirrors the call_review_agent pattern from backend/telegram-bot/app.py

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './supabase'

const WXO_HOST_URL = process.env.WXO_HOST_URL || 'https://api.ap-southeast-1.dl.watson-orchestrate.ibm.com'
const WXO_INSTANCE_ID = process.env.WXO_INSTANCE_ID || '20260126-1332-1571-30ef-acf1a3847d97'
const WXO_AGENT_ID = process.env.WXO_AGENT_ID || 'addd6d7a-97ab-44db-8774-30fb15f7a052'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

// Token cache
let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get a valid IBM token via the Supabase watson-token edge function.
 * Caches with a 5-minute buffer before expiry.
 */
async function getWatsonToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && now < tokenExpiry - 300) {
    return cachedToken
  }

  const endpoint = `${SUPABASE_URL}/functions/v1/watson-token`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    throw new Error(`Failed to get Watson token: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const token = data.token
  const expiresAt = data.expires_at

  if (!token) {
    throw new Error('No token in watson-token response')
  }

  cachedToken = token
  tokenExpiry = expiresAt ? Number(expiresAt) : now + 3600
  return cachedToken!
}

/**
 * Call the Watson Orchestrate Complaints agent with conversation history.
 * Returns the assistant's text reply.
 */
export async function callComplaintAgent(messages: ChatMessage[]): Promise<string> {
  const token = await getWatsonToken()
  const url = `${WXO_HOST_URL}/instances/${WXO_INSTANCE_ID}/v1/orchestrate/${WXO_AGENT_ID}/chat/completions`

  const apiMessages = messages.map((msg) => ({
    role: msg.role,
    content: [{ response_type: 'text', text: msg.text }],
  }))

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      stream: false,
      messages: apiMessages,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Watson agent error: ${res.status} ${errText}`)
  }

  const data = await res.json()
  const choices = data.choices || []

  if (choices.length > 0) {
    const message = choices[0].message || {}
    const content = message.content

    if (typeof content === 'string') return content
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0]
      if (typeof first === 'object' && 'text' in first) return String(first.text)
    }
  }

  return 'No response received from agent.'
}

/**
 * Heuristic: check if the agent reply is asking a follow-up question
 * (same keywords as the Telegram bot uses).
 */
export function isAgentAskingFollowUp(reply: string): boolean {
  const lower = reply.toLowerCase()
  const phrases = [
    'need', 'tell me', 'where', 'when', 'what', 'how', 'please provide',
    'can you', 'could you', 'more details', 'few more', 'i need',
  ]
  return phrases.some((phrase) => lower.includes(phrase))
}

/**
 * Find the most recent complaint without a telegram_user_id (just created by the Watson agent)
 * and link the Telegram user to it. Same logic as link_telegram_to_complaint() in app.py.
 */
export async function linkTelegramToComplaint(
  telegramUserId: string,
  telegramUsername: string,
): Promise<{ id: string } | null> {
  const since = new Date(Date.now() - 60_000).toISOString()

  // Find the most recent orphaned complaint
  const findRes = await fetch(
    `${SUPABASE_URL}/rest/v1/complaints?` +
    `select=id,status` +
    `&telegram_user_id=is.null` +
    `&created_at=gt.${encodeURIComponent(since)}` +
    `&order=created_at.desc` +
    `&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )

  if (!findRes.ok) {
    console.error('[watson] Failed to find orphaned complaint:', findRes.status)
    return null
  }

  const rows = await findRes.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    console.warn('[watson] No recent orphaned complaint found to link')
    return null
  }

  const complaintId = rows[0].id
  if (!complaintId) return null

  // Patch with telegram user info
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/complaints?id=eq.${complaintId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
      }),
    },
  )

  if (!patchRes.ok) {
    console.error('[watson] Failed to link complaint:', patchRes.status)
    return null
  }

  console.log(`[watson] Linked telegram user ${telegramUserId} to complaint ${complaintId}`)
  return { id: complaintId }
}

/**
 * Trigger the cluster-complaints edge function for a newly created complaint.
 */
export async function clusterComplaint(complaintId: string): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/cluster-complaints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ complaint_id: complaintId }),
    })

    if (!res.ok) {
      console.error('[watson] cluster-complaints failed:', res.status)
    } else {
      console.log(`[watson] Clustering triggered for complaint ${complaintId}`)
    }
  } catch (err) {
    console.error('[watson] Error triggering cluster-complaints:', err)
  }
}
