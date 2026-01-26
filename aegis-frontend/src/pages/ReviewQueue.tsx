import { Button, Badge, Card } from '../components/ui'
import { Check, X, Edit, AlertCircle, Shield } from 'lucide-react'
import './ReviewQueue.css'

// Mock review items
const mockReviewItems = [
    {
        id: 'RV-001',
        clusterId: 'CL-001',
        category: 'Overflow',
        zone: 'Tampines East',
        severity: 4,
        confidence: 0.58,
        suggestedPlaybook: 'bulky_removal',
        reason: 'Multiple large items reported near bin clusters. Evidence of repeated overflow events.',
        fairnessNote: 'Silent Zone Boost Applied (+15 priority)',
        requiresReview: 'LOW_CONFIDENCE',
    },
    {
        id: 'RV-002',
        clusterId: 'CL-003',
        category: 'Smell',
        zone: 'Pasir Ris',
        severity: 5,
        confidence: 0.91,
        suggestedPlaybook: 'bin_washdown',
        reason: 'Strong odor complaints from multiple residents. Likely decomposing waste.',
        fairnessNote: null,
        requiresReview: 'HIGH_SEVERITY',
    },
]

export default function ReviewQueue() {
    return (
        <div className="review-queue">
            <div className="review-queue__header">
                <span className="review-queue__count">{mockReviewItems.length} items pending review</span>
            </div>

            <div className="review-queue__items">
                {mockReviewItems.map((item) => (
                    <Card key={item.id} padding="lg" className="review-card">
                        <div className="review-card__header">
                            <div className="review-card__title">
                                <span className="review-card__cluster-id">{item.clusterId}</span>
                                <Badge variant="neutral" size="sm">{item.category}</Badge>
                                <Badge variant={item.severity >= 4 ? 'danger' : 'warning'} size="sm">
                                    Severity {item.severity}
                                </Badge>
                            </div>
                            <Badge
                                variant={item.requiresReview === 'LOW_CONFIDENCE' ? 'warning' : 'danger'}
                                size="sm"
                                dot
                            >
                                {item.requiresReview === 'LOW_CONFIDENCE' ? 'Low Confidence' : 'High Severity'}
                            </Badge>
                        </div>

                        <div className="review-card__meta">
                            <span>Zone: {item.zone}</span>
                            <span>Confidence: {Math.round(item.confidence * 100)}%</span>
                        </div>

                        <div className="review-card__section">
                            <h4>AI Suggests</h4>
                            <div className="review-card__playbook">
                                <code>{item.suggestedPlaybook}</code>
                            </div>
                        </div>

                        <div className="review-card__section">
                            <h4>Reason</h4>
                            <p>{item.reason}</p>
                        </div>

                        {item.fairnessNote && (
                            <div className="review-card__fairness">
                                <Shield size={14} />
                                <span>{item.fairnessNote}</span>
                            </div>
                        )}

                        <div className="review-card__actions">
                            <Button variant="primary" icon={<Check size={16} />}>
                                Approve
                            </Button>
                            <Button variant="secondary" icon={<Edit size={16} />}>
                                Override Playbook
                            </Button>
                            <Button variant="ghost" icon={<X size={16} />}>
                                Defer
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>

            {mockReviewItems.length === 0 && (
                <div className="review-queue__empty">
                    <AlertCircle size={48} />
                    <h3>All caught up!</h3>
                    <p>No items require review at this time.</p>
                </div>
            )}
        </div>
    )
}
