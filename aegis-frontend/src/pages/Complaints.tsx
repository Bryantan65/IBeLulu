import { Badge, Card } from '../components/ui'
import { Search, Filter, ArrowUpDown } from 'lucide-react'
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
    return (
        <div className="complaints">
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

            {/* Table */}
            <Card padding="none">
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
