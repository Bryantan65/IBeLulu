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

        setFilesMap((s) => ({ ...(s), [itemId]: { ...(s[itemId] || {}), uploading: true } }))

        try {
            const fm = filesMap[itemId]
            let beforeUrl = item.beforeImage
            let afterUrl = item.afterImage

            // If no files selected, simply mark verified locally
            if (!fm?.beforeFile && !fm?.afterFile) {
                setEvidence((arr) => arr.map((it) => (it.id === itemId ? { ...it, status: 'VERIFIED' } : it)))
                setFilesMap((s) => ({ ...(s), [itemId]: { beforeFile: null, afterFile: null, uploading: false } }))
                return
            }

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

            // Clear file entries for this item
            setFilesMap((s) => ({ ...(s), [itemId]: { beforeFile: null, afterFile: null, uploading: false } }))
        } catch (err) {
            console.error('Upload error', err)
            setFilesMap((s) => ({ ...(s), [itemId]: { ...(s[itemId] || {}), uploading: false } }))
            alert('Upload failed. See console for details.')
        }
    }

    return (
        <div className="evidence">
            <div className="evidence__header">
                <span className="evidence__count">{evidence.length} pending verification</span>
            </div>

            <div className="evidence__list">
                {evidence.map((item) => (
                    <Card key={item.id} padding="lg" className="evidence__card">
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
                ))}
            </div>
        </div>
    )
}
