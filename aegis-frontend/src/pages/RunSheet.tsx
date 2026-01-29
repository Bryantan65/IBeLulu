import { useState, useEffect } from 'react'
import { Button, Badge, Card } from '../components/ui'
import { Download, Send, Calendar, Clock, Sparkles, Loader, RefreshCw } from 'lucide-react'
import { sendMessageToAgent, ChatMessage } from '../services/orchestrate'
import './RunSheet.css'

const RUNSHEET_PLANNER_AGENT_ID = '3526a9b1-95e0-48f4-ba44-8cfdc5cb3de7'
const DISPATCH_AGENT_ID = 'ffa00917-c317-4950-9b8f-1bc8bfe98549'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface Cluster {
    id: string
    category: string
    severity_score: number
    priority_score: number
    zone_id: string
    state: string
    complaint_count: number
    created_at: string
}

interface Team {
    id: string
    name: string
    members_count: number
    max_tasks_per_window: number
    primary_zone: string
}

interface RunSheet {
    id: string
    team_id: string
    date: string
    time_window: 'AM' | 'PM'
    status: 'draft' | 'dispatched' | 'in_progress' | 'completed'
    zones_covered: string[]
    notes: string | null
    capacity_used_percent: number
    teams?: Team
    run_sheet_tasks?: Array<{
        task_id: string
        sequence: number
    }>
}

interface GroupedRunSheets {
    [teamName: string]: {
        AM: RunSheet[]
        PM: RunSheet[]
    }
}

export default function RunSheet() {
    const [reviewedClusters, setReviewedClusters] = useState<Cluster[]>([])
    const [runSheets, setRunSheets] = useState<RunSheet[]>([])
    const [groupedSheets, setGroupedSheets] = useState<GroupedRunSheets>({})
    const [loading, setLoading] = useState(true)
    const [optimizing, setOptimizing] = useState(false)
    const [agentResponse, setAgentResponse] = useState<string>('')
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
    const [dispatching, setDispatching] = useState<string | null>(null)
    const [dispatchResponse, setDispatchResponse] = useState<string>('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'dispatched' | 'in_progress' | 'completed'>('all')
    const [activeView, setActiveView] = useState<'drafts' | 'all' | 'activity'>('drafts')

    useEffect(() => {
        fetchData()
    }, [selectedDate])

    const fetchData = async () => {
        try {
            setLoading(true)
            await Promise.all([
                fetchReviewedClusters(),
                fetchRunSheets()
            ])
        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchReviewedClusters = async () => {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/clusters?state=eq.REVIEWED&select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'apikey': SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json'
                }
            }
        )

        if (!response.ok) {
            throw new Error('Failed to fetch reviewed clusters')
        }

        const data = await response.json()
        setReviewedClusters(data || [])
    }

    const fetchRunSheets = async () => {
        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/get-run-sheets?date=${selectedDate}`,
            {
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        )

        if (!response.ok) {
            throw new Error('Failed to fetch run sheets')
        }

        const data = await response.json()
        setRunSheets(data.run_sheets || [])
        groupRunSheetsByTeam(data.run_sheets || [])
    }

    const groupRunSheetsByTeam = (sheets: RunSheet[]) => {
        const grouped: GroupedRunSheets = {}
        
        sheets.forEach(sheet => {
            const teamName = sheet.teams?.name || 'Unknown Team'
            if (!grouped[teamName]) {
                grouped[teamName] = { AM: [], PM: [] }
            }
            grouped[teamName][sheet.time_window].push(sheet)
        })
        
        setGroupedSheets(grouped)
    }

    const handleOptimizeRunSheets = async () => {
        try {
            setOptimizing(true)
            setAgentResponse('')

            const message: ChatMessage = {
                role: 'user',
                text: `Create optimized run sheets for all pending REVIEWED clusters for ${selectedDate}. Distribute tasks evenly across teams considering their zones and capacity.`
            }

            // Add retry logic with exponential backoff
            let retries = 3
            let delay = 1000
            let lastError: any = null

            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    console.log(`Attempt ${attempt + 1} of ${retries}...`)
                    const response = await sendMessageToAgent([message], RUNSHEET_PLANNER_AGENT_ID)
                    setAgentResponse(response)
                    
                    // Refresh data after optimization
                    await new Promise(resolve => setTimeout(resolve, 2000))
                    await fetchData()
                    setStatusFilter('draft')
                    setActiveView('drafts')
                    return // Success, exit function
                } catch (error: any) {
                    lastError = error
                    console.warn(`Attempt ${attempt + 1} failed:`, error.message)
                    
                    // If this is not the last attempt, wait before retrying
                    if (attempt < retries - 1) {
                        console.log(`Retrying in ${delay}ms...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        delay *= 2 // Exponential backoff
                    }
                }
            }

            // If we get here, all retries failed
            throw lastError || new Error('All retry attempts failed')

        } catch (error: any) {
            console.error('Error optimizing run sheets:', error)
            const errorMessage = error?.message || String(error)
            setAgentResponse(`Error: Failed to optimize run sheets after multiple attempts.\n\nError: ${errorMessage}\n\nPlease try again. If the issue persists, check your network connection.`)
        } finally {
            setOptimizing(false)
        }
    }


    const handleViewChange = (view: 'drafts' | 'all' | 'activity') => {
        setActiveView(view)
        if (view === 'all') {
            setStatusFilter('all')
        }
    }

    const handleDispatchRunSheet = async (sheet: RunSheet, teamName: string) => {
        try {
            setDispatching(sheet.id)
            setDispatchResponse('')

            const date = new Date(sheet.date)
            const dateStr = date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            })

            const dispatchMessage: ChatMessage = {
                role: 'user',
                text: `Dispatch this run sheet to the field team:

Run Sheet ID: ${sheet.id}
Team: ${teamName}
Date: ${dateStr}
Time Window: ${sheet.time_window}
Tasks: ${sheet.run_sheet_tasks?.length || 0} assigned
Capacity Used: ${sheet.capacity_used_percent}%
Zones: ${sheet.zones_covered?.join(', ') || 'N/A'}

Provide dispatch confirmation and field instructions.`
            }

            const response = await sendMessageToAgent([dispatchMessage], DISPATCH_AGENT_ID)
            setDispatchResponse(response)

            // Update run sheet status to dispatched
            await fetch(
                `${SUPABASE_URL}/rest/v1/run_sheets?id=eq.${sheet.id}`,
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

            // Refresh data
            await fetchData()
        } catch (error) {
            console.error('Error dispatching run sheet:', error)
            setDispatchResponse('Error: Failed to dispatch run sheet. Please try again.')
        } finally {
            setDispatching(null)
        }
    }

    const draftRunSheets = runSheets.filter(sheet => sheet.status === 'draft')
    const hasReviewedClusters = reviewedClusters.length > 0
    const hasRunSheets = runSheets.length > 0
    const hasDrafts = draftRunSheets.length > 0
    const dispatchedCount = runSheets.filter(sheet => sheet.status !== 'draft').length
    const filteredRunSheets = statusFilter === 'all'
        ? runSheets
        : runSheets.filter(sheet => sheet.status === statusFilter)

    if (loading) {
        return (
            <div className="runsheet">
                <div className="runsheet__loading">
                    <Loader size={48} className="spinner" />
                    <p>Loading run sheets...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="runsheet">
            {/* Header */}
            <div className="runsheet__header">
                <div className="runsheet__date">
                    <Calendar size={20} />
                    <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="runsheet__date-picker"
                    />
                </div>
                <div className="runsheet__actions">
                    <Button 
                        variant="ghost" 
                        icon={<RefreshCw size={16} />}
                        onClick={fetchData}
                    >
                        Refresh
                    </Button>
                    <Button 
                        variant="secondary" 
                        icon={optimizing ? <Loader size={16} className="spinner" /> : <Sparkles size={16} />}
                        onClick={handleOptimizeRunSheets}
                        disabled={optimizing || reviewedClusters.length === 0}
                    >
                        {optimizing ? 'Optimizing...' : 'AI Optimize'}
                    </Button>
                    <Button variant="ghost" icon={<Download size={16} />}>Export</Button>
                </div>
            </div>

            {/* Overview */}
            <div className="runsheet__overview">
                <div className="runsheet__summary-strip">
                    <div className="runsheet__summary-card">
                        <span>Reviewed clusters</span>
                        <strong>{reviewedClusters.length}</strong>
                        <small>{hasReviewedClusters ? 'Ready for planning' : 'Awaiting review'}</small>
                    </div>
                    <div className="runsheet__summary-card">
                        <span>Draft run sheets</span>
                        <strong>{draftRunSheets.length}</strong>
                        <small>{hasDrafts ? 'Dispatch from Drafts view' : 'None yet'}</small>
                    </div>
                    <div className="runsheet__summary-card">
                        <span>Dispatched today</span>
                        <strong>{dispatchedCount}</strong>
                        <small>{hasRunSheets ? 'Sent to field' : 'No dispatches yet'}</small>
                    </div>
                </div>
                <div className="runsheet__view-toggle">
                    <button
                        className={`runsheet__view-btn ${activeView === 'drafts' ? 'runsheet__view-btn--active' : ''}`}
                        onClick={() => handleViewChange('drafts')}
                    >
                        Drafts
                        {hasDrafts && <Badge variant="warning" size="sm">{draftRunSheets.length}</Badge>}
                    </button>
                    <button
                        className={`runsheet__view-btn ${activeView === 'all' ? 'runsheet__view-btn--active' : ''}`}
                        onClick={() => handleViewChange('all')}
                    >
                        All run sheets
                    </button>
                    <button
                        className={`runsheet__view-btn ${activeView === 'activity' ? 'runsheet__view-btn--active' : ''}`}
                        onClick={() => handleViewChange('activity')}
                    >
                        AI log
                    </button>
                </div>
            </div>

            {activeView === 'drafts' && (
                <div className="runsheet__panel">
                    {hasReviewedClusters && (
                        <Card className="runsheet__info-banner">
                            <div className="runsheet__info-banner-content">
                                <p><strong>{reviewedClusters.length}</strong> reviewed clusters ready for scheduling</p>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    icon={optimizing ? <Loader size={14} className="spinner" /> : <Sparkles size={14} />}
                                    onClick={handleOptimizeRunSheets}
                                    disabled={optimizing || reviewedClusters.length === 0}
                                >
                                    {optimizing ? 'Optimizing...' : 'Optimize now'}
                                </Button>
                            </div>
                        </Card>
                    )}

                    {hasDrafts ? (
                        <div className="runsheet__drafts-grid">
                            {draftRunSheets.map((sheet) => {
                                const teamName = sheet.teams?.name || 'Unknown Team'
                                return (
                                    <div key={sheet.id} className="runsheet__draft-card">
                                        <div className="runsheet__draft-card-header">
                                            <span className="runsheet__draft-card-team">{teamName}</span>
                                            <Badge variant="warning" size="sm">Draft</Badge>
                                        </div>
                                        <div className="runsheet__draft-card-meta">
                                            <span>{sheet.time_window} window</span>
                                            <span>{sheet.run_sheet_tasks?.length || 0} tasks</span>
                                            <span>{sheet.capacity_used_percent}% capacity</span>
                                        </div>
                                        <div className="runsheet__draft-card-zones">
                                            {sheet.zones_covered?.join(', ') || 'No zones'}
                                        </div>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            icon={dispatching === sheet.id ? <Loader size={14} className="spinner" /> : <Send size={14} />}
                                            onClick={() => handleDispatchRunSheet(sheet, teamName)}
                                            disabled={dispatching === sheet.id}
                                        >
                                            {dispatching === sheet.id ? 'Dispatching...' : 'Dispatch now'}
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <Card className="runsheet__empty">
                            <Sparkles size={48} opacity={0.3} />
                            <h3>No draft run sheets</h3>
                            <p>Run AI Optimize or switch to All Run Sheets to view dispatch history.</p>
                            <div className="runsheet__empty-actions">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={optimizing ? <Loader size={14} className="spinner" /> : <Sparkles size={14} />}
                                    onClick={handleOptimizeRunSheets}
                                    disabled={optimizing || reviewedClusters.length === 0}
                                >
                                    {optimizing ? 'Optimizing...' : 'Optimize now'}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleViewChange('all')}>
                                    View all
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {activeView === 'all' && (
                <div className="runsheet__panel">
                    {hasRunSheets && (
                        <div className="runsheet__filters">
                            <div className="runsheet__filters-group">
                                <span>Show:</span>
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'draft', label: 'Drafts' },
                                    { id: 'dispatched', label: 'Dispatched' },
                                    { id: 'in_progress', label: 'In progress' },
                                    { id: 'completed', label: 'Completed' }
                                ].map(filter => (
                                    <button
                                        key={filter.id}
                                        className={`runsheet__filter-chip ${statusFilter === filter.id ? 'runsheet__filter-chip--active' : ''}`}
                                        onClick={() => setStatusFilter(filter.id as typeof statusFilter)}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                            <Badge variant="neutral" size="sm">
                                Showing {filteredRunSheets.length} of {runSheets.length}
                            </Badge>
                        </div>
                    )}

                    {runSheets.length === 0 && (
                        <Card className="runsheet__empty">
                            <Sparkles size={48} opacity={0.3} />
                            <h3>No Run Sheets Yet</h3>
                            <p>Click "AI Optimize" to create optimized run sheets from reviewed clusters</p>
                        </Card>
                    )}

                    {runSheets.length > 0 && filteredRunSheets.length === 0 && (
                        <Card className="runsheet__empty">
                            <Sparkles size={48} opacity={0.3} />
                            <h3>No Run Sheets Match This Filter</h3>
                            <p>Try switching the filter or clear to see all run sheets.</p>
                        </Card>
                    )}

                    {/* Team columns */}
                    {Object.keys(groupedSheets).length > 0 && (
                        <div className="runsheet__teams">
                            {Object.entries(groupedSheets).filter(([, windows]) => {
                                if (statusFilter === 'all') return true
                                const count = windows.AM.filter(sheet => sheet.status === statusFilter).length
                                    + windows.PM.filter(sheet => sheet.status === statusFilter).length
                                return count > 0
                            }).map(([teamName, windows]) => (
                                <div key={teamName} className="runsheet__team">
                                    <div className="runsheet__team-header">
                                        <h3>{teamName}</h3>
                                        <Badge variant="neutral" size="sm">
                                            {statusFilter === 'all'
                                                ? (windows.AM?.length || 0) + (windows.PM?.length || 0)
                                                : windows.AM.filter(sheet => sheet.status === statusFilter).length + windows.PM.filter(sheet => sheet.status === statusFilter).length
                                            } run sheets
                                        </Badge>
                                    </div>

                                    {['AM', 'PM'].map((window) => (
                                        <div key={window} className="runsheet__window">
                                            <div className="runsheet__window-header">
                                                <Clock size={14} />
                                                <span>{window} Window</span>
                                            </div>
                                            <div className="runsheet__tasks">
                                                {(windows[window as 'AM' | 'PM'] || []).filter(sheet => statusFilter === 'all' || sheet.status === statusFilter).length === 0 ? (
                                                    <p className="runsheet__empty-window">No run sheets</p>
                                                ) : (
                                                    (windows[window as 'AM' | 'PM'] || []).filter(sheet => statusFilter === 'all' || sheet.status === statusFilter).map((sheet) => (
                                                        <Card key={sheet.id} padding="sm" className="runsheet__task">
                                                            <div className="runsheet__task-header">
                                                                <span className="runsheet__task-id">{sheet.id.slice(0, 8)}</span>
                                                                <Badge variant={sheet.status === 'draft' ? 'warning' : 'success'} size="sm">
                                                                    {sheet.status}
                                                                </Badge>
                                                            </div>
                                                            <div className="runsheet__task-info">
                                                                <span className="runsheet__task-zones">
                                                                    {sheet.zones_covered?.join(', ') || 'No zones'}
                                                                </span>
                                                            </div>
                                                            <div className="runsheet__task-capacity">
                                                                Capacity: {sheet.capacity_used_percent}%
                                                            </div>
                                                            <div className="runsheet__task-meta">
                                                                {sheet.run_sheet_tasks?.length || 0} tasks
                                                            </div>
                                                            {sheet.notes && (
                                                                <div className="runsheet__task-notes">{sheet.notes}</div>
                                                            )}
                                                            {sheet.status === 'draft' && (
                                                                <Button
                                                                    variant="primary"
                                                                    size="sm"
                                                                    icon={dispatching === sheet.id ? <Loader size={14} className="spinner" /> : <Send size={14} />}
                                                                    onClick={() => handleDispatchRunSheet(sheet, teamName)}
                                                                    disabled={dispatching === sheet.id}
                                                                    style={{ marginTop: '8px', width: '100%' }}
                                                                >
                                                                    {dispatching === sheet.id ? 'Dispatching...' : 'Dispatch'}
                                                                </Button>
                                                            )}
                                                        </Card>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeView === 'activity' && (
                <div className="runsheet__panel">
                    {!agentResponse && !dispatchResponse && (
                        <Card className="runsheet__empty">
                            <Sparkles size={48} opacity={0.3} />
                            <h3>No AI activity yet</h3>
                            <p>Run AI Optimize or dispatch a run sheet to see responses here.</p>
                        </Card>
                    )}

                    {dispatchResponse && (
                        <Card className="runsheet__agent-response runsheet__agent-response--dispatch">
                            <h4>Dispatch Confirmation</h4>
                            <div className="runsheet__agent-response-content">
                                {(() => {
                                    const renderWithBold = (text: string) => {
                                        const doublePattern = /\*\*(.+?)\*\*/g
                                        let remaining = text.replace(doublePattern, (match, content) => {
                                            return `<BOLD>${content}</BOLD>`
                                        })
                                        
                                        const singlePattern = /\*([^*]+?)\*/g
                                        remaining = remaining.replace(singlePattern, (match, content) => {
                                            return `<BOLD>${content}</BOLD>`
                                        })
                                        
                                        const segments = remaining.split(/(<BOLD>.*?<\/BOLD>)/)
                                        return segments.map((segment, i) => {
                                            if (segment.startsWith('<BOLD>')) {
                                                const content = segment.replace('<BOLD>', '').replace('</BOLD>', '')
                                                return <strong key={i}>{content}</strong>
                                            }
                                            return segment
                                        })
                                    }

                                    const lines = dispatchResponse.split('\n')
                                    return lines.map((line, index) => {
                                        if (line.trim().startsWith('-') || line.trim().startsWith('\u2022')) {
                                            return <li key={index}>{renderWithBold(line.replace(/^[\s-\u2022]+/, ''))}</li>
                                        } else if (line.trim()) {
                                            return <p key={index}>{renderWithBold(line)}</p>
                                        }
                                        return <br key={index} />
                                    })
                                })()}
                            </div>
                        </Card>
                    )}

                    {agentResponse && (
                        <Card className="runsheet__agent-response">
                            <h4>AI Planner Response</h4>
                            <div className="runsheet__agent-response-content">
                                {(() => {
                                    // Helper function to render text with bold formatting
                                    const renderWithBold = (text: string) => {
                                        const doublePattern = /\*\*(.+?)\*\*/g
                                        let remaining = text.replace(doublePattern, (match, content) => {
                                            return `<BOLD>${content}</BOLD>`
                                        })
                                        
                                        const singlePattern = /\*([^*]+?)\*/g
                                        remaining = remaining.replace(singlePattern, (match, content) => {
                                            return `<BOLD>${content}</BOLD>`
                                        })
                                        
                                        const segments = remaining.split(/(<BOLD>.*?<\/BOLD>)/)
                                        return segments.map((segment, i) => {
                                            if (segment.startsWith('<BOLD>')) {
                                                const content = segment.replace('<BOLD>', '').replace('</BOLD>', '')
                                                return <strong key={i}>{content}</strong>
                                            }
                                            return segment
                                        })
                                    }

                                    const lines = agentResponse.split('\n')
                                    const elements: JSX.Element[] = []
                                    let tableLines: string[] = []
                                    let inTable = false

                                    lines.forEach((line, index) => {
                                        const isTableLine = line.includes('|') && !line.trim().startsWith('|---')
                                        const isTableSeparator = line.trim().match(/^\|[-:\s|]+\|$/)

                                        if (isTableLine && !isTableSeparator) {
                                            inTable = true
                                            tableLines.push(line)
                                        } else {
                                            // Render accumulated table
                                            if (inTable && tableLines.length > 0) {
                                                const headerLine = tableLines[0]
                                                if (!headerLine) return
                                                
                                                const headers = headerLine.split('|').map(h => h.trim()).filter(h => h)
                                                const rows = tableLines.slice(1).map(row => 
                                                    row.split('|').map(cell => cell.trim()).filter(cell => cell)
                                                )
                                                
                                                elements.push(
                                                    <table key={`table-${index}`} className="agent-table">
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
                                                inTable = false
                                            }

                                            if (isTableSeparator) return

                                            // Headers
                                            if (line.startsWith('### ')) {
                                                elements.push(<h5 key={index}>{renderWithBold(line.replace('### ', ''))}</h5>)
                                            } else if (line.startsWith('## ')) {
                                                elements.push(<h4 key={index}>{renderWithBold(line.replace('## ', ''))}</h4>)
                                            }
                                            // List items
                                            else if (line.trim().startsWith('-') || line.trim().startsWith('\u2022')) {
                                                elements.push(<li key={index}>{renderWithBold(line.replace(/^[\s-\u2022]+/, ''))}</li>)
                                            } else if (line.trim().match(/^\d+\./)) {
                                                elements.push(<li key={index}>{renderWithBold(line.replace(/^\d+\.\s*/, ''))}</li>)
                                            }
                                            // Empty lines
                                            else if (line.trim() === '') {
                                                elements.push(<br key={index} />)
                                            }
                                            // Regular paragraphs
                                            else if (line.trim()) {
                                                elements.push(<p key={index}>{renderWithBold(line)}</p>)
                                            }
                                        }
                                    })

                                    // Handle remaining table
                                    if (inTable && tableLines.length > 0) {
                                        const headerLine = tableLines[0]
                                        if (!headerLine) return elements
                                        
                                        const headers = headerLine.split('|').map(h => h.trim()).filter(h => h)
                                        const rows = tableLines.slice(1).map(row => 
                                            row.split('|').map(cell => cell.trim()).filter(cell => cell)
                                        )
                                        
                                        elements.push(
                                            <table key="table-final" className="agent-table">
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
                                    }

                                    return elements
                                })()}
                            </div>
                        </Card>
                    )}
                </div>
            )}

        </div>
    )
}
