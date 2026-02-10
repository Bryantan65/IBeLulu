// BFF API Route: GET /api/complaints
// Queries Supabase server-side with service role key.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInitData } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await validateInitData(request.headers.get('Authorization'))
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = auth.user?.id?.toString()
  const username = auth.user?.username

  let query = supabase()
    .from('complaints')
    .select('id,text,location_label,category_pred,severity_pred,urgency_pred,confidence,status,created_at,cluster_id,telegram_user_id,telegram_username,photo_url')
    .order('created_at', { ascending: false })

  // Filter to the user's own complaints by telegram_user_id or telegram_username
  if (userId && username) {
    query = query.or(`telegram_user_id.eq.${userId},telegram_username.eq.${username}`)
  } else if (userId) {
    query = query.eq('telegram_user_id', userId)
  } else if (username) {
    query = query.eq('telegram_username', username)
  }

  const { data, error } = await query

  if (error) {
    console.error('[complaints GET] Supabase error:', error)
    return NextResponse.json({ error: 'Failed to fetch complaints' }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
