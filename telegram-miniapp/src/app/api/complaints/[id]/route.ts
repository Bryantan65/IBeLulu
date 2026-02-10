// BFF API Route: GET /api/complaints/[id]
// When Supabase is reconnected, this will query Supabase server-side.

import { NextRequest, NextResponse } from 'next/server'
import { getComplaintById } from '@/lib/mock-data'
import { validateInitData } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateInitData(request.headers.get('Authorization'))
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const complaint = getComplaintById(params.id)

  if (!complaint) {
    return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
  }

  return NextResponse.json(complaint)
}
