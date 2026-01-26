import { Button, Badge, Card } from '../components/ui'
import { Check, RotateCcw, Flag, ZoomIn } from 'lucide-react'
import './Evidence.css'

// Mock evidence data
const mockEvidence = [
    {
        id: 'EV001',
        taskId: 'T001',
        taskType: 'bin_washdown',
        zone: 'Bedok North',
        status: 'DONE',
        submittedBy: 'Team Lead A',
        submittedAt: '2h ago',
        beforeImage: '/placeholder-before.jpg',
        afterImage: '/placeholder-after.jpg',
    },
    {
        id: 'EV002',
        taskId: 'T004',
        taskType: 'bulky_removal',
        zone: 'Tampines East',
        status: 'DONE',
        submittedBy: 'Team Lead B',
        submittedAt: '4h ago',
        beforeImage: '/placeholder-before.jpg',
        afterImage: '/placeholder-after.jpg',
    },
]

export default function Evidence() {
    return (
        <div className="evidence">
            <div className="evidence__header">
                <span className="evidence__count">{mockEvidence.length} pending verification</span>
            </div>

            <div className="evidence__list">
                {mockEvidence.map((item) => (
                    <Card key={item.id} padding="lg" className="evidence__card">
                        <div className="evidence__card-header">
                            <div className="evidence__card-info">
                                <span className="evidence__task-id">{item.taskId}</span>
                                <Badge variant="info" size="sm">{item.taskType.replace('_', ' ')}</Badge>
                                <span className="evidence__zone">{item.zone}</span>
                            </div>
                            <Badge variant="warning" size="sm">{item.status}</Badge>
                        </div>

                        <div className="evidence__images">
                            <div className="evidence__image-container">
                                <span className="evidence__image-label">Before</span>
                                <div className="evidence__image evidence__image--placeholder">
                                    <span>Before Photo</span>
                                    <button className="evidence__zoom"><ZoomIn size={16} /></button>
                                </div>
                            </div>
                            <div className="evidence__image-container">
                                <span className="evidence__image-label">After</span>
                                <div className="evidence__image evidence__image--placeholder">
                                    <span>After Photo</span>
                                    <button className="evidence__zoom"><ZoomIn size={16} /></button>
                                </div>
                            </div>
                        </div>

                        <div className="evidence__meta">
                            <span>Submitted by: <strong>{item.submittedBy}</strong></span>
                            <span>{item.submittedAt}</span>
                        </div>

                        <div className="evidence__actions">
                            <Button variant="primary" icon={<Check size={16} />}>
                                Verify & Close
                            </Button>
                            <Button variant="secondary" icon={<RotateCcw size={16} />}>
                                Return for Rework
                            </Button>
                            <Button variant="ghost" icon={<Flag size={16} />}>
                                Flag Issue
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    )
}
