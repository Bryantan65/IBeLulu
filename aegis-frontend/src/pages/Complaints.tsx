import { useState, useEffect } from 'react'
import { Badge, Card, Button } from '../components/ui'
import { Search, ArrowUpDown, Plus, X, Loader, MapPin } from 'lucide-react'
import './Complaints.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface Complaint {
    id: string
    text: string
    location: string
    category: string
    severity: number
    urgency: string
    confidence: number
    state: string
    created_at: string
}

export default function Complaints() {
    const [complaints, setComplaints] = useState<Complaint[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        text: '',
        location: '',
        category: 'general_cleanliness',
        severity: 3,
        urgency: '48h'
    })

    useEffect(() => {
        fetchComplaints()
    }, [])

    const fetchComplaints = async () => {
        try {
            setLoading(true)
            // Fetch directly from Supabase database
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/complaints?select=*&order=created_at.desc&limit=50`,
                {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    }
                }
            )

            if (!response.ok) {
                throw new Error('Failed to fetch complaints')
            }

            const data = await response.json()
            setComplaints(data)
        } catch (error) {
            console.error('Error fetching complaints:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        try {
            setSubmitting(true)

            const response = await fetch(
                `${SUPABASE_URL}/functions/v1/submit-complaint`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: formData.text,
                        location: formData.location,
                        category: formData.category,
                        severity: formData.severity,
                        urgency: formData.urgency
                    })
                }
            )

            if (!response.ok) {
                throw new Error('Failed to submit complaint')
            }

            const result = await response.json()
            console.log('Complaint submitted:', result)

            // Reset form and close modal
            setFormData({
                text: '',
                location: '',
                category: 'general_cleanliness',
                severity: 3,
                urgency: '48h'
            })
            setShowForm(false)

            // Refresh complaints list
            await fetchComplaints()

            alert('Complaint submitted successfully!')
        } catch (error) {
            console.error('Error submitting complaint:', error)
            alert('Failed to submit complaint. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    const getTimeAgo = (timestamp: string) => {
        const now = new Date()
        const created = new Date(timestamp)
        const diffMs = now.getTime() - created.getTime()
        const diffMins = Math.floor(diffMs / 60000)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins}m ago`

        const diffHours = Math.floor(diffMins / 60)
        if (diffHours < 24) return `${diffHours}h ago`

        const diffDays = Math.floor(diffHours / 24)
        return `${diffDays}d ago`
    }

    if (loading) {
        return (
            <div className="complaints">
                <div className="complaints__loading">
                    <Loader size={48} className="spinner" />
                    <p>Loading complaints...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="complaints">
            {/* Filter Bar */}
            <div className="complaints__filters">
                <div className="complaints__search">
                    <Search size={18} />
                    <input type="text" placeholder="Search complaints..." />
                </div>
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
                                    <MapPin size={12} /> {complaint.location}
                                </td>
                                <td>{complaint.category}</td>
                                <td>
                                    <SeverityBadge level={complaint.severity} />
                                </td>
                                <td>
                                    <Badge variant={(complaint.urgency || '48h') === 'today' ? 'danger' : (complaint.urgency || '48h') === '48h' ? 'warning' : 'neutral'} size="sm">
                                        {(complaint.urgency || '48h').toUpperCase()}
                                    </Badge>
                                </td>
                                <td>
                                    <Badge variant={(complaint.state || 'received') === 'clustered' ? 'success' : 'info'} size="sm">
                                        {(complaint.state || 'received').toUpperCase()}
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
                            <Badge variant={(complaint.state || 'received') === 'clustered' ? 'success' : 'info'} size="sm">
                                {((complaint.state || 'received')).toUpperCase()}
                            </Badge>
                        </div>
                        <div className="complaints__mobile-card-content">
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Description</span>
                                <span className="complaints__mobile-value">{complaint.text}</span>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Location</span>
                                <span className="complaints__mobile-value">{complaint.location}</span>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Category</span>
                                <span className="complaints__mobile-value">{complaint.category}</span>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Severity</span>
                                <SeverityBadge level={complaint.severity} />
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
