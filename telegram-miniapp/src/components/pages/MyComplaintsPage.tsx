'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import { apiFetch } from '@/lib/api'
import type { Complaint } from '@/types/complaint'
import './MyComplaintsPage.css'

function timeAgo(dateString: string): string {
  const now = Date.now()
  const date = new Date(dateString).getTime()
  const diffMin = Math.floor((now - date) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return new Date(dateString).toLocaleDateString()
}

export default function MyComplaintsPage() {
  const router = useRouter()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Complaint[]>('/api/complaints')
      .then(setComplaints)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />
  if (error) return <div className="error-state">{error}</div>

  return (
    <div className="my-complaints">
      <h2 className="my-complaints__title">My Complaints</h2>

      {complaints.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">&#x1F4ED;</span>
          <p>No complaints submitted yet.</p>
          <button
            className="my-complaints__submit-btn"
            onClick={() => router.push('/submit')}
          >
            Submit your first complaint
          </button>
        </div>
      ) : (
        <div className="my-complaints__list">
          {complaints.map((c) => (
            <button
              key={c.id}
              className="my-complaints__card"
              onClick={() => router.push(`/complaints/${c.id}`)}
            >
              <div className="my-complaints__card-top">
                <span className="my-complaints__card-id">{c.id.substring(0, 8)}</span>
                <StatusBadge status={c.status || 'RECEIVED'} />
              </div>
              <p className="my-complaints__card-text">
                {c.text.length > 80 ? c.text.substring(0, 80) + '...' : c.text}
              </p>
              <div className="my-complaints__card-meta">
                <span>{c.category_pred || 'Uncategorized'}</span>
                <span>{timeAgo(c.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
