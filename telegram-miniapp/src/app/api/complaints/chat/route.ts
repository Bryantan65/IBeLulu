// BFF API Route: POST /api/complaints/chat
// Handles the conversational complaint flow with the Watson Orchestrate agent.

import { NextRequest, NextResponse } from 'next/server'
import { validateInitData } from '@/lib/auth'
import {
  callComplaintAgent,
  isAgentAskingFollowUp,
  linkTelegramToComplaint,
  clusterComplaint,
  type ChatMessage,
} from '@/lib/watson'

export async function POST(request: NextRequest) {
  const auth = await validateInitData(request.headers.get('Authorization'))
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { message, history } = body as {
    message: string
    history: ChatMessage[]
  }

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  // Build full conversation: previous history + new user message
  const messages: ChatMessage[] = [
    ...(Array.isArray(history) ? history : []),
    { role: 'user', text: message },
  ]

  // Keep only the last 12 messages (same as MAX_HISTORY in app.py)
  const trimmed = messages.slice(-12)

  try {
    const reply = await callComplaintAgent(trimmed)
    const updatedHistory: ChatMessage[] = [
      ...trimmed,
      { role: 'assistant', text: reply },
    ]

    if (isAgentAskingFollowUp(reply)) {
      // Agent needs more info — keep the conversation going
      return NextResponse.json({
        status: 'followup',
        reply,
        history: updatedHistory,
      })
    }

    // Agent confirmed submission — link telegram user and trigger clustering
    const userId = auth.user?.id?.toString() || '0'
    const username = auth.user?.username || 'anonymous'

    const linked = await linkTelegramToComplaint(userId, username)

    if (linked?.id) {
      // Trigger clustering in the background
      clusterComplaint(linked.id).catch((err) =>
        console.error('[chat] clustering error:', err)
      )
    }

    return NextResponse.json({
      status: 'complete',
      reply,
      complaint: linked,
      history: updatedHistory,
    })
  } catch (err) {
    console.error('[chat] Watson agent error:', err)
    const errMsg = err instanceof Error ? err.message : 'Agent error'
    return NextResponse.json({ error: errMsg }, { status: 502 })
  }
}
