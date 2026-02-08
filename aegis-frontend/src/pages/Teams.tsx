import { useEffect, useMemo, useState } from 'react'
import { Badge, Card, Button } from '../components/ui'
import { RefreshCcw, Users, Activity, ClipboardList, ShieldCheck } from 'lucide-react'
import './Teams.css'

type Team = {
    id: string
    name: string
    primary_zone?: string
    members_count?: number
    max_tasks_per_window?: number
    is_active?: boolean
}

type Task = {
    id: string
    assigned_team?: string
    task_type?: string
    status?: string
    time_window?: 'AM' | 'PM'
    planned_date?: string
    clusters?: {
        location_label?: string
        zone_id?: string
        category?: string
    }
}

type RunSheet = {
    id: string
    team_id?: string
    time_window?: 'AM' | 'PM'
    status?: string
    capacity_used_percent?: number
    run_sheet_tasks?: Array<{ task_id?: string }>
}

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10)

function humanizeZone(value?: string) {
    if (!value) return 'Zone not set'
    const cleaned = value.replace(/^locations_location_/, '')
    return cleaned
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim()
}

export default function Teams() {
    const [teams, setTeams] = useState<Team[]>([])
    const [tasksByTeam, setTasksByTeam] = useState<Record<string, Task[]>>({})
    const [runSheetsByTeam, setRunSheetsByTeam] = useState<Record<string, RunSheet[]>>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()))
    const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

    useEffect(() => {
        fetchTeamData(selectedDate)
    }, [selectedDate])

    async function fetchTeamData(date: string) {
        try {
            setLoading(true)
            setError(null)

            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
            const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

            const teamsResp = await fetch(
                `${SUPABASE_URL}/rest/v1/teams?select=id,name,primary_zone,members_count,max_tasks_per_window,is_active&order=name.asc`,
                {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (!teamsResp.ok) {
                throw new Error('Failed to fetch teams')
            }

            const teamsData: Team[] = await teamsResp.json()
            setTeams(teamsData)

            if (!teamsData.length) {
                setTasksByTeam({})
                setRunSheetsByTeam({})
                return
            }

            const ids = teamsData.map((team) => team.id).filter(Boolean)
            const idsFilter = ids.join(',')

            const runSheetsResp = await fetch(
                `${SUPABASE_URL}/rest/v1/run_sheets?select=id,team_id,time_window,status,capacity_used_percent,run_sheet_tasks(task_id)&date=eq.${date}`,
                {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (!runSheetsResp.ok) {
                throw new Error('Failed to fetch run sheets')
            }

            const runSheetsData: RunSheet[] = await runSheetsResp.json()
            const runSheetMap: Record<string, RunSheet[]> = {}
            for (const sheet of runSheetsData) {
                const teamId = sheet.team_id
                if (!teamId) continue
                if (!runSheetMap[teamId]) {
                    runSheetMap[teamId] = []
                }
                runSheetMap[teamId]!.push(sheet)
            }
            setRunSheetsByTeam(runSheetMap)

            const tasksResp = await fetch(
                `${SUPABASE_URL}/rest/v1/tasks?select=id,assigned_team,task_type,status,time_window,planned_date,clusters(location_label,zone_id,category)` +
                `&planned_date=eq.${date}&assigned_team=in.(${idsFilter})&status=neq.VERIFIED`,
                {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (!tasksResp.ok) {
                throw new Error('Failed to fetch tasks')
            }

            const tasksData: Task[] = await tasksResp.json()
            const taskMap: Record<string, Task[]> = {}
            for (const task of tasksData) {
                const teamId = task.assigned_team
                if (!teamId) continue
                if (!taskMap[teamId]) {
                    taskMap[teamId] = []
                }
                taskMap[teamId].push(task)
            }
            setTasksByTeam(taskMap)
            setLastUpdatedAt(new Date())
        } catch (err) {
            console.error('Teams page fetch failed:', err)
            setError(err instanceof Error ? err.message : 'Failed to load team data')
        } finally {
            setLoading(false)
        }
    }

    function countTasks(tasks: Task[], window: 'AM' | 'PM') {
        return tasks.filter((task) => task.time_window === window).length
    }

    function formatCapacity(tasks: Task[], maxTasks = 0, window: 'AM' | 'PM') {
        const used = countTasks(tasks, window)
        if (!maxTasks) return `${used} tasks`
        return `${used}/${maxTasks} tasks`
    }

    function runSheetForWindow(runSheets: RunSheet[], window: 'AM' | 'PM') {
        return runSheets.find((sheet) => sheet.time_window === window)
    }

    const summary = useMemo(() => {
        const activeTeams = teams.filter((team) => team.is_active).length
        const totalTasks = Object.values(tasksByTeam).reduce((sum, tasks) => sum + tasks.length, 0)
        const busyTeams = Object.entries(tasksByTeam).filter(([, tasks]) => tasks.length > 0).length
        const totalCapacity = teams.reduce((sum, team) => sum + (team.max_tasks_per_window || 0) * 2, 0)
        const utilization = totalCapacity ? Math.round((totalTasks / totalCapacity) * 100) : 0
        return { activeTeams, totalTasks, busyTeams, utilization }
    }, [teams, tasksByTeam])

    return (
        <div className="teams">
            <div className="teams__header">
                <div>
                    <div className="teams__title">
                        <Users size={22} />
                        <h2>Teams</h2>
                    </div>
                    <p className="teams__subtitle">Availability, capacity, and assigned work for field teams.</p>
                </div>
                <div className="teams__controls">
                    <input
                        className="teams__date"
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                    />
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={<RefreshCcw size={14} />}
                        onClick={() => fetchTeamData(selectedDate)}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="teams__summary">
                <Card className="teams__summary-card" padding="md">
                    <div className="teams__summary-icon teams__summary-icon--active">
                        <ShieldCheck size={18} />
                    </div>
                    <div>
                        <div className="teams__summary-label">Active teams</div>
                        <div className="teams__summary-value">{summary.activeTeams}</div>
                    </div>
                </Card>
                <Card className="teams__summary-card" padding="md">
                    <div className="teams__summary-icon teams__summary-icon--tasks">
                        <ClipboardList size={18} />
                    </div>
                    <div>
                        <div className="teams__summary-label">Tasks assigned</div>
                        <div className="teams__summary-value">{summary.totalTasks}</div>
                    </div>
                </Card>
                <Card className="teams__summary-card" padding="md">
                    <div className="teams__summary-icon teams__summary-icon--busy">
                        <Activity size={18} />
                    </div>
                    <div>
                        <div className="teams__summary-label">Teams busy</div>
                        <div className="teams__summary-value">{summary.busyTeams}</div>
                    </div>
                </Card>
                <Card className="teams__summary-card" padding="md">
                    <div>
                        <div className="teams__summary-label">Capacity used</div>
                        <div className="teams__summary-value">{summary.utilization}%</div>
                        <div className="teams__summary-meta">
                            {lastUpdatedAt ? `Updated ${lastUpdatedAt.toLocaleTimeString()}` : 'No refresh yet'}
                        </div>
                    </div>
                </Card>
            </div>

            {error && <div className="teams__error">{error}</div>}

            {loading ? (
                <div className="teams__loading">Loading teams...</div>
            ) : teams.length === 0 ? (
                <div className="teams__empty">No teams available.</div>
            ) : (
                <div className="teams__grid">
                    {teams.map((team) => {
                        const teamTasks = tasksByTeam[team.id] || []
                        const runSheets = runSheetsByTeam[team.id] || []
                        const amSheet = runSheetForWindow(runSheets, 'AM')
                        const pmSheet = runSheetForWindow(runSheets, 'PM')
                        const maxTasks = team.max_tasks_per_window || 0

                        return (
                            <Card key={team.id} padding="lg" className="teams__card">
                                <div className="teams__card-header">
                                    <div>
                                        <div className="teams__name">{team.name}</div>
                                        <div className="teams__meta" title={humanizeZone(team.primary_zone)}>
                                            {humanizeZone(team.primary_zone)}
                                        </div>
                                    </div>
                                    <Badge variant={team.is_active ? 'success' : 'neutral'} size="sm">
                                        {team.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>

                                <div className="teams__windows">
                                    <div className="teams__window">
                                        <span className="teams__window-label">AM</span>
                                        <span className="teams__window-value">
                                            {formatCapacity(teamTasks, maxTasks, 'AM')}
                                        </span>
                                        <span className="teams__window-status">
                                            {amSheet?.status ? amSheet.status : 'No run sheet'}
                                        </span>
                                    </div>
                                    <div className="teams__window">
                                        <span className="teams__window-label">PM</span>
                                        <span className="teams__window-value">
                                            {formatCapacity(teamTasks, maxTasks, 'PM')}
                                        </span>
                                        <span className="teams__window-status">
                                            {pmSheet?.status ? pmSheet.status : 'No run sheet'}
                                        </span>
                                    </div>
                                </div>

                                <div className="teams__details">
                                    <div className="teams__detail">
                                        <span className="teams__detail-label">Members</span>
                                        <span>{team.members_count ?? 'N/A'}</span>
                                    </div>
                                    <div className="teams__detail">
                                        <span className="teams__detail-label">Assigned</span>
                                        <span>{teamTasks.length}</span>
                                    </div>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
