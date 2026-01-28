import { useState, useEffect } from 'react'
import { Button, Badge, Card } from '../components/ui'
import { Check, X, AlertCircle, Loader, RefreshCw, Shield, Clock, MapPin } from 'lucide-react'
import { sendMessageToAgent, ChatMessage } from '../services/orchestrate'
import './ReviewQueue.css'

const REVIEW_AGENT_ID = 'f3c41796-118f-4f5a-a77c-e29890eaca6e'
const DISPATCH_AGENT_ID = 'ffa00917-c317-4950-9b8f-1bc8bfe98549'
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

interface RunSheet {
    id: string
    team_id: string
    date: string
    time_window: string
    status: string
    capacity_used_percent: number
    created_at: string
    task_count?: number
    zones_covered?: string[]
    task_details?: Array<{
        cluster_id: string
        zone: string
        category: string
    }>
}

interface Team {
    id: string
    name: string
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

function renderWithBold(text: string): React.ReactNode {
    // Handle both *text* and **text** for bold
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g)
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return <strong key={index}>{part.slice(1, -1)}</strong>
        }
        return part
    })
}

function formatAgentResponse(text: string): React.ReactNode[] {
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    let tableLines: string[] = []
    let key = 0

    const flushTable = () => {
        if (tableLines.length > 0) {
            const headerLine = tableLines[0]
            if (!headerLine) return
            
            const separatorIndex = tableLines.findIndex(line => line.includes('---'))
            const dataStart = separatorIndex >= 0 ? separatorIndex + 1 : 1
            
            const headers = headerLine.split('|').map(h => h.trim()).filter(h => h)
            const rows = tableLines.slice(dataStart).map(line => 
                line.split('|').map(cell => cell.trim()).filter(cell => cell)
            )

            elements.push(
                <table key={`table-${key++}`} className="agent-table">
                    <thead>
                        <tr>
                            {headers.map((header, i) => (
                                <th key={i}>{renderWithBold(header)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i}>
                                {row.map((cell, j) => (
                                    <td key={j}>{renderWithBold(cell)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )
            tableLines = []
        }
    }

    lines.forEach((line) => {
        if (line.includes('|') && line.trim().length > 0) {
            tableLines.push(line)
        } else {
            flushTable()
            
            if (line.startsWith('####')) {
                elements.push(<h5 key={key++}>{renderWithBold(line.replace(/^####\s*/, ''))}</h5>)
            } else if (line.startsWith('###')) {
                elements.push(<h4 key={key++}>{renderWithBold(line.replace(/^###\s*/, ''))}</h4>)
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                elements.push(<li key={key++}>{renderWithBold(line.replace(/^[-*]\s*/, ''))}</li>)
            } else if (line.trim().length > 0) {
                elements.push(<p key={key++}>{renderWithBold(line)}</p>)
            }
        }
    })

    flushTable()
    return elements
}

export default function ReviewQueue() {
    const [clusters, setClusters] = useState<Cluster[]>([])
    const [reviewData, setReviewData] = useState<ClusterReview[]>([])
    const [runSheets, setRunSheets] = useState<RunSheet[]>([])
    const [teams, setTeams] = useState<Team[]>([])
    const [loading, setLoading] = useState(true)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [reviewError, setReviewError] = useState<string>('')
    const [reviewing, setReviewing] = useState<string | null>(null)
    const [dispatching, setDispatching] = useState<string | null>(null)
    const [dispatchResponse, setDispatchResponse] = useState<string>('')
    const [dispatchedTeamInfo, setDispatchedTeamInfo] = useState<{ teamName: string; date: string; window: string } | null>(null)

    useEffect(() => {
        runReviewAnalysis()
        fetchDraftRunSheets()
        fetchTeams()
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

    const fetchTeams = async () => {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/teams?select=id,name&status=eq.active&order=name.asc`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })
            if (response.ok) {
                const data = await response.json()
                setTeams(data || [])
            }
        } catch (error) {
            console.error('Error fetching teams:', error)
        }
    }

    const fetchDraftRunSheets = async () => {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/run_sheets?select=id,team_id,date,time_window,status,capacity_used_percent,created_at,zones_covered&status=eq.draft&order=date.asc,time_window.asc`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })
            if (response.ok) {
                const sheets = await response.json()
                // Fetch task counts and details for each run sheet
                const sheetsWithDetails = await Promise.all(
                    sheets.map(async (sheet: RunSheet) => {
                        const tasksResponse = await fetch(`${SUPABASE_URL}/rest/v1/run_sheet_tasks?select=task_id&run_sheet_id=eq.${sheet.id}`, {
                            headers: {
                                'apikey': SUPABASE_ANON_KEY,
                                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                            }
                        })
                        const runSheetTasks = tasksResponse.ok ? await tasksResponse.json() : []
                        
                        // Fetch task details which includes cluster_id
                        const taskDetails = await Promise.all(
                            runSheetTasks.map(async (rst: any) => {
                                const taskResponse = await fetch(`${SUPABASE_URL}/rest/v1/tasks?select=cluster_id&id=eq.${rst.task_id}`, {
                                    headers: {
                                        'apikey': SUPABASE_ANON_KEY,
                                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                                    }
                                })
                                if (taskResponse.ok) {
                                    const tasks = await taskResponse.json()
                                    if (tasks.length > 0 && tasks[0].cluster_id) {
                                        // Now fetch cluster details
                                        const clusterResponse = await fetch(`${SUPABASE_URL}/rest/v1/clusters?select=zone_id,category&id=eq.${tasks[0].cluster_id}`, {
                                            headers: {
                                                'apikey': SUPABASE_ANON_KEY,
                                                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                                            }
                                        })
                                        if (clusterResponse.ok) {
                                            const clusters = await clusterResponse.json()
                                            if (clusters.length > 0) {
                                                return {
                                                    cluster_id: tasks[0].cluster_id,
                                                    zone: clusters[0].zone_id,
                                                    category: clusters[0].category
                                                }
                                            }
                                        }
                                    }
                                }
                                return null
                            })
                        )
                        
                        return { 
                            ...sheet, 
                            task_count: runSheetTasks.length,
                            task_details: taskDetails.filter(t => t !== null)
                        }
                    })
                )
                setRunSheets(sheetsWithDetails || [])
            }
        } catch (error) {
            console.error('Error fetching draft run sheets:', error)
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

    const handleDispatchRunSheet = async (runSheet: RunSheet) => {
        try {
            setDispatching(runSheet.id)
            setDispatchResponse('')

            const team = teams.find(t => t.id === runSheet.team_id)
            const teamName = team?.name || runSheet.team_id
            const date = new Date(runSheet.date)
            const dateStr = date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            })

            // Store team info for display
            setDispatchedTeamInfo({
                teamName,
                date: dateStr,
                window: runSheet.time_window
            })

            const dispatchMessage: ChatMessage = {
                role: 'user',
                text: `Review and dispatch this draft run sheet:

Run Sheet ID: ${runSheet.id}
Team: ${teamName}
Date: ${runSheet.date}
Time Window: ${runSheet.time_window}
Tasks: ${runSheet.task_count || 0} assigned
Capacity Used: ${runSheet.capacity_used_percent}%

Please review the run sheet tasks and provide dispatch instructions. If approved, add dispatch notes and confirm readiness for field deployment.`
            }

            const response = await sendMessageToAgent([dispatchMessage], DISPATCH_AGENT_ID)
            setDispatchResponse(response)

            // Update run sheet status to dispatched
            await fetch(
                `${SUPABASE_URL}/rest/v1/run_sheets?id=eq.${runSheet.id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        status: 'dispatched',
                        dispatched_at: new Date().toISOString()
                    })
                }
            )

            // Refresh the list
            await fetchDraftRunSheets()
        } catch (error) {
            console.error('Error dispatching run sheet:', error)
            alert('Failed to dispatch run sheet. Please try again.')
        } finally {
            setDispatching(null)
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
            {/* Clusters Section */}
            <div className="review-queue__section">
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

            {/* Run Sheets Section */}
            <div className="review-queue__section review-queue__section--runsheets">
                <div className="review-queue__header">
                    <span className="review-queue__count">
                        {runSheets.length} draft run sheet{runSheets.length !== 1 ? 's' : ''}
                    </span>
                    <div className="review-queue__actions">
                        <Button
                            variant="ghost"
                            icon={<RefreshCw size={16} />}
                            onClick={fetchDraftRunSheets}
                        >
                            Refresh
                        </Button>
                    </div>
                </div>

                {dispatchResponse && (
                    <Card className="runsheet__agent-response">
                        <h4>Dispatch Coordinator Response</h4>
                        {dispatchedTeamInfo && (
                            <div style={{ 
                                marginBottom: 'var(--space-3)', 
                                padding: 'var(--space-3)', 
                                background: 'var(--color-surface-1)',
                                borderRadius: 'var(--radius-md)',
                                display: 'flex',
                                gap: 'var(--space-4)',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <Badge variant="info" size="sm">{dispatchedTeamInfo.teamName}</Badge>
                                </div>
                                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                                    <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
                                    {dispatchedTeamInfo.date} • {dispatchedTeamInfo.window}
                                </div>
                            </div>
                        )}
                        <div className="agent-response-content">
                            {formatAgentResponse(dispatchResponse)}
                        </div>
                    </Card>
                )}

                {runSheets.length > 0 ? (
                    <div className="review-queue__items review-dashboard">
                        {runSheets.map((sheet) => {
                            const team = teams.find(t => t.id === sheet.team_id)
                            const teamName = team?.name || sheet.team_id
                            const date = new Date(sheet.date)
                            const dateStr = date.toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                year: 'numeric'
                            })

                            return (
                                <Card key={sheet.id} className="review-card">
                                    <div className="review-card__header">
                                        <div className="review-card__title">
                                            <Badge variant="info" size="sm">{teamName}</Badge>
                                            <span className="review-card__location">
                                                <Clock size={14} /> {dateStr}
                                            </span>
                                        </div>
                                        <div className="review-card__severity">
                                            <Badge variant="warning" size="sm">{sheet.time_window}</Badge>
                                        </div>
                                    </div>

                                    <div className="review-card__content">
                                        <div className="review-card__info-grid">
                                            <div className="review-card__info">
                                                <Shield size={14} />
                                                <span>{sheet.task_count || 0} tasks assigned</span>
                                            </div>
                                            <div className="review-card__info">
                                                <AlertCircle size={14} />
                                                <span>{sheet.capacity_used_percent}% capacity</span>
                                            </div>
                                        </div>
                                        
                                        {sheet.zones_covered && sheet.zones_covered.length > 0 && (
                                            <div className="review-card__playbook">
                                                <strong>Zones:</strong> {sheet.zones_covered.join(', ')}
                                            </div>
                                        )}
                                        
                                        {sheet.task_details && sheet.task_details.length > 0 && (
                                            <div className="review-card__description">
                                                {sheet.task_details.map((task, idx) => (
                                                    <div key={idx} style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                                                        • {task.zone} - {task.category.replace('_', ' ')}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        <div className="review-card__playbook">
                                            <strong>Status:</strong> Ready for dispatch
                                        </div>
                                        <div className="review-card__reason">
                                            <strong>Created:</strong> {getTimeAgo(sheet.created_at)}
                                        </div>
                                    </div>

                                    <div className="review-card__actions">
                                        <Button
                                            variant="primary"
                                            onClick={() => handleDispatchRunSheet(sheet)}
                                            disabled={dispatching === sheet.id}
                                        >
                                            {dispatching === sheet.id ? 'Dispatching...' : 'Dispatch to Field'}
                                        </Button>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                ) : (
                    <div className="review-queue__empty">
                        <AlertCircle size={48} />
                        <h3>No draft run sheets</h3>
                        <p>Create run sheets from the Run Sheet page.</p>
                    </div>
                )}
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
