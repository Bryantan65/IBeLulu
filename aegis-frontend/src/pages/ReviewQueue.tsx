import { useState, useEffect } from 'react'
import { Button, Badge, Card } from '../components/ui'
import { Check, X, AlertCircle, Loader } from 'lucide-react'
import './ReviewQueue.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface Cluster {
    id: string
    category: string
    severity_score: number
    state: string
    requires_human_review: boolean
    assigned_playbook: string | null
    priority_score: number
    complaint_count?: number
}

export default function ReviewQueue() {
    const [clusters, setClusters] = useState<Cluster[]>([])
    const [loading, setLoading] = useState(true)
    const [reviewing, setReviewing] = useState<string | null>(null)

    // Fetch pending clusters
    useEffect(() => {
        fetchPendingClusters()
    }, [])

    const fetchPendingClusters = async () => {
        try {
            setLoading(true)
            const response = await fetch(
                `${SUPABASE_URL}/functions/v1/list-pending-clusters`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            )

            if (!response.ok) {
                throw new Error('Failed to fetch clusters')
            }

            const data = await response.json()
            setClusters(data.clusters || [])
        } catch (error) {
            console.error('Error fetching clusters:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleReview = async (clusterId: string, action: 'approve' | 'defer') => {
        try {
            setReviewing(clusterId)

            const response = await fetch(
                `${SUPABASE_URL}/functions/v1/review-cluster`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        cluster_id: clusterId,
                        action: action,
                        reviewer_notes: action === 'approve' ? 'Approved via UI' : 'Deferred for later review'
                    })
                }
            )

            if (!response.ok) {
                throw new Error('Failed to review cluster')
            }

            // Refresh the list
            await fetchPendingClusters()
        } catch (error) {
            console.error('Error reviewing cluster:', error)
            alert('Failed to review cluster. Please try again.')
        } finally {
            setReviewing(null)
        }
    }

    if (loading) {
        return (
            <div className="review-queue">
                <div className="review-queue__loading">
                    <Loader size={48} className="spinner" />
                    <p>Loading pending reviews...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="review-queue">
            <div className="review-queue__header">
                <span className="review-queue__count">
                    {clusters.length} item{clusters.length !== 1 ? 's' : ''} pending review
                </span>
                <Button variant="ghost" onClick={fetchPendingClusters}>
                    Refresh
                </Button>
            </div>

            <div className="review-queue__items">
                {clusters.map((cluster) => (
                    <Card key={cluster.id} padding="lg" className="review-card">
                        <div className="review-card__header">
                            <div className="review-card__title">
                                <span className="review-card__cluster-id">{cluster.id.substring(0, 8)}</span>
                                <Badge variant="neutral" size="sm">{cluster.category}</Badge>
                                <Badge
                                    variant={cluster.severity_score >= 4 ? 'danger' : 'warning'}
                                    size="sm"
                                >
                                    Severity {cluster.severity_score}
                                </Badge>
                            </div>
                            {cluster.requires_human_review && (
                                <Badge variant="warning" size="sm" dot>
                                    Requires Review
                                </Badge>
                            )}
                        </div>

                        <div className="review-card__meta">
                            <span>State: {cluster.state}</span>
                            <span>Priority: {cluster.priority_score}</span>
                            {cluster.complaint_count && (
                                <span>{cluster.complaint_count} complaints</span>
                            )}
                        </div>

                        {cluster.assigned_playbook && (
                            <div className="review-card__section">
                                <h4>AI Suggests</h4>
                                <div className="review-card__playbook">
                                    <code>{cluster.assigned_playbook}</code>
                                </div>
                            </div>
                        )}

                        <div className="review-card__actions">
                            <Button
                                variant="primary"
                                icon={<Check size={16} />}
                                onClick={() => handleReview(cluster.id, 'approve')}
                                disabled={reviewing === cluster.id}
                            >
                                {reviewing === cluster.id ? 'Reviewing...' : 'Approve'}
                            </Button>
                            <Button
                                variant="ghost"
                                icon={<X size={16} />}
                                onClick={() => handleReview(cluster.id, 'defer')}
                                disabled={reviewing === cluster.id}
                            >
                                Defer
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>

            {clusters.length === 0 && (
                <div className="review-queue__empty">
                    <AlertCircle size={48} />
                    <h3>All caught up!</h3>
                    <p>No items require review at this time.</p>
                </div>
            )}
        </div>
    )
}
