// BFF API Route: GET /api/complaints?userId=123
// When Supabase is reconnected, this will proxy to Supabase server-side
// with the service role key — never exposing it to the client.

import { NextRequest, NextResponse } from 'next/server'
import { getAllComplaints, createComplaint } from '@/lib/mock-data'
import { validateInitData } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await validateInitData(request.headers.get('Authorization'))
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const complaints = getAllComplaints()
  return NextResponse.json(complaints)
}

export async function POST(request: NextRequest) {
  const auth = await validateInitData(request.headers.get('Authorization'))
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { text, location_label, category_pred, telegram_user_id, telegram_username } = body

  if (!text || !location_label) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Use validated user info from initData if available, fall back to body
  const complaint = createComplaint({
    text,
    location_label,
    category_pred: category_pred || 'general_cleanliness',
    telegram_user_id: auth.user?.id?.toString() || telegram_user_id || '0',
    telegram_username: auth.user?.username || telegram_username || 'anonymous',
  })

  return NextResponse.json(complaint, { status: 201 })
}
