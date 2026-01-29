import { Clock, Users, AlertTriangle, MapPin } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MetricCard } from '../components/ui'
import OperationsHub from '../components/three/OperationsHub'
import './Dashboard.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type MetricSnapshot = {
    pendingReview: number
    activeClusters: number
    teamsDeployed: number
    forecastRisk: string
    forecastDetail?: string
}

type ActivityEntry = {
    id: string
    text: string
    time: string
    type: string
    timestamp: number
}

type InsightItem = {
    agent: string
    action: string
    confidence: number | null
    detail: string
}

type ForecastRow = {
    zone_id: string | null
    risk_score: number | null
    predicted_category: string | null
}

type ForecastSignalRow = {
    weather_rain_prob: number | null
    event_type: string | null
}

type ComplaintRow = {
    id: string
    created_at: string | null
    text: string | null
    location_label: string | null
    category_pred: string | null
    severity_pred: number | null
    status: string | null
}

type ClusterRow = {
    id: string
    created_at: string | null
    category: string | null
    location_label: string | null
    zone_id: string | null
    severity_score: number | null
    complaint_count: number | null
    state: string | null
    description: string | null
    requires_human_review?: boolean | null
}

type TaskRow = {
    id: string
    created_at: string | null
    task_type: string | null
    assigned_team: string | null
    status: string | null
}

type EvidenceRow = {
    id: string
    submitted_at: string | null
    notes: string | null
    task_id: string | null
}

type PlaybookScoreRow = {
    id: string
    playbook_name: string
    category: string | null
    success_count: number | null
    fail_count: number | null
}

const EMPTY_METRICS: MetricSnapshot = {
    pendingReview: 0,
    activeClusters: 0,
    teamsDeployed: 0,
    forecastRisk: '-',
}

function formatDateLocal(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function formatRelativeTime(timestamp?: string | null) {
    if (!timestamp) return '-'
    const diffMs = Date.now() - new Date(timestamp).getTime()
    if (Number.isNaN(diffMs)) return '-'
    const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0)
    if (diffMinutes < 1) return 'just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
}

function compact(text?: string | null, max = 80) {
    if (!text) return 'Update logged'
    const trimmed = text.trim()
    if (trimmed.length <= max) return trimmed
    return `${trimmed.slice(0, max)}...`
}

function toTimestamp(value?: string | null) {
    return value ? new Date(value).getTime() : 0
}

function formatZone(zone?: string | null) {
    if (!zone) return 'Unknown area'
    return zone
}

export default function Dashboard() {
    const [metrics, setMetrics] = useState<MetricSnapshot>(EMPTY_METRICS)
    const [activities, setActivities] = useState<ActivityEntry[]>([])
    const [insights, setInsights] = useState<InsightItem[]>([])

    const supabaseHeaders = useMemo(() => ({
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    }), [SUPABASE_ANON_KEY])

    useEffect(() => {
        const fetchJson = async <T,>(path: string): Promise<T | null> => {
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: supabaseHeaders })
            if (!response.ok) {
                console.warn('Supabase request failed:', path, response.status)
                return null
            }
            return response.json()
        }

        const loadDashboardData = async () => {
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            const tomorrowStr = formatDateLocal(tomorrow)

            const [clusters, teams, tasks, forecasts, forecastSignals, complaints, evidence, playbookScores] = await Promise.all([
                fetchJson<ClusterRow[]>(
                    'clusters?state=not.in.(CLOSED,RESOLVED)&select=id,state,requires_human_review,created_at,category,location_label,zone_id,severity_score,complaint_count,description'
                ),
                fetchJson<Array<{ id: string }>>('teams?is_active=eq.true&select=id'),
                fetchJson<TaskRow[]>(
                    'tasks?status=in.(PLANNED,IN_PROGRESS,DISPATCHED)&select=id,assigned_team,status,created_at,task_type'
                ),
                fetchJson<ForecastRow[]>(
                    `forecasts?date=eq.${tomorrowStr}&order=risk_score.desc&limit=10&select=zone_id,risk_score,predicted_category`
                ),
                fetchJson<ForecastSignalRow[]>(
                    `forecast_signals?date=eq.${tomorrowStr}&order=weather_rain_prob.desc&limit=1&select=weather_rain_prob,event_type`
                ),
                fetchJson<ComplaintRow[]>(
                    'complaints?order=created_at.desc&limit=6&select=id,created_at,text,location_label,category_pred,severity_pred,status'
                ),
                fetchJson<EvidenceRow[]>(
                    'evidence?order=submitted_at.desc&limit=6&select=id,submitted_at,notes,task_id'
                ),
                fetchJson<PlaybookScoreRow[]>(
                    'playbook_scores?order=success_count.desc&limit=6&select=id,playbook_name,category,success_count,fail_count'
                ),
            ])

            const activeClusters = clusters ?? []
            const pendingReview = activeClusters.filter((cluster) => {
                const state = (cluster.state || '').toUpperCase()
                return cluster.requires_human_review || state === 'REVIEW' || state === 'PENDING_REVIEW'
            }).length

            const activeTeams = teams?.length ?? 0
            const deployedTeams = tasks && tasks.length > 0
                ? new Set(tasks.map((task) => task.assigned_team).filter(Boolean)).size
                : 0
            const teamsDeployed = deployedTeams > 0 ? deployedTeams : activeTeams

            let forecastRisk = '-'
            let forecastDetail: string | undefined

            const riskRows = forecasts ?? []
            if (riskRows.length > 0) {
                const highRisk = riskRows.filter((row) => Number(row.risk_score ?? 0) >= 0.7)
                const top = riskRows[0]
                forecastRisk = highRisk.length > 0 ? `${highRisk.length} zones` : 'Low'
                if (top?.zone_id) {
                    const score = Math.round((Number(top.risk_score ?? 0) || 0) * 100)
                    forecastDetail = `Top: ${formatZone(top.zone_id)} (${score}%)`
                }
            } else {
                const signal = forecastSignals?.[0]
                if (signal) {
                    const rainProb = Number(signal.weather_rain_prob ?? 0)
                    forecastRisk = rainProb >= 0.7 ? 'High' : rainProb >= 0.4 ? 'Medium' : 'Low'
                    forecastDetail = Number.isFinite(rainProb) ? `Rain ${Math.round(rainProb * 100)}%` : signal.event_type || undefined
                }
            }

            setMetrics({
                pendingReview,
                activeClusters: activeClusters.length,
                teamsDeployed,
                forecastRisk,
                forecastDetail,
            })

            const activityItems: ActivityEntry[] = []

            for (const complaint of complaints ?? []) {
                const timestamp = toTimestamp(complaint.created_at)
                activityItems.push({
                    id: `complaint-${complaint.id}`,
                    text: `Complaint: ${compact(complaint.text)} @ ${formatZone(complaint.location_label)}`,
                    time: formatRelativeTime(complaint.created_at),
                    type: 'triage',
                    timestamp,
                })
            }

            for (const cluster of clusters ?? []) {
                const timestamp = toTimestamp(cluster.created_at)
                activityItems.push({
                    id: `cluster-${cluster.id}`,
                    text: `Cluster ${cluster.category ?? 'issue'} (${cluster.complaint_count ?? 0}) - ${compact(cluster.description || cluster.location_label || cluster.zone_id)}`,
                    time: formatRelativeTime(cluster.created_at),
                    type: 'dispatch',
                    timestamp,
                })
            }

            for (const task of tasks ?? []) {
                const timestamp = toTimestamp(task.created_at)
                activityItems.push({
                    id: `task-${task.id}`,
                    text: `Task ${task.task_type ?? 'work order'} ${task.status ? `(${task.status})` : ''}`,
                    time: formatRelativeTime(task.created_at),
                    type: task.status && task.status.toLowerCase().includes('complete') ? 'verify' : 'dispatch',
                    timestamp,
                })
            }

            for (const proof of evidence ?? []) {
                const timestamp = toTimestamp(proof.submitted_at)
                activityItems.push({
                    id: `evidence-${proof.id}`,
                    text: `Evidence uploaded${proof.task_id ? ` for task ${proof.task_id.slice(0, 6)}` : ''}: ${compact(proof.notes, 60)}`,
                    time: formatRelativeTime(proof.submitted_at),
                    type: 'verify',
                    timestamp,
                })
            }

            activityItems.sort((a, b) => b.timestamp - a.timestamp)
            setActivities(activityItems.slice(0, 4))

            const scoreRows = playbookScores ?? []
            const insightItems = scoreRows.slice(0, 3).map((row) => {
                const success = Number(row.success_count ?? 0)
                const fail = Number(row.fail_count ?? 0)
                const total = success + fail
                const rate = total > 0 ? success / total : 0
                return {
                    agent: row.playbook_name,
                    action: row.category ? row.category.toUpperCase() : 'PLAYBOOK',
                    confidence: rate,
                    detail: `${success} success · ${fail} fail`,
                }
            })
            setInsights(insightItems)
        }

        loadDashboardData().catch((error) => {
            console.error('Failed to load dashboard data:', error)
        })
        const interval = window.setInterval(() => {
            loadDashboardData().catch((error) => {
                console.error('Failed to refresh dashboard data:', error)
            })
        }, 60000)

        return () => window.clearInterval(interval)
    }, [supabaseHeaders, SUPABASE_URL, SUPABASE_ANON_KEY])

    return (
        <div className="dashboard">
            {/* 3D Operations Hub */}
            <section className="dashboard__hub">
                <OperationsHub />
            </section>

            {/* KPI Cards */}
            <section className="dashboard__metrics">
                <MetricCard
                    label="Pending Review"
                    value={metrics.pendingReview}
                    icon={<Clock size={18} />}
                />
                <MetricCard
                    label="Active Clusters"
                    value={metrics.activeClusters}
                    icon={<MapPin size={18} />}
                />
                <MetricCard
                    label="Teams Deployed"
                    value={metrics.teamsDeployed}
                    icon={<Users size={18} />}
                />
                <MetricCard
                    label="At-Risk Zones"
                    value={metrics.forecastRisk}
                    trend={metrics.forecastDetail ? 'up' : undefined}
                    trendValue={metrics.forecastDetail}
                    icon={<AlertTriangle size={18} />}
                />
            </section>

            {/* Activity feeds */}
            <section className="dashboard__feeds">
                <div className="dashboard__feed">
                    <h3>Recent Activity</h3>
                    <div className="dashboard__feed-list">
                        {activities.length === 0 ? (
                            <div className="activity-item">
                                <span className="activity-item__text">No recent activity yet</span>
                            </div>
                        ) : (
                            activities.map((activity) => (
                                <ActivityItem
                                    key={activity.id}
                                    time={activity.time}
                                    text={activity.text}
                                    type={activity.type}
                                />
                            ))
                        )}
                    </div>
                </div>

                <div className="dashboard__feed">
                    <h3>Playbook Performance</h3>
                    <div className="dashboard__feed-list">
                        {insights.length === 0 ? (
                            <div className="agent-item">
                                <div className="agent-item__header">
                                    <span className="agent-item__name">No playbook stats yet</span>
                                </div>
                            </div>
                        ) : (
                            insights.map((decision, index) => (
                                <AgentItem
                                    key={`${decision.agent}-${index}`}
                                    agent={decision.agent}
                                    action={decision.action}
                                    confidence={decision.confidence ?? 0}
                                    detail={decision.detail}
                                />
                            ))
                        )}
                    </div>
                </div>
            </section>
        </div>
    )
}

function ActivityItem({ time, text, type }: { time: string; text: string; type: string }) {
    const typeColors: Record<string, string> = {
        dispatch: 'var(--color-primary)',
        triage: 'var(--color-info)',
        verify: 'var(--color-success)',
        forecast: 'var(--color-secondary)',
        system: 'var(--color-muted)',
    }

    const color = typeColors[type] ?? typeColors.system

    return (
        <div className="activity-item">
            <span className="activity-item__dot" style={{ background: color }} />
            <span className="activity-item__text">{text}</span>
            <span className="activity-item__time">{time}</span>
        </div>
    )
}

function AgentItem({ agent, action, confidence, detail }: {
    agent: string; action: string; confidence: number; detail: string
}) {
    return (
        <div className="agent-item">
            <div className="agent-item__header">
                <span className="agent-item__name">{agent}</span>
                <span className="agent-item__action">{action}</span>
            </div>
            <div className="agent-item__body">
                <span className="agent-item__detail">{detail}</span>
                <span className="agent-item__confidence">{Math.round(confidence * 100)}%</span>
            </div>
        </div>
    )
}
