import { useState, useEffect } from 'react'
import { Badge, Card, Button } from '../components/ui'
import { MapPin, AlertTriangle, Shield, ClipboardCheck, X, Loader2, Clock, CheckCircle, RefreshCw } from 'lucide-react'
import { sendMessageToAgent, ChatMessage } from '../services/orchestrate'
import './Hotspots.css'


const REVIEW_AGENT_ID = 'f3c41796-118f-4f5a-a77c-e29890eaca6e'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface Cluster {
    id: string
    category: string
    zone_id: string
    state: string
    severity_score: number
    priority_score: number
    created_at: string
    complaint_count: number
    description?: string
}

interface ClusterReview {
    id: string
    category: string
    severity_score: number
    zone_id: string
    created_at: string
    reason_for_priority?: string
    recurrence_count?: number
    priority_score?: number
    assigned_playbook?: string
    requires_human_review?: boolean
    complaint_count?: number
    last_action_at?: string
    description?: string
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

export default function Hotspots() {
    const [clusters, setClusters] = useState<Cluster[]>([])
    const [loading, setLoading] = useState(true)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [isReviewing, setIsReviewing] = useState(false)
    const [reviewData, setReviewData] = useState<ClusterReview[]>([])
    const [reviewError, setReviewError] = useState<string>('')
    const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set())

    const fetchClusters = async () => {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/clusters?select=id,category,zone_id,state,severity_score,priority_score,created_at,description,complaint_count&order=severity_score.desc`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })
            if (response.ok) {
                const data = await response.json()
                setClusters(data)
            }
        } catch (error) {
            console.error('Failed to fetch clusters:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchClusters()
    }, [])

    const handleReviewClusters = async () => {
        setShowReviewModal(true)
        setIsReviewing(true)
        setReviewData([])
        setReviewError('')

        try {
            // Step 1: Fetch triaged clusters directly from Supabase
            const clusterResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/clusters?select=id,category,severity_score,zone_id,created_at,recurrence_count,priority_score,assigned_playbook,requires_human_review,last_action_at,description,complaint_count&state=eq.TRIAGED&order=priority_score.desc.nullslast,severity_score.desc,created_at.asc`,
                {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    }
                }
            )

            if (!clusterResponse.ok) {
                throw new Error(`Failed to fetch clusters: ${clusterResponse.statusText}`)
            }

            const clustersWithCounts = await clusterResponse.json()

            if (clustersWithCounts.length === 0) {
                setReviewError('No triaged clusters found.')
                setIsReviewing(false)
                return
            }

            // Step 2: Pass data to agent for analysis
            const reviewMessage: ChatMessage = {
                role: 'user',
                text: `Analyze and rank these ${clustersWithCounts.length} triaged complaint clusters. Return ONLY a raw JSON array (no markdown, no backticks) with your recommendations.

DATA:
${JSON.stringify(clustersWithCounts, null, 2)}

TASK:
1. For each cluster, calculate final priority_score using the formula (use existing priority_score as base if available, otherwise calculate from severity)
2. Apply Silent Zone fairness boost (+20) if: complaint_count ≤ 2 AND severity_score ≥ 4 AND recurrence_count ≤ 1
3. Recommend appropriate playbook based on category and severity
4. Write reason_for_priority that references the description content (what residents actually reported)
5. Rank all clusters by final priority_score (descending)

OUTPUT FORMAT - Return ONLY this JSON array structure:
[{"rank":1,"id":"...","category":"...","severity_score":4,"zone_id":"...","created_at":"...","description":"...","complaint_count":3,"recurrence_count":1,"priority_score":95,"assigned_playbook":"deep_clean_protocol","requires_human_review":true,"fairness_flag":false,"reason_for_priority":"Residents report..."}]

NO markdown formatting. NO backticks. ONLY the JSON array.`
            }

            const responseText = await sendMessageToAgent([reviewMessage], REVIEW_AGENT_ID)

            try {
                const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
                const data = JSON.parse(jsonString)
                if (Array.isArray(data)) {
                    data.sort((a: any, b: any) => (b.priority_score || b.severity_score || 0) - (a.priority_score || a.severity_score || 0))
                    setReviewData(data)
                } else {
                    throw new Error("Response is not an array")
                }
            } catch (e) {
                console.error("Failed to parse agent response as JSON", e)
                setReviewError(responseText)
            }

        } catch (error) {
            console.error(error)
            setReviewError('Failed to connect to the Review Agent. Please try again.')
        } finally {
            setIsReviewing(false)
        }
    }

    const handleApproveCluster = async (cluster: ClusterReview) => {
        setApprovingIds(prev => new Set(prev).add(cluster.id))

        try {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/clusters?id=eq.${cluster.id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        state: 'REVIEWED',
                        assigned_playbook: cluster.assigned_playbook || 'manual_review_required',
                        priority_score: cluster.priority_score || 0,
                        review_notes: cluster.reason_for_priority || 'Approved via Hotspots review',
                        requires_human_review: cluster.requires_human_review ?? false,
                        last_action_at: new Date().toISOString()
                    })
                }
            )

            if (!response.ok) {
                throw new Error(`Failed to approve cluster: ${response.statusText}`)
            }

            // Remove approved cluster from review list
            setReviewData(prev => prev.filter(c => c.id !== cluster.id))
            // Refresh main cluster list
            fetchClusters()

        } catch (error) {
            console.error('Failed to approve cluster:', error)
            alert(`Failed to approve cluster: ${error}`)
        } finally {
            setApprovingIds(prev => {
                const next = new Set(prev)
                next.delete(cluster.id)
                return next
            })
        }
    }

    const handleIgnoreCluster = (clusterId: string) => {
        setReviewData(prev => prev.filter(c => c.id !== clusterId))
    }

    return (
        <div className="hotspots">
            {/* Map placeholder */}
            <div className="hotspots__map">
                <div className="hotspots__map-placeholder">
                    <MapPin size={48} />
                    <span>Interactive Map</span>
                    <p>Zone polygons and cluster markers would appear here</p>
                </div>
            </div>

            {/* Cluster list */}
            <div className="hotspots__list">
                <div className="hotspots__list-header">
                    <h3>Active Clusters ({clusters.length})</h3>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
                            onClick={() => { setLoading(true); fetchClusters(); }}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={<ClipboardCheck size={14} />}
                            onClick={handleReviewClusters}
                        >
                            Review
                        </Button>
                    </div>
                </div>
                <div className="hotspots__clusters">
                    {loading ? (
                        <div className="p-4 text-center text-muted">Loading clusters...</div>
                    ) : clusters.length === 0 ? (
                        <div className="p-4 text-center text-muted">No active clusters found.</div>
                    ) : (
                        clusters.map((cluster) => (
                            <Card key={cluster.id} variant="elevated" padding="md" className="hotspots__cluster">
                                <div className="hotspots__cluster-header">
                                    <span className="hotspots__cluster-id">{cluster.id.substring(0, 8)}</span>
                                    <Badge
                                        variant={
                                            cluster.state === 'PLANNED' ? 'success' :
                                                cluster.state === 'REVIEWED' ? 'info' :
                                                    cluster.state === 'TRIAGED' ? 'warning' : 'neutral'
                                        }
                                        size="sm"
                                    >
                                        {cluster.state}
                                    </Badge>
                                </div>

                                <div className="hotspots__cluster-body">
                                    <div className="hotspots__cluster-category">
                                        <AlertTriangle size={16} />
                                        <span>{cluster.category}</span>
                                    </div>
                                    <div className="hotspots__cluster-zone">
                                        <MapPin size={16} />
                                        <span>{cluster.zone_id || 'Unknown Zone'}</span>
                                    </div>
                                    {cluster.description && (
                                        <div className="hotspots__cluster-description">
                                            {cluster.description.length > 120
                                                ? `${cluster.description.substring(0, 120)}...`
                                                : cluster.description}
                                        </div>
                                    )}
                                </div>

                                <div className="hotspots__cluster-footer">
                                    <div className="hotspots__cluster-stats">
                                        <span>Severity: <strong>{cluster.severity_score}</strong></span>
                                        <span>Complaints: <strong>{cluster.complaint_count || 0}</strong></span>
                                    </div>
                                    <div className="hotspots__cluster-priority">
                                        Priority: <strong>{cluster.priority_score || 0}</strong>
                                    </div>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            </div>

            {/* Review Agent Modal */}
            {showReviewModal && (
                <div className="modal-overlay" onClick={() => setShowReviewModal(false)}>
                    <div className="modal-content modal-content--large" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><ClipboardCheck size={20} /> Cluster Review Agent</h2>
                            <button onClick={() => setShowReviewModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="review-modal-body">
                            {isReviewing ? (
                                <div className="review-loading">
                                    <Loader2 size={32} className="animate-spin" />
                                    <p>Analyzing cluster data patterns...</p>
                                </div>
                            ) : reviewData.length > 0 ? (
                                <div className="review-dashboard">
                                    {reviewData.map((cluster) => (
                                        <Card key={cluster.id} className="review-card">
                                            <div className="review-card__header">
                                                <div className="review-card__title">
                                                    <Badge variant="neutral" size="sm">{cluster.category.toUpperCase()}</Badge>
                                                    <span className="review-card__location">
                                                        <MapPin size={14} /> {cluster.zone_id || 'Unknown Location'}
                                                    </span>
                                                </div>
                                                <div className="review-card__severity">
                                                    <span className="text-xs text-muted">Severity</span>
                                                    <SeverityBadge level={cluster.severity_score} />
                                                </div>
                                            </div>

                                            <div className="review-card__content">
                                                <div className={`review-card__description ${!cluster.description ? 'review-card__description--empty' : ''}`}>
                                                    {cluster.description || '⚠️ No description available - cluster may not have linked complaints yet.'}
                                                </div>
                                                <div className="review-card__info-grid">
                                                    <div className="review-card__info">
                                                        <Clock size={14} />
                                                        <span>{getTimeAgo(cluster.created_at)}</span>
                                                    </div>
                                                    <div className="review-card__info">
                                                        <AlertTriangle size={14} />
                                                        <span>{cluster.complaint_count || 0} complaints</span>
                                                    </div>
                                                    {cluster.recurrence_count !== undefined && cluster.recurrence_count > 0 && (
                                                        <div className="review-card__info">
                                                            <RefreshCw size={14} />
                                                            <span>Recurred {cluster.recurrence_count}x</span>
                                                        </div>
                                                    )}
                                                    {cluster.priority_score !== undefined && (
                                                        <div className="review-card__info">
                                                            <Shield size={14} />
                                                            <span>Priority: {cluster.priority_score}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {cluster.assigned_playbook && (
                                                    <div className="review-card__playbook">
                                                        <strong>Playbook:</strong> {cluster.assigned_playbook}
                                                    </div>
                                                )}
                                                {cluster.requires_human_review && (
                                                    <div className="review-card__alert">
                                                        <Shield size={14} />
                                                        <span>Requires Human Review</span>
                                                    </div>
                                                )}
                                                {cluster.reason_for_priority && (
                                                    <div className="review-card__reason">
                                                        <strong>AI Insight:</strong> {cluster.reason_for_priority}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="review-card__actions">
                                                <Button size="sm" variant="ghost" onClick={() => handleIgnoreCluster(cluster.id)}>Ignore</Button>
                                                <Button
                                                    size="sm"
                                                    variant="primary"
                                                    icon={approvingIds.has(cluster.id) ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                                    onClick={() => handleApproveCluster(cluster)}
                                                    disabled={approvingIds.has(cluster.id)}
                                                >
                                                    {approvingIds.has(cluster.id) ? 'Approving...' : 'Approve'}
                                                </Button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="review-response">
                                    <pre>{reviewError || "No clusters found for review."}</pre>
                                </div>
                            )}
                        </div>
                        <div className="form-actions">
                            <Button variant="ghost" onClick={() => setShowReviewModal(false)}>
                                Close
                            </Button>
                            <Button variant="primary" onClick={handleReviewClusters} disabled={isReviewing}>
                                {isReviewing ? 'Running...' : 'Run Analysis'}
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
