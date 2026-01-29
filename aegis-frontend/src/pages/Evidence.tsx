import React, { useState } from 'react'
import { Button, Badge, Card } from '../components/ui'
import ImageUpload from '../components/ui/ImageUpload'
import { Check, RotateCcw, Flag } from 'lucide-react'
import './Evidence.css'

// Mock evidence data
const initialEvidence = [
    {
        id: 'EV001',
        taskId: 'T001',
        taskType: 'bin_washdown',
        zone: 'Bedok North',
        status: 'PENDING',
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
        status: 'PENDING',
        submittedBy: 'Team Lead B',
        submittedAt: '4h ago',
        beforeImage: '/placeholder-before.jpg',
        afterImage: '/placeholder-after.jpg',
    },
]

export default function Evidence() {
    const [evidence, setEvidence] = useState(() => initialEvidence)
    const [filesMap, setFilesMap] = useState<Record<string, { beforeFile?: File | null; afterFile?: File | null; uploading?: boolean }>>({})
    const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'success' | 'error' | 'info'; exiting?: boolean }>>([])
    const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set())

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
        
        // Check if at least one image is uploaded
        if (!fm?.beforeFile && !fm?.afterFile) {
            pushToast('Please upload at least one image before verifying', 'error')
            return
        }

        setLoadingItems(prev => new Set(prev).add(itemId))
        setFilesMap((s) => ({ ...(s), [itemId]: { ...(s[itemId] || {}), uploading: true } }))

        try {
            let beforeUrl = item.beforeImage
            let afterUrl = item.afterImage

            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
            const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

            const fd = new FormData()
            fd.append('taskId', item.taskId)
            if (fm?.beforeFile) fd.append('before', fm.beforeFile as File)
            if (fm?.afterFile) fd.append('after', fm.afterFile as File)

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/evidence-upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: fd,
            })

            if (!resp.ok) {
                const text = await resp.text()
                throw new Error(`Upload failed: ${resp.status} ${text}`)
            }

            const data = await resp.json()
            if (data.beforeUrl) beforeUrl = data.beforeUrl
            if (data.afterUrl) afterUrl = data.afterUrl

            // Update local state to show stored URLs and mark VERIFIED
            setEvidence((arr) => arr.map((it) => (it.id === itemId ? { ...it, beforeImage: beforeUrl, afterImage: afterUrl, status: 'VERIFIED' } : it)))
            
            // Clear file entries and images on success
            setFilesMap((s) => ({ ...(s), [itemId]: { beforeFile: null, afterFile: null, uploading: false } }))
            
            setLoadingItems(prev => { const next = new Set(prev); next.delete(itemId); return next })
            pushToast('Evidence verified and uploaded successfully', 'success')
        } catch (err) {
            console.error('Upload error', err)
            setFilesMap((s) => ({ ...(s), [itemId]: { ...(s[itemId] || {}), uploading: false } }))
            setLoadingItems(prev => { const next = new Set(prev); next.delete(itemId); return next })
            pushToast('Failed to verify evidence. Please try again.', 'error')
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
                <span className="evidence__count">{evidence.length} pending verification</span>
            </div>

            <div className="evidence__list">
                {evidence.map((item) => {
                    const isLoading = loadingItems.has(item.id)
                    return (
                    <Card key={item.id} padding="lg" className="evidence__card" style={{ position: 'relative' }}>
                        {isLoading && (
                            <div className="evidence__loading-overlay">
                                <div className="evidence__loading-spinner"></div>
                                <span>Verifying evidence...</span>
                            </div>
                        )}
                        <div className="evidence__card-header">
                            <div className="evidence__card-info">
                                <span className="evidence__task-id">{item.taskId}</span>
                                <Badge variant="info" size="sm">{item.taskType.replace('_', ' ')}</Badge>
                                <span className="evidence__zone">{item.zone}</span>
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
                            <span>Submitted by: <strong>{item.submittedBy}</strong></span>
                            <span>{item.submittedAt}</span>
                        </div>

                        <div className="evidence__actions">
                            <Button variant="primary" icon={<Check size={16} />} onClick={() => verifyAndClose(item.id)}>
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
                )})})
            </div>
        </div>
    )
}
