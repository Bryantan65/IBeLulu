import React, { useState, useEffect } from 'react'
import { Button, Badge, Card } from '../components/ui'
import ImageUpload from '../components/ui/ImageUpload'
import { Check, RotateCcw, Flag, MapPin, Search } from 'lucide-react'
import './Evidence.css'

export default function Evidence() {
    const [evidence, setEvidence] = useState<any[]>([])
    const [filteredEvidence, setFilteredEvidence] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [teamFilter, setTeamFilter] = useState('')
    const [locationFilter, setLocationFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [filesMap, setFilesMap] = useState<Record<string, { beforeFile?: File | null; afterFile?: File | null; uploading?: boolean }>>({})
    const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'success' | 'error' | 'info'; exiting?: boolean }>>([])
    const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetchTasks()
    }, [])

    async function fetchTasks() {
        try {
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
            const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

            console.log('Fetching tasks from:', `${SUPABASE_URL}/rest/v1/tasks`)
            
            const response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?select=*,clusters(*)&status=eq.SCHEDULED`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) {
                console.error('Response not ok:', response.status, response.statusText)
                throw new Error('Failed to fetch tasks')
            }
            
            const tasks = await response.json()
            console.log('Fetched tasks:', tasks)
            
            // Transform tasks to evidence format
            const evidenceData = await Promise.all(tasks.map(async (task: any) => {
                let teamName = task.assigned_team || 'Unassigned'
                
                // Fetch team name if assigned_team is a UUID
                if (task.assigned_team && task.assigned_team !== 'Unassigned') {
                    try {
                        const teamResp = await fetch(`${SUPABASE_URL}/rest/v1/teams?id=eq.${task.assigned_team}&select=name`, {
                            headers: {
                                'apikey': SUPABASE_ANON_KEY,
                                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                            }
                        })
                        if (teamResp.ok) {
                            const teamData = await teamResp.json()
                            if (teamData[0]?.name) {
                                teamName = teamData[0].name
                            }
                        }
                    } catch (e) {
                        console.log('Could not fetch team name for:', task.assigned_team)
                    }
                }
                
                return {
                    id: task.id,
                    taskId: task.id,
                    taskType: task.task_type,
                    zone: task.clusters?.zone_id || 'Unknown Zone',
                    status: 'PENDING',
                    submittedBy: teamName,
                    submittedAt: new Date(task.created_at).toLocaleDateString(),
                    beforeImage: null,
                    afterImage: null,
                }
            }))
            
            console.log('Transformed evidence data:', evidenceData)
            setEvidence(evidenceData)
            setFilteredEvidence(evidenceData)
        } catch (error) {
            console.error('Error fetching tasks:', error)
            pushToast('Failed to load tasks', 'error')
        } finally {
            setLoading(false)
        }
    }

    // Filter and search logic
    useEffect(() => {
        let filtered = evidence

        if (searchTerm) {
            filtered = filtered.filter(item => 
                item.taskId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.taskType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.zone.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }

        if (teamFilter) {
            filtered = filtered.filter(item => item.submittedBy === teamFilter)
        }

        if (locationFilter) {
            filtered = filtered.filter(item => item.zone === locationFilter)
        }

        if (statusFilter) {
            filtered = filtered.filter(item => item.status === statusFilter)
        }

        setFilteredEvidence(filtered)
    }, [evidence, searchTerm, teamFilter, locationFilter, statusFilter])

    // Get unique values for filters
    const uniqueTeams = [...new Set(evidence.map(item => item.submittedBy))]
    const uniqueLocations = [...new Set(evidence.map(item => item.zone))]
    const uniqueStatuses = [...new Set(evidence.map(item => item.status))]

    function pushToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const toast = { id, message, type, exiting: false }
        setToasts((t) => [toast, ...t])

        // start exit sequence slightly before removal to allow animation
        const exitTimer = setTimeout(() => {
            setToasts((t) => t.map((x) => (x.id === id ? { ...x, exiting: true } : x)))
        }, 2700)

        const removeTimer = setTimeout(() => {
            setToasts((t) => t.filter((x) => x.id !== id))
            clearTimeout(exitTimer)
        }, 3000)

        return () => {
            clearTimeout(exitTimer)
            clearTimeout(removeTimer)
            setToasts((t) => t.filter((x) => x.id !== id))
        }
    }

    function handleUpload(itemId: string, which: 'before' | 'after', file?: File) {
        setFilesMap((s) => ({
            ...s,
            [itemId]: {
                ...(s[itemId] || {}),
                [`${which}File`]: file || null,
            },
        }))
        if (file) {
            // update preview immediately
            const url = URL.createObjectURL(file)
            setEvidence((arr) => arr.map((it) => (it.id === itemId ? { ...it, [`${which}Image`]: url } : it)))
        }
    }

    async function verifyAndClose(itemId: string) {
        const item = evidence.find((e) => e.id === itemId)
        if (!item) return

        const fm = filesMap[itemId]
        
        // Check if BOTH images are uploaded
        if (!fm?.beforeFile || !fm?.afterFile) {
            pushToast('Please upload both before and after images before verifying', 'error')
            return
        }

        setLoadingItems(prev => new Set(prev).add(itemId))
        setFilesMap((s) => ({ ...(s), [itemId]: { ...(s[itemId] || {}), uploading: true } }))

        try {
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
            const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

            // 1. Upload images
            const fd = new FormData()
            fd.append('taskId', item.taskId)
            fd.append('before', fm.beforeFile as File)
            fd.append('after', fm.afterFile as File)

            const uploadResp = await fetch(`${SUPABASE_URL}/functions/v1/evidence-upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: fd,
            })

            if (!uploadResp.ok) {
                const text = await uploadResp.text()
                throw new Error(`Upload failed: ${uploadResp.status} ${text}`)
            }

            const uploadData = await uploadResp.json()
            
            // 2. Create evidence record
            const evidenceResp = await fetch(`${SUPABASE_URL}/rest/v1/evidence`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    task_id: item.taskId,
                    before_image_url: uploadData.beforeUrl,
                    after_image_url: uploadData.afterUrl,
                    submitted_by: 'Supervisor',
                    notes: 'Task verified and completed'
                })
            })

            if (!evidenceResp.ok) throw new Error('Failed to create evidence record')

            // 3. Update task status to VERIFIED
            const taskResp = await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${item.taskId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'VERIFIED' })
            })

            if (!taskResp.ok) throw new Error('Failed to update task status')

            // 4. Update run_sheet status to completed
            const runSheetResp = await fetch(`${SUPABASE_URL}/rest/v1/run_sheets?id=in.(select run_sheet_id from run_sheet_tasks where task_id='${item.taskId}')`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'completed' })
            })

            // 5. Update cluster state to CLOSED
            const taskData = await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${item.taskId}&select=cluster_id`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })
            
            const taskInfo = await taskData.json()
            if (taskInfo[0]?.cluster_id) {
                await fetch(`${SUPABASE_URL}/rest/v1/clusters?id=eq.${taskInfo[0].cluster_id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ state: 'CLOSED' })
                })
            }

            setEvidence((arr) => arr.map((it) => (it.id === itemId ? { ...it, status: 'VERIFIED' } : it)))
            setFilesMap((s) => ({ ...(s), [itemId]: { beforeFile: null, afterFile: null, uploading: false } }))
            
            setLoadingItems(prev => { const next = new Set(prev); next.delete(itemId); return next })
            pushToast('Evidence verified and task completed successfully', 'success')
            
            // Reload page to refresh task list
            setTimeout(() => {
                window.location.reload()
            }, 1500)
        } catch (err) {
            console.error('Verification error', err)
            setFilesMap((s) => ({ ...(s), [itemId]: { ...(s[itemId] || {}), uploading: false } }))
            setLoadingItems(prev => { const next = new Set(prev); next.delete(itemId); return next })
            pushToast('Failed to verify evidence. Please try again.', 'error')
        }
    }

    async function returnForRework(itemId: string) {
        const item = evidence.find((e) => e.id === itemId)
        if (!item) return

        setLoadingItems(prev => new Set(prev).add(itemId))

        try {
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
            const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

            // 1. Delete existing evidence records
            await fetch(`${SUPABASE_URL}/rest/v1/evidence?task_id=eq.${item.taskId}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })

            // 2. Update task status to PLANNED
            await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${item.taskId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'REVIEWED' })
            })

            // 3. Update cluster state to REVIEWED
            const taskData = await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${item.taskId}&select=cluster_id`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })
            
            const taskInfo = await taskData.json()
            if (taskInfo[0]?.cluster_id) {
                await fetch(`${SUPABASE_URL}/rest/v1/clusters?id=eq.${taskInfo[0].cluster_id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ state: 'REVIEWED' })
                })
            }

            // 4. Update run_sheet status back to draft
            const runSheetResp = await fetch(`${SUPABASE_URL}/rest/v1/run_sheets?id=in.(select run_sheet_id from run_sheet_tasks where task_id='${item.taskId}')`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'draft' })
            })

            // 5. Remove from run_sheet
            await fetch(`${SUPABASE_URL}/rest/v1/run_sheet_tasks?task_id=eq.${item.taskId}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })

            setEvidence((arr) => arr.filter((it) => it.id !== itemId))
            setFilesMap((s) => {
                const newMap = { ...s }
                delete newMap[itemId]
                return newMap
            })
            
            setLoadingItems(prev => { const next = new Set(prev); next.delete(itemId); return next })
            pushToast('Task returned for rework and will be re-dispatched', 'success')
        } catch (err) {
            console.error('Rework error', err)
            setLoadingItems(prev => { const next = new Set(prev); next.delete(itemId); return next })
            pushToast('Failed to return task for rework. Please try again.', 'error')
        }
    }

    return (
        <div className="evidence">
            {/* Toast container */}
            <div className="toasts">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast ${t.type ? `toast--${t.type}` : ''} ${t.exiting ? 'toast--exit' : 'toast--enter'}`}>
                        <div className="toast__content">{t.message}</div>
                    </div>
                ))}
            </div>
            <div className="evidence__header">
                <span className="evidence__count">
                    {loading ? 'Loading tasks...' : filteredEvidence.length === 0 ? 'No tasks awaiting verification' : `${filteredEvidence.length} tasks awaiting verification`}
                </span>
            </div>

            <div className="evidence__controls">
                <div className="evidence__search">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="evidence__filters">
                    <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                        <option value="">All Teams</option>
                        {uniqueTeams.map(team => (
                            <option key={team} value={team}>{team}</option>
                        ))}
                    </select>
                    <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                        <option value="">All Locations</option>
                        {uniqueLocations.map(location => (
                            <option key={location} value={location}>{location}</option>
                        ))}
                    </select>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">All Status</option>
                        {uniqueStatuses.map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="evidence__list">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                        Loading tasks...
                    </div>
                ) : filteredEvidence.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                        {evidence.length === 0 ? 'No tasks awaiting verification' : 'No tasks match your filters'}
                    </div>
                ) : (
                filteredEvidence.map((item) => {
                    const isLoading = loadingItems.has(item.id)
                    return (
                    <Card key={item.id} padding="lg" className="evidence__card evidence__card--relative">
                        {isLoading && (
                            <div className="evidence__loading-overlay">
                                <div className="evidence__loading-spinner"></div>
                                <span>Verifying evidence...</span>
                            </div>
                        )}
                        <div className="evidence__card-header">
                            <div className="evidence__card-info">
                                <div className="evidence__task-details">
                                    <span className="evidence__task-id">Task ID: {item.taskId}</span>
                                    <Badge variant="info" size="sm">{item.taskType.replace('_', ' ')}</Badge>
                                </div>
                                <div className="evidence__location">
                                    <MapPin size={14} />
                                    <span className="evidence__zone">{item.zone}</span>
                                </div>
                            </div>
                            <Badge variant={item.status === 'VERIFIED' ? 'success' : 'warning'} size="sm">{item.status}</Badge>
                        </div>

                        <div className="evidence__images">
                            <div className="evidence__image-container">
                                <span className="evidence__image-label">Before</span>
                                <div className="evidence__image">
                                    <ImageUpload
                                        label="Before Photo"
                                        onUpload={async (file) => handleUpload(item.id, 'before', file || undefined)}
                                    />
                                </div>
                            </div>
                            <div className="evidence__image-container">
                                <span className="evidence__image-label">After</span>
                                <div className="evidence__image">
                                    <ImageUpload
                                        label="After Photo"
                                        onUpload={async (file) => handleUpload(item.id, 'after', file || undefined)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="evidence__meta">
                            <span>Assigned to: <strong>{item.submittedBy}</strong></span>
                            <span>{item.submittedAt}</span>
                        </div>

                        <div className="evidence__actions">
                            <Button variant="primary" icon={<Check size={16} />} onClick={() => verifyAndClose(item.id)}>
                                Verify & Close
                            </Button>
                            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => returnForRework(item.id)}>
                                Return for Rework
                            </Button>
                            <Button variant="ghost" icon={<Flag size={16} />}>
                                Flag Issue
                            </Button>
                        </div>
                    </Card>
                    )
                })
                )}
            </div>
        </div>
    )
}