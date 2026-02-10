// BFF API Route: GET /api/complaints/[id]/evidence
// Fetches resolution evidence (before/after photos) for a complaint's cluster.

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

  // 1. Get the complaint's cluster_id
  const { data: complaint, error: cErr } = await supabase()
    .from('complaints')
    .select('id,cluster_id,telegram_user_id')
    .eq('id', params.id)
    .single()

  if (cErr || !complaint) {
    return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
  }

  // Security: only the owner can view
  const userId = auth.user?.id?.toString()
  if (userId && complaint.telegram_user_id && complaint.telegram_user_id !== userId) {
    return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
  }

  if (!complaint.cluster_id) {
    return NextResponse.json([])
  }

  // 2. Find tasks for this cluster
  const { data: tasks, error: tErr } = await supabase()
    .from('tasks')
    .select('id')
    .eq('cluster_id', complaint.cluster_id)

  if (tErr || !tasks || tasks.length === 0) {
    return NextResponse.json([])
  }

  const taskIds = tasks.map((t) => t.id)

  // 3. Find evidence for these tasks
  const { data: evidence, error: eErr } = await supabase()
    .from('evidence')
    .select('id,task_id,before_image_url,after_image_url,submitted_at,notes,submitted_by')
    .in('task_id', taskIds)
    .order('submitted_at', { ascending: false })
    .limit(10)

  if (eErr) {
    console.error('[evidence GET] Supabase error:', eErr)
    return NextResponse.json({ error: 'Failed to fetch evidence' }, { status: 500 })
  }

  return NextResponse.json(evidence || [])
}
