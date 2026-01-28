import { useState, useRef, useEffect } from 'react'
import { sendMessageToAgent, ChatMessage } from '../services/orchestrate'
import { Badge, Card, Button } from '../components/ui'
import { Search, ArrowUpDown, Send, User, Bot, Loader2, Plus, MapPin, X, ClipboardCheck, RefreshCw } from 'lucide-react'

// Agent IDs
const COMPLAINTS_AGENT_ID = 'addd6d7a-97ab-44db-8774-30fb15f7a052'
const REVIEW_AGENT_ID = 'f3c41796-118f-4f5a-a77c-e29890eaca6e'
import './Complaints.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface Complaint {
    id: string
    text: string
    location_label: string | null
    category_pred: string | null
    severity_pred: number | null
    urgency_pred: string | null
    confidence: number | null
    status: string | null
    created_at: string
    lat: number | null
    lng: number | null
    photo_url: string | null
    user_id: string | null
    cluster_id: string | null
}

interface FormData {
    text: string
    location: string
    category: string
    urgency: string
    severity: number
}

function getTimeAgo(dateString: string): string {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
}

export default function Complaints() {
    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Complaints list state
    const [complaints, setComplaints] = useState<Complaint[]>([])
    const [isRefreshing, setIsRefreshing] = useState(false)

    // Form state
    const [showForm, setShowForm] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [formData, setFormData] = useState<FormData>({
        text: '',
        location: '',
        category: 'bin_overflow',
        urgency: '48h',
        severity: 3
    })

    // Review Agent state
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [isReviewing, setIsReviewing] = useState(false)
    const [reviewResponse, setReviewResponse] = useState<string>('')

    // Fetch complaints from Supabase
    const fetchComplaints = async () => {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/complaints?order=created_at.desc`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })
            if (response.ok) {
                const data = await response.json()
                setComplaints(data)
            }
        } catch (error) {
            console.error('Failed to fetch complaints:', error)
        }
    }

    // Submit new complaint
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/complaints`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    text: formData.text,
                    location_label: formData.location,
                    category_pred: formData.category,
                    urgency_pred: formData.urgency,
                    severity_pred: formData.severity,
                    status: 'RECEIVED',
                    confidence: 0.5
                })
            })

            if (response.ok) {
                setShowForm(false)
                setFormData({
                    text: '',
                    location: '',
                    category: 'bin_overflow',
                    urgency: '48h',
                    severity: 3
                })
                fetchComplaints() // Refresh the list
            }
        } catch (error) {
            console.error('Failed to submit complaint:', error)
        } finally {
            setSubmitting(false)
        }
    }

    const handleRefresh = async () => {
        setIsRefreshing(true)
        await fetchComplaints()
        setIsRefreshing(false)
    }

    // Load complaints on mount
    useEffect(() => {
        fetchComplaints()
    }, [])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || isLoading) return

        const userMessage: ChatMessage = { role: 'user', text: input }
        const newMessages = [...messages, userMessage]

        setMessages(newMessages)
        setInput('')
        setIsLoading(true)

        try {
            const responseText = await sendMessageToAgent(newMessages, COMPLAINTS_AGENT_ID)
            const agentMessage: ChatMessage = { role: 'assistant', text: responseText }
            setMessages((prev) => [...prev, agentMessage])
        } catch (error) {
            console.error(error)
            const errorMessage: ChatMessage = { role: 'assistant', text: "Sorry, I'm having trouble connecting right now." }
            setMessages((prev) => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
        }
    }

    // Handle Review Complaints button click
    const handleReviewComplaints = async () => {
        setShowReviewModal(true)
        setIsReviewing(true)
        setReviewResponse('')

        try {
            const reviewMessage: ChatMessage = {
                role: 'user',
                text: "Review triaged complaints. Execute SQL on project 'gsbpchneovtpqgnyfttp': SELECT * FROM clusters WHERE state = 'TRIAGED' LIMIT 5;"
            }
            const responseText = await sendMessageToAgent([reviewMessage], REVIEW_AGENT_ID)
            setReviewResponse(responseText)
        } catch (error) {
            console.error(error)
            setReviewResponse('Failed to connect to the Review Agent. Please try again.')
        } finally {
            setIsReviewing(false)
        }
    }

    return (
        <div className="complaints">
            <Card className="complaints__chat" padding="none">
                <div className="complaints__chat-header">
                    <div className="complaints__chat-title">
                        <Bot size={20} className="complaints__chat-icon" />
                        <span>Complaint Assistant</span>
                    </div>
                    {/* Optional: Add clear chat button or status indicator */}
                </div>

                <div className="complaints__chat-messages">
                    {messages.length === 0 && (
                        <div className="complaints__chat-empty">
                            <Bot size={48} />
                            <p>Hello! I can help you triage complaints. Describe an issue to get started.</p>
                        </div>
                    )}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`complaints__chat-message complaints__chat-message--${msg.role}`}>
                            <div className="complaints__chat-avatar">
                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </div>
                            <div className="complaints__chat-bubble">
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="complaints__chat-message complaints__chat-message--assistant">
                            <div className="complaints__chat-avatar">
                                <Bot size={16} />
                            </div>
                            <div className="complaints__chat-bubble complaints__chat-bubble--loading">
                                <Loader2 size={16} className="animate-spin" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="complaints__chat-input-area">
                    <input
                        className="complaints__chat-input"
                        placeholder="Type a message..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        disabled={isLoading}
                    />
                    <button
                        className="complaints__chat-send-btn"
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                    >
                        <Send size={18} />
                    </button>
                </div>
            </Card>
            {/* Filter Bar */}
            <div className="complaints__filters">
                <div className="complaints__search">
                    <Search size={18} />
                    <input type="text" placeholder="Search complaints..." />
                </div>
                <Button
                    variant="ghost"
                    icon={<RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />}
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    Refresh
                </Button>
                <Button
                    variant="secondary"
                    icon={<ClipboardCheck size={16} />}
                    onClick={handleReviewComplaints}
                    disabled={isReviewing}
                >
                    Review Complaints
                </Button>
                <Button
                    variant="primary"
                    icon={<Plus size={16} />}
                    onClick={() => setShowForm(true)}
                >
                    New Complaint
                </Button>
            </div>

            {/* Desktop/Tablet Table View */}
            <Card padding="none" className="complaints__table-container">
                <table className="complaints__table">
                    <thead>
                        <tr>
                            <th>ID <ArrowUpDown size={14} /></th>
                            <th>Description</th>
                            <th>Location</th>
                            <th>Category</th>
                            <th>Severity</th>
                            <th>Urgency</th>
                            <th>Status</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {complaints.map((complaint) => (
                            <tr key={complaint.id}>
                                <td className="complaints__id">{complaint.id.substring(0, 8)}</td>
                                <td className="complaints__text">{complaint.text}</td>
                                <td className="complaints__location">
                                    <MapPin size={12} /> {complaint.location_label || 'N/A'}
                                </td>
                                <td>{complaint.category_pred || 'Uncategorized'}</td>
                                <td>
                                    <SeverityBadge level={complaint.severity_pred || 3} />
                                </td>
                                <td>
                                    <Badge variant={(complaint.urgency_pred || '48h') === 'today' ? 'danger' : (complaint.urgency_pred || '48h') === '48h' ? 'warning' : 'neutral'} size="sm">
                                        {(complaint.urgency_pred || '48h').toUpperCase()}
                                    </Badge>
                                </td>
                                <td>
                                    <Badge variant={(complaint.status || 'RECEIVED') === 'CLUSTERED' ? 'success' : 'info'} size="sm">
                                        {(complaint.status || 'RECEIVED').toUpperCase()}
                                    </Badge>
                                </td>
                                <td className="complaints__time">{getTimeAgo(complaint.created_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            {/* Mobile Card View */}
            <div className="complaints__mobile-cards">
                {complaints.map((complaint) => (
                    <Card key={complaint.id} className="complaints__mobile-card">
                        <div className="complaints__mobile-card-header">
                            <span className="complaints__id">{complaint.id.substring(0, 8)}</span>
                            <Badge variant={(complaint.status || 'RECEIVED') === 'CLUSTERED' ? 'success' : 'info'} size="sm">
                                {((complaint.status || 'RECEIVED')).toUpperCase()}
                            </Badge>
                        </div>
                        <div className="complaints__mobile-card-content">
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Description</span>
                                <span className="complaints__mobile-value">{complaint.text}</span>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Location</span>
                                <span className="complaints__mobile-value">{complaint.location_label || 'N/A'}</span>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Category</span>
                                <span className="complaints__mobile-value">{complaint.category_pred || 'Uncategorized'}</span>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Severity</span>
                                <SeverityBadge level={complaint.severity_pred || 3} />
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Time</span>
                                <span className="complaints__mobile-value complaints__time">{getTimeAgo(complaint.created_at)}</span>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Submission Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Submit New Complaint</h2>
                            <button onClick={() => setShowForm(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="complaint-form">
                            <div className="form-group">
                                <label>Description *</label>
                                <textarea
                                    required
                                    value={formData.text}
                                    onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                    placeholder="Describe the issue..."
                                    rows={4}
                                />
                            </div>

                            <div className="form-group">
                                <label>Location *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.location}
                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    placeholder="e.g., Block 123, Yishun Avenue 1"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    >
                                        <option value="bin_overflow">Bin Overflow</option>
                                        <option value="litter">Litter</option>
                                        <option value="blocked_drain">Blocked Drain</option>
                                        <option value="pest_control">Pest Control</option>
                                        <option value="general_cleanliness">General Cleanliness</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Urgency</label>
                                    <select
                                        value={formData.urgency}
                                        onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                                    >
                                        <option value="today">Today</option>
                                        <option value="48h">48 Hours</option>
                                        <option value="week">This Week</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Severity: {formData.severity}</label>
                                <input
                                    type="range"
                                    min="1"
                                    max="5"
                                    value={formData.severity}
                                    onChange={(e) => setFormData({ ...formData, severity: parseInt(e.target.value) })}
                                />
                                <div className="severity-labels">
                                    <span>Minor</span>
                                    <span>Critical</span>
                                </div>
                            </div>

                            <div className="form-actions">
                                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" disabled={submitting}>
                                    {submitting ? 'Submitting...' : 'Submit Complaint'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Review Agent Modal */}
            {showReviewModal && (
                <div className="modal-overlay" onClick={() => setShowReviewModal(false)}>
                    <div className="modal-content modal-content--large" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><ClipboardCheck size={20} /> Review Agent</h2>
                            <button onClick={() => setShowReviewModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="review-modal-body">
                            {isReviewing ? (
                                <div className="review-loading">
                                    <Loader2 size={32} className="animate-spin" />
                                    <p>Review Agent is analyzing triaged clusters...</p>
                                </div>
                            ) : (
                                <div className="review-response">
                                    <pre>{reviewResponse}</pre>
                                </div>
                            )}
                        </div>
                        <div className="form-actions">
                            <Button variant="ghost" onClick={() => setShowReviewModal(false)}>
                                Close
                            </Button>
                            <Button variant="primary" onClick={handleReviewComplaints} disabled={isReviewing}>
                                {isReviewing ? 'Reviewing...' : 'Run Again'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function SeverityBadge({ level }: { level: number }) {
    const colors = ['', 'success', 'success', 'warning', 'danger', 'danger'] as const
    return (
        <div className="severity-badge">
            {[1, 2, 3, 4, 5].map((n) => (
                <span
                    key={n}
                    className={`severity-badge__dot ${n <= level ? `severity-badge__dot--${colors[level]}` : ''}`}
                />
            ))}
        </div>
    )
}
