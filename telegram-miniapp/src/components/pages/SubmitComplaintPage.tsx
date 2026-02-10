'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import './SubmitComplaintPage.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

interface ChatResponse {
  status: 'followup' | 'complete'
  reply: string
  history: ChatMessage[]
  complaint?: { id: string } | null
}

const GREETING = "Hi! Please describe your issue, including the location if possible. For example: \"Overflowing bin at Block 123, Yishun Ave 1.\""

export default function SubmitComplaintPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: GREETING },
  ])
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [complaintId, setComplaintId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/')
  }

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending || complaintId) return

    setInput('')
    setError(null)
    setSending(true)

    // Add user message to display immediately
    const userMsg: ChatMessage = { role: 'user', text }
    setMessages((prev) => [...prev, userMsg])

    try {
      const res = await apiFetch<ChatResponse>('/api/complaints/chat', {
        method: 'POST',
        body: { message: text, history },
      })

      // Add assistant reply
      const assistantMsg: ChatMessage = { role: 'assistant', text: res.reply }
      setMessages((prev) => [...prev, assistantMsg])
      setHistory(res.history)

      if (res.status === 'complete') {
        if (res.complaint?.id) {
          setComplaintId(res.complaint.id)
        } else {
          // Agent confirmed but linking may have failed — still show success
          setComplaintId('submitted')
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong'
      setError(errMsg)
      // Remove the user message if request failed entirely
      setMessages((prev) => prev.slice(0, -1))
      setInput(text) // restore input
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [input, sending, complaintId, history])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat">
      <div className="chat__header">
        <div className="chat__topbar">
          <button className="page-back-btn" onClick={handleBack}>
            <span className="page-back-btn__icon">{'<'}</span>
            Back
          </button>
        </div>
        <h2 className="chat__title">Report an Issue</h2>
        <p className="chat__hint">Chat with our AI assistant to submit your complaint.</p>
      </div>

      <div className="chat__messages">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat__bubble ${
              msg.role === 'user' ? 'chat__bubble--user' : 'chat__bubble--assistant'
            }`}
          >
            {msg.role === 'assistant' && (
              <span className="chat__avatar">🏛️</span>
            )}
            <div className="chat__bubble-content">
              <p className="chat__bubble-text">{msg.text}</p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="chat__bubble chat__bubble--assistant">
            <span className="chat__avatar">🏛️</span>
            <div className="chat__bubble-content">
              <div className="chat__typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        {complaintId && (
          <div className="chat__success-card">
            <span className="chat__success-icon">✅</span>
            <p className="chat__success-text">Complaint submitted successfully!</p>
            {complaintId !== 'submitted' && (
              <button
                className="chat__view-btn"
                onClick={() => router.push(`/complaints/${complaintId}?justSubmitted=true`)}
              >
                View Complaint Details
              </button>
            )}
            <button
              className="chat__home-btn"
              onClick={() => router.push('/')}
            >
              Back to Home
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && <div className="chat__error">{error}</div>}

      {!complaintId && (
        <div className="chat__input-bar">
          <textarea
            ref={inputRef}
            className="chat__input"
            placeholder="Describe your issue..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={sending}
          />
          <button
            className="chat__send-btn"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            aria-label="Send"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
