import { useState, useEffect } from 'react'
import { Button, Badge, Card } from '../components/ui'
import { Check, X, AlertCircle, Loader, RefreshCw, Shield, Clock, MapPin } from 'lucide-react'
import { sendMessageToAgent, ChatMessage } from '../services/orchestrate'
import './ReviewQueue.css'

const REVIEW_AGENT_ID = 'f3c41796-118f-4f5a-a77c-e29890eaca6e'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface Cluster {
    id: string
    category: string
    severity_score: number
    state?: string
    requires_human_review?: boolean
    assigned_playbook?: string | null
    priority_score?: number
    complaint_count?: number
}

interface ClusterReview {
    id: string
    category: string
    severity_score: number
    zone_id: string
    created_at: string
    description?: string
    complaint_count?: number
    recurrence_count?: number
    priority_score?: number
    assigned_playbook?: string
    requires_human_review?: boolean
    reason_for_priority?: string
    fairness_flag?: boolean
}

function extractJsonArray(text: string): string | null {
    const start = text.indexOf('[')
    if (start === -1) return null

    let depth = 0
    let inString = false
    let escape = false

    for (let i = start; i < text.length; i++) {
        const ch = text[i]

        if (inString) {
            if (escape) {
                escape = false
            } else if (ch === '\\') {
                escape = true
            } else if (ch === '"') {
                inString = false
            }
            continue
        }

        if (ch === '"') {
            inString = true
            continue
        }

        if (ch === '[') depth += 1
        if (ch === ']') {
            depth -= 1
            if (depth === 0) {
                return text.slice(start, i + 1)
            }
        }
    }

    return null
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

export default function ReviewQueue() {
    const [clusters, setClusters] = useState<Cluster[]>([])
    const [reviewData, setReviewData] = useState<ClusterReview[]>([])
    const [loading, setLoading] = useState(true)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [reviewError, setReviewError] = useState<string>('')
    const [reviewing, setReviewing] = useState<string | null>(null)

    useEffect(() => {
        runReviewAnalysis()
    }, [])

    const fetchTriagedClusters = async () => {
        try {
            setLoading(true)
            const response = await fetch(`${SUPABASE_URL}/rest/v1/clusters?select=id,category,severity_score,zone_id,created_at,recurrence_count,priority_score,assigned_playbook,requires_human_review,last_action_at,description,complaint_count&state=eq.TRIAGED&order=priority_score.desc.nullslast,severity_score.desc,created_at.asc`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })

            if (!response.ok) {
                throw new Error('Failed to fetch clusters')
            }

            const data = await response.json()
            setClusters(data || [])
            return data || []
        } catch (error) {
            console.error('Error fetching clusters:', error)
            return []
        } finally {
            setLoading(false)
        }
    }

    const runReviewAnalysis = async () => {
        setIsAnalyzing(true)
        setReviewError('')
        setReviewData([])

        try {
            const clustersWithCounts = await fetchTriagedClusters()

            if (!clustersWithCounts || clustersWithCounts.length === 0) {
                setReviewError('No triaged clusters found.')
                return
            }

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

            const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
            let jsonPayload = cleaned
            try {
                JSON.parse(jsonPayload)
            } catch {
                const extracted = extractJsonArray(cleaned)
                if (!extracted) throw new Error('No JSON array found in agent response')
                jsonPayload = extracted
            }

            const data = JSON.parse(jsonPayload)
            if (Array.isArray(data)) {
                data.sort((a: any, b: any) => (b.priority_score || b.severity_score || 0) - (a.priority_score || a.severity_score || 0))
                setReviewData(data)
            } else {
                throw new Error('Response is not an array')
            }
        } catch (error: any) {
            console.error('Review analysis failed:', error)
            setReviewError(error?.message || 'Failed to run review analysis.')
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleReview = async (cluster: ClusterReview, action: 'approve' | 'ignore') => {
        if (action === 'ignore') {
            setReviewData((prev) => prev.filter((item) => item.id !== cluster.id))
            return
        }

        try {
            setReviewing(cluster.id)

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
                        review_notes: cluster.reason_for_priority || 'Approved via Review Queue',
                        requires_human_review: cluster.requires_human_review ?? false,
                        last_action_at: new Date().toISOString()
                    })
                }
            )

            if (!response.ok) {
                throw new Error('Failed to review cluster')
            }

            setReviewData((prev) => prev.filter((item) => item.id !== cluster.id))
            await fetchTriagedClusters()
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
                    <p>Loading triaged clusters...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="review-queue">
            <div className="review-queue__header">
                <span className="review-queue__count">
                    {clusters.length} triaged cluster{clusters.length !== 1 ? 's' : ''}
                </span>
                <div className="review-queue__actions">
                    <Button
                        variant="ghost"
                        icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
                        onClick={fetchTriagedClusters}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                    <Button
                        variant="primary"
                        onClick={runReviewAnalysis}
                        disabled={isAnalyzing}
                    >
                        {isAnalyzing ? 'Running...' : 'Run Analysis'}
                    </Button>
                </div>
            </div>

            {isAnalyzing ? (
                <div className="review-queue__loading">
                    <Loader size={48} className="spinner" />
                    <p>Running review agent analysis...</p>
                </div>
            ) : reviewData.length > 0 ? (
                <div className="review-queue__items review-dashboard">
                    {reviewData.map((cluster) => (
                        <Card key={cluster.id} className="review-card">
                            <div className="review-card__header">
                                <div className="review-card__title">
                                    <Badge variant="neutral" size="sm">{cluster.category.toUpperCase()}</Badge>
                                    <span className="review-card__location">
                                        <Clock size={14} /> {getTimeAgo(cluster.created_at)}
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
                                        <MapPin size={14} />
                                        <span>{cluster.zone_id || 'Unknown location'}</span>
                                    </div>
                                    <div className="review-card__info">
                                        <Shield size={14} />
                                        <span>Priority: {cluster.priority_score ?? cluster.severity_score}</span>
                                    </div>
                                    <div className="review-card__info">
                                        <AlertCircle size={14} />
                                        <span>{cluster.complaint_count || 0} complaints</span>
                                    </div>
                                    {cluster.recurrence_count !== undefined && cluster.recurrence_count > 0 && (
                                        <div className="review-card__info">
                                            <RefreshCw size={14} />
                                            <span>Recurred {cluster.recurrence_count}x</span>
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
                                {cluster.fairness_flag && (
                                    <div className="review-card__fairness">
                                        <Shield size={14} />
                                        <span>Fairness boost applied</span>
                                    </div>
                                )}
                            </div>

                            <div className="review-card__actions">
                                <Button
                                    variant="ghost"
                                    icon={<X size={16} />}
                                    onClick={() => handleReview(cluster, 'ignore')}
                                    disabled={reviewing === cluster.id}
                                >
                                    Ignore
                                </Button>
                                <Button
                                    variant="primary"
                                    icon={<Check size={16} />}
                                    onClick={() => handleReview(cluster, 'approve')}
                                    disabled={reviewing === cluster.id}
                                >
                                    {reviewing === cluster.id ? 'Reviewing...' : 'Approve'}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="review-queue__empty">
                    <AlertCircle size={48} />
                    <h3>All caught up!</h3>
                    <p>{reviewError || 'No triaged clusters found.'}</p>
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
