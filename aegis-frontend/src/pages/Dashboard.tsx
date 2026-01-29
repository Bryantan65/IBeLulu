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
}

type AgentDecision = {
    agent: string
    action: string
    confidence: number | null
    detail: string
}

type AuditLogRow = {
    id: string
    agent_name: string | null
    action: string | null
    entity_type: string | null
    inputs_summary: Record<string, unknown> | null
    outputs_summary: Record<string, unknown> | null
    confidence: number | null
    timestamp: string | null
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

function extractSummary(payload?: Record<string, unknown> | null) {
    if (!payload) return null
    const preferredKeys = ['summary', 'decision', 'playbook', 'playbook_name', 'reason', 'result', 'recommendation', 'note']
    for (const key of preferredKeys) {
        const value = payload[key]
        if (typeof value === 'string' && value.trim()) return value
    }
    for (const value of Object.values(payload)) {
        if (typeof value === 'string' && value.trim()) return value
    }
    return null
}

function buildActivityText(entry: AuditLogRow) {
    const summary = extractSummary(entry.outputs_summary) || extractSummary(entry.inputs_summary)
    if (summary) return summary
    const entity = entry.entity_type ? entry.entity_type.replace(/_/g, ' ') : 'Entity'
    const action = entry.action ? entry.action.replace(/_/g, ' ') : 'updated'
    return `${entity} ${action}`
}

function mapActivityType(entry: AuditLogRow) {
    const action = (entry.action || '').toLowerCase()
    const entity = (entry.entity_type || '').toLowerCase()
    if (action.includes('dispatch') || action.includes('assign')) return 'dispatch'
    if (action.includes('triage') || entity.includes('complaint')) return 'triage'
    if (action.includes('verify') || action.includes('complete')) return 'verify'
    if (action.includes('forecast') || entity.includes('forecast')) return 'forecast'
    return 'system'
}

export default function Dashboard() {
    const [metrics, setMetrics] = useState<MetricSnapshot>(EMPTY_METRICS)
    const [activities, setActivities] = useState<ActivityEntry[]>([])
    const [agentDecisions, setAgentDecisions] = useState<AgentDecision[]>([])

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

            const [clusters, teams, tasks, auditLogs, forecasts, forecastSignals] = await Promise.all([
                fetchJson<Array<{ id: string; state: string | null; requires_human_review: boolean | null; created_at: string | null }>>(
                    'clusters?state=not.in.(CLOSED,RESOLVED)&select=id,state,requires_human_review,created_at'
                ),
                fetchJson<Array<{ id: string }>>('teams?is_active=eq.true&select=id'),
                fetchJson<Array<{ id: string; assigned_team: string | null; status: string | null }>>(
                    'tasks?status=in.(PLANNED,IN_PROGRESS,DISPATCHED)&select=id,assigned_team,status'
                ),
                fetchJson<AuditLogRow[]>(
                    'audit_log?order=timestamp.desc&limit=8&select=id,agent_name,action,entity_type,inputs_summary,outputs_summary,confidence,timestamp'
                ),
                fetchJson<Array<{ risk_score: number | null; predicted_category: string | null; reason: string | null }>>(
                    `forecasts?date=eq.${tomorrowStr}&order=risk_score.desc&limit=1&select=risk_score,predicted_category,reason`
                ),
                fetchJson<Array<{ weather_rain_prob: number | null; event_type: string | null }>>(
                    `forecast_signals?date=eq.${tomorrowStr}&order=weather_rain_prob.desc&limit=1&select=weather_rain_prob,event_type`
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

            const forecast = forecasts?.[0]
            const signal = forecastSignals?.[0]

            if (forecast) {
                const riskScore = Number(forecast.risk_score ?? 0)
                forecastRisk = riskScore >= 0.8 ? 'High' : riskScore >= 0.5 ? 'Medium' : 'Low'
                forecastDetail = forecast.reason || (forecast.predicted_category ? `Category: ${forecast.predicted_category}` : undefined)
            } else if (signal) {
                const rainProb = Number(signal.weather_rain_prob ?? 0)
                forecastRisk = rainProb >= 0.7 ? 'High' : rainProb >= 0.4 ? 'Medium' : 'Low'
                forecastDetail = Number.isFinite(rainProb) ? `Rain ${Math.round(rainProb * 100)}%` : signal.event_type || undefined
            }

            setMetrics({
                pendingReview,
                activeClusters: activeClusters.length,
                teamsDeployed,
                forecastRisk,
                forecastDetail,
            })

            const logs = auditLogs ?? []
            const activityEntries = logs.slice(0, 4).map((entry) => ({
                id: entry.id,
                text: buildActivityText(entry),
                time: formatRelativeTime(entry.timestamp),
                type: mapActivityType(entry),
            }))
            setActivities(activityEntries)

            const agentEntries = logs
                .filter((entry) => entry.agent_name)
                .slice(0, 3)
                .map((entry) => ({
                    agent: entry.agent_name || 'Agent',
                    action: entry.action ? entry.action.toUpperCase() : 'ACTION',
                    confidence: entry.confidence ?? null,
                    detail: extractSummary(entry.outputs_summary) || extractSummary(entry.inputs_summary) || `${entry.entity_type ?? 'Entity'} update`,
                }))
            setAgentDecisions(agentEntries)
        }

        loadDashboardData().catch((error) => {
            console.error('Failed to load dashboard data:', error)
        })
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
                    label="Tomorrow Risk"
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
                    <h3>Agent Decisions</h3>
                    <div className="dashboard__feed-list">
                        {agentDecisions.length === 0 ? (
                            <div className="agent-item">
                                <div className="agent-item__header">
                                    <span className="agent-item__name">No agent decisions yet</span>
                                </div>
                            </div>
                        ) : (
                            agentDecisions.map((decision, index) => (
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
