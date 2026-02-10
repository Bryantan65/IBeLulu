// ============================================================
// MOCK DATA – in-memory store for frontend-only testing
// When you reconnect Supabase, these will be replaced by real
// API route handlers that proxy to Supabase server-side.
// ============================================================
import type { Complaint } from '@/types/complaint'

const mockComplaints: Complaint[] = [
  {
    id: 'demo-0001-aaaa-bbbb',
    text: 'Overflowing bin near Block 123, Yishun Avenue 1. Trash spilling onto the walkway.',
    location_label: 'Block 123, Yishun Ave 1',
    category_pred: 'bin_overflow',
    severity_pred: 3,
    urgency_pred: null,
    status: 'RECEIVED',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    cluster_id: null,
    telegram_user_id: null,
    telegram_username: null,
  },
  {
    id: 'demo-0002-cccc-dddd',
    text: 'Blocked drain causing water to pool at the void deck after rain.',
    location_label: 'Block 456, Ang Mo Kio St 31',
    category_pred: 'blocked_drain',
    severity_pred: 4,
    urgency_pred: null,
    status: 'IN_PROGRESS',
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    cluster_id: null,
    telegram_user_id: null,
    telegram_username: null,
  },
]

export function getAllComplaints(): Complaint[] {
  return [...mockComplaints].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export function getComplaintById(id: string): Complaint | null {
  return mockComplaints.find((c) => c.id === id) ?? null
}

export function createComplaint(data: {
  text: string
  location_label: string
  category_pred: string
  telegram_user_id: string
  telegram_username: string
}): Complaint {
  const newComplaint: Complaint = {
    id: `demo-${Date.now().toString(36)}`,
    text: data.text,
    location_label: data.location_label,
    category_pred: data.category_pred,
    severity_pred: null,
    urgency_pred: null,
    status: 'RECEIVED',
    created_at: new Date().toISOString(),
    cluster_id: null,
    telegram_user_id: data.telegram_user_id,
    telegram_username: data.telegram_username,
  }
  mockComplaints.unshift(newComplaint)
  return newComplaint
}
