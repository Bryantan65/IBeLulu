'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import { apiFetch } from '@/lib/api'
import type { Complaint } from '@/types/complaint'
import './ComplaintDetailPage.css'

export default function ComplaintDetailPage({ id }: { id: string }) {
  const searchParams = useSearchParams()
  const justSubmitted = searchParams.get('justSubmitted') === 'true'

  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    apiFetch<Complaint>(`/api/complaints/${id}`)
      .then(setComplaint)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <LoadingSpinner />
  if (error) return <div className="error-state">{error}</div>
  if (!complaint) return null

  const created = new Date(complaint.created_at)

  return (
    <div className="detail">
      {justSubmitted && (
        <div className="detail__success">
          &#x2705; Complaint submitted successfully!
        </div>
      )}

      <div className="detail__header">
        <h2 className="detail__title">Complaint Details</h2>
        <StatusBadge status={complaint.status || 'RECEIVED'} />
      </div>

      <div className="detail__card">
        <div className="detail__row">
          <span className="detail__label">ID</span>
          <span className="detail__value detail__value--mono">{complaint.id.substring(0, 8)}</span>
        </div>
        <div className="detail__row">
          <span className="detail__label">Status</span>
          <span className="detail__value">{(complaint.status || 'RECEIVED').trim()}</span>
        </div>
        <div className="detail__row">
          <span className="detail__label">Category</span>
          <span className="detail__value">{complaint.category_pred || 'Processing...'}</span>
        </div>
        <div className="detail__row">
          <span className="detail__label">Severity</span>
          <span className="detail__value">{complaint.severity_pred != null ? `${complaint.severity_pred}/5` : 'Pending'}</span>
        </div>
        <div className="detail__row">
          <span className="detail__label">Location</span>
          <span className="detail__value">{complaint.location_label || 'N/A'}</span>
        </div>
        <div className="detail__row">
          <span className="detail__label">Submitted</span>
          <span className="detail__value">{created.toLocaleDateString()} {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      <div className="detail__description">
        <h3 className="detail__section-title">Description</h3>
        <p className="detail__text">{complaint.text}</p>
      </div>
    </div>
  )
}
