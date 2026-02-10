// BFF API Route: GET /api/complaints/[id]
// Queries Supabase server-side.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInitData } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateInitData(request.headers.get('Authorization'))
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase()
    .from('complaints')
    .select('id,text,location_label,category_pred,severity_pred,urgency_pred,confidence,status,created_at,cluster_id,telegram_user_id,telegram_username,photo_url')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
  }

  // Security: only allow the owner to view their complaint
  const userId = auth.user?.id?.toString()
  if (userId && data.telegram_user_id && data.telegram_user_id !== userId) {
    return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
