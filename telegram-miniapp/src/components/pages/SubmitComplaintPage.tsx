'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getMainButton } from '@/lib/telegram'
import { apiFetch } from '@/lib/api'
import type { Complaint } from '@/types/complaint'
import './SubmitComplaintPage.css'

const CATEGORIES = [
  { value: 'bin_overflow', label: 'Bin Overflow' },
  { value: 'litter', label: 'Litter' },
  { value: 'blocked_drain', label: 'Blocked Drain' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'general_cleanliness', label: 'General Cleanliness' },
  { value: 'other', label: 'Other' },
]

export default function SubmitComplaintPage() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('general_cleanliness')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValid = text.trim().length > 10 && location.trim().length > 3

  const handleSubmit = useCallback(async () => {
    if (!isValid || submitting) return

    setSubmitting(true)
    setError(null)
    getMainButton()?.showProgress(true)

    try {
      // User identity comes from the validated initData on the server side
      const complaint = await apiFetch<Complaint>('/api/complaints', {
        method: 'POST',
        body: {
          text: text.trim(),
          location_label: location.trim(),
          category_pred: category,
        },
      })

      getMainButton()?.hideProgress()
      getMainButton()?.hide()
      router.push(`/complaints/${complaint.id}?justSubmitted=true`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
      getMainButton()?.hideProgress()
      setSubmitting(false)
    }
  }, [isValid, submitting, text, location, category, router])

  useEffect(() => {
    const btn = getMainButton()
    if (!btn) return

    if (isValid && !submitting) {
      btn.setText('Submit Complaint')
      btn.show()
      btn.enable()
      btn.onClick(handleSubmit)
    } else if (!isValid) {
      btn.hide()
    }

    return () => {
      btn.offClick(handleSubmit)
    }
  }, [isValid, submitting, handleSubmit])

  useEffect(() => {
    return () => {
      getMainButton()?.hide()
    }
  }, [])

  return (
    <div className="submit">
      <h2 className="submit__title">Report an Issue</h2>
      <p className="submit__hint">Please provide details so we can address it quickly.</p>

      {error && <div className="submit__error">{error}</div>}

      <div className="submit__field">
        <label className="submit__label">What is the problem? *</label>
        <textarea
          className="submit__textarea"
          placeholder="Describe the issue in detail... (e.g., 'Overflowing bin at the corner of Block 123')"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          disabled={submitting}
        />
        <span className="submit__char-count">
          {text.trim().length < 11 ? `${11 - text.trim().length} more characters needed` : ''}
        </span>
      </div>

      <div className="submit__field">
        <label className="submit__label">Location *</label>
        <input
          className="submit__input"
          type="text"
          placeholder="e.g., Block 123, Yishun Avenue 1"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="submit__field">
        <label className="submit__label">Category</label>
        <div className="submit__chips">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              className={`submit__chip ${category === cat.value ? 'submit__chip--active' : ''}`}
              onClick={() => setCategory(cat.value)}
              disabled={submitting}
              type="button"
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
