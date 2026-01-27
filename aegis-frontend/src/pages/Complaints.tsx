import { useState, useRef, useEffect } from 'react'
import { sendMessageToAgent, ChatMessage } from '../services/orchestrate'
import { Badge, Card } from '../components/ui'
import { Search, Filter, ArrowUpDown, Send, User, Bot, Loader2 } from 'lucide-react'
import './Complaints.css'

// Mock complaint data
const mockComplaints = [
    { id: 'C001', category: 'Litter', severity: 3, urgency: 'TODAY', confidence: 0.89, status: 'LINKED', location: 'Tampines St 21', time: '10m ago' },
    { id: 'C002', category: 'Overflow', severity: 4, urgency: 'TODAY', confidence: 0.72, status: 'LINKED', location: 'Bedok North Ave 3', time: '25m ago' },
    { id: 'C003', category: 'Smell', severity: 2, urgency: '48H', confidence: 0.94, status: 'RECEIVED', location: 'Simei St 4', time: '1h ago' },
    { id: 'C004', category: 'Bulky Items', severity: 3, urgency: 'WEEK', confidence: 0.81, status: 'LINKED', location: 'Pasir Ris Dr 6', time: '2h ago' },
    { id: 'C005', category: 'Overflow', severity: 5, urgency: 'TODAY', confidence: 0.56, status: 'RECEIVED', location: 'Tampines Ave 9', time: '3h ago' },
]

export default function Complaints() {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

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
            const responseText = await sendMessageToAgent(newMessages)
            const agentMessage: ChatMessage = { role: 'assistant', text: responseText }
            setMessages((prev) => [...prev, agentMessage])
        } catch (error) {
            console.error(error)
            // Optional: Add error message to chat
            const errorMessage: ChatMessage = { role: 'assistant', text: "Sorry, I'm having trouble connecting right now." }
            setMessages((prev) => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
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
                <button className="complaints__filter-btn">
                    <Filter size={16} />
                    <span>Filter</span>
                </button>
            </div>

            {/* Desktop/Tablet Table View */}
            <Card padding="none" className="complaints__table-container">
                <table className="complaints__table">
                    <thead>
                        <tr>
                            <th>ID <ArrowUpDown size={14} /></th>
                            <th>Category</th>
                            <th>Severity</th>
                            <th>Urgency</th>
                            <th>Confidence</th>
                            <th>Status</th>
                            <th>Location</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mockComplaints.map((complaint) => (
                            <tr key={complaint.id}>
                                <td className="complaints__id">{complaint.id}</td>
                                <td>{complaint.category}</td>
                                <td>
                                    <SeverityBadge level={complaint.severity} />
                                </td>
                                <td>
                                    <Badge variant={complaint.urgency === 'TODAY' ? 'danger' : complaint.urgency === '48H' ? 'warning' : 'neutral'} size="sm">
                                        {complaint.urgency}
                                    </Badge>
                                </td>
                                <td>
                                    <ConfidenceMeter value={complaint.confidence} />
                                </td>
                                <td>
                                    <Badge variant={complaint.status === 'LINKED' ? 'success' : 'info'} size="sm">
                                        {complaint.status}
                                    </Badge>
                                </td>
                                <td className="complaints__location">{complaint.location}</td>
                                <td className="complaints__time">{complaint.time}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            {/* Mobile Card View */}
            <div className="complaints__mobile-cards">
                {mockComplaints.map((complaint) => (
                    <Card key={complaint.id} className="complaints__mobile-card">
                        <div className="complaints__mobile-card-header">
                            <span className="complaints__id">{complaint.id}</span>
                            <Badge variant={complaint.status === 'LINKED' ? 'success' : 'info'} size="sm">
                                {complaint.status}
                            </Badge>
                        </div>
                        <div className="complaints__mobile-card-content">
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Category</span>
                                <span className="complaints__mobile-value">{complaint.category}</span>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Severity</span>
                                <SeverityBadge level={complaint.severity} />
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Urgency</span>
                                <Badge variant={complaint.urgency === 'TODAY' ? 'danger' : complaint.urgency === '48H' ? 'warning' : 'neutral'} size="sm">
                                    {complaint.urgency}
                                </Badge>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Confidence</span>
                                <ConfidenceMeter value={complaint.confidence} />
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Location</span>
                                <span className="complaints__mobile-value">{complaint.location}</span>
                            </div>
                            <div className="complaints__mobile-row">
                                <span className="complaints__mobile-label">Time</span>
                                <span className="complaints__mobile-value complaints__time">{complaint.time}</span>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
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

function ConfidenceMeter({ value }: { value: number }) {
    const color = value >= 0.8 ? 'var(--color-success)' : value >= 0.6 ? 'var(--color-warning)' : 'var(--color-danger)'
    return (
        <div className="confidence-meter">
            <div className="confidence-meter__bar">
                <div className="confidence-meter__fill" style={{ width: `${value * 100}%`, background: color }} />
            </div>
            <span className="confidence-meter__value">{Math.round(value * 100)}%</span>
        </div>
    )
}
