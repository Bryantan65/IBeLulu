import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, Button } from '../components/ui'
import { MapPin, AlertTriangle, ClipboardCheck, RefreshCw, Shield, X, Loader2, Clock, CheckCircle } from 'lucide-react'
import { sendMessageToAgent, ChatMessage } from '../services/orchestrate'
import './Hotspots.css'

import { GoogleMap, useJsApiLoader, Marker, MarkerClusterer, Circle } from '@react-google-maps/api';
import { getLatLngForLocation } from '../utils/geocode';
import { customMapStyle, darkMapStyle, lightMapStyle } from '../components/three/globe/MapTheme';

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

interface ClusterPosition extends Cluster {
    lat: number
    lng: number
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

const MAP_CENTER = { lat: 1.3521, lng: 103.8198 }; // Singapore
const MAP_ZOOM = 12;
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%', borderRadius: 'var(--radius-lg)' };

const MAP_THEMES = {
    custom: customMapStyle,
    dark: darkMapStyle,
    light: lightMapStyle,
};

export default function Hotspots() {
    const navigate = useNavigate()
    const [clusters, setClusters] = useState<Cluster[]>([])
    const [clusterPositions, setClusterPositions] = useState<ClusterPosition[]>([])
    const [loading, setLoading] = useState(true)
    const [mapTheme, setMapTheme] = useState<'custom' | 'dark' | 'light'>(() => {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        return isDark ? 'dark' : 'light'
    })
    const [geocodeCache, setGeocodeCache] = useState<{ [zone: string]: { lat: number, lng: number } }>({})
    const mapRef = useRef<google.maps.Map | null>(null)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [isReviewing, setIsReviewing] = useState(false)
    const [reviewData, setReviewData] = useState<ClusterReview[]>([])
    const [reviewError, setReviewError] = useState<string>('')
    const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set())
    const [highlightedCluster, setHighlightedCluster] = useState<string | null>(null)

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

    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    });

    useEffect(() => {
        fetchClusters()
    }, [])

    // Geocode all cluster locations when clusters change with rate limiting
    useEffect(() => {
        if (!isLoaded || clusters.length === 0) return;
        let cancelled = false;
        const fetchPositions = async () => {
            const newCache = { ...geocodeCache };
            const positions: (ClusterPosition | null)[] = [];
            
            // Process clusters in batches to avoid overwhelming the API
            const batchSize = 5;
            for (let i = 0; i < clusters.length; i += batchSize) {
                if (cancelled) break;
                
                const batch = clusters.slice(i, i + batchSize);
                const batchPromises = batch.map(async (c) => {
                    if (c.zone_id && newCache[c.zone_id]) {
                        return { ...c, ...newCache[c.zone_id] } as ClusterPosition;
                    }
                    try {
                        const pos = await getLatLngForLocation(c.zone_id, import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
                        newCache[c.zone_id] = pos;
                        return { ...c, ...pos } as ClusterPosition;
                    } catch {
                        return null;
                    }
                });
                
                const batchResults = await Promise.all(batchPromises);
                positions.push(...batchResults);
                
                // Add delay between batches to respect API rate limits
                if (i + batchSize < clusters.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            if (!cancelled) {
                setGeocodeCache(newCache);
                setClusterPositions(positions.filter((p): p is ClusterPosition => p !== null));
            }
        };
        fetchPositions();
        return () => { cancelled = true; };
        // eslint-disable-next-line
    }, [clusters, isLoaded]);

    const handleReviewClusters = async () => {
        setShowReviewModal(true)
        setIsReviewing(true)
        setReviewData([])
        setReviewError('')

        try {
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
                    throw new Error("Response is not an array")
                }
            } catch (e) {
                console.error("Failed to parse agent response as JSON", e)
                setReviewError(`Unable to parse agent response. Raw output:\n\n${responseText}`)
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

            setReviewData(prev => prev.filter(c => c.id !== cluster.id))
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

    const handleClusterClick = (clusterId: string, lat: number, lng: number) => {
        setHighlightedCluster(clusterId)
        
        // Center and zoom map to cluster location
        if (mapRef.current) {
            mapRef.current.panTo({ lat, lng })
            mapRef.current.setZoom(15)
        }
        
        setTimeout(() => {
            const element = document.getElementById(`cluster-${clusterId}`)
            const container = document.querySelector('.hotspots__clusters')
            if (element && container) {
                const elementTop = element.offsetTop
                const containerHeight = container.clientHeight
                const elementHeight = element.clientHeight
                const scrollTo = elementTop - (containerHeight / 2) + (elementHeight / 2)
                container.scrollTo({ top: scrollTo, behavior: 'smooth' })
            }
        }, 100)
        setTimeout(() => setHighlightedCluster(null), 3000)
    }

    return (
        <div className="hotspots">
            {/* Map integration */}
            <div className="hotspots__map">
                {isLoaded ? (
                    <div style={{ position: 'relative', height: '100%' }}>
                        <GoogleMap
                            onLoad={map => { mapRef.current = map; }}
                            mapContainerStyle={MAP_CONTAINER_STYLE}
                            center={MAP_CENTER}
                            zoom={MAP_ZOOM}
                            options={{
                                styles: MAP_THEMES[mapTheme],
                                disableDefaultUI: true,
                                backgroundColor: 'var(--color-surface-1)',
                                minZoom: 12,
                                maxZoom: 18,
                                restriction: {
                                    latLngBounds: {
                                        north: 1.47,
                                        south: 1.16,
                                        east: 104.1,
                                        west: 103.6
                                    },
                                    strictBounds: true
                                }
                            }}
                        >
                            {clusterPositions.length > 0 && (
                                clusterPositions.map((c) => (
                                    <Circle
                                        key={c.id}
                                        center={{ lat: c.lat, lng: c.lng }}
                                        radius={200 + (c.severity_score * 50)}
                                        options={{
                                            fillColor: c.severity_score >= 4 ? '#ef4444' : c.severity_score >= 3 ? '#f59e0b' : '#10b981',
                                            fillOpacity: 0.6,
                                            strokeColor: c.severity_score >= 4 ? '#dc2626' : c.severity_score >= 3 ? '#d97706' : '#059669',
                                            strokeOpacity: 0.8,
                                            strokeWeight: 2,
                                            clickable: true
                                        }}
                                        onClick={() => {
                                            handleClusterClick(c.id, c.lat, c.lng);
                                        }}
                                    />
                                ))
                            )}
                        </GoogleMap>
                        
                        {/* Map Style Control - Outside GoogleMap but overlaid */}
                        <div className="map-style-control">
                            <select 
                                value={mapTheme} 
                                onChange={e => setMapTheme(e.target.value as 'custom' | 'dark' | 'light')}
                            >
                                <option value="custom">Custom</option>
                                <option value="dark">Dark</option>
                                <option value="light">Light</option>
                            </select>
                        </div>
                    </div>
                ) : (
                    <div className="hotspots__map-placeholder">
                        <MapPin size={48} />
                        <span>Loading Map...</span>
                    </div>
                )}
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
                            variant="ghost"
                            size="sm"
                            icon={<ClipboardCheck size={14} />}
                            onClick={handleReviewClusters}
                        >
                            Quick Review
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={<ClipboardCheck size={14} />}
                            onClick={() => navigate('/review')}
                        >
                            Review Queue
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
                            <Card 
                                key={cluster.id} 
                                variant="elevated" 
                                padding="md" 
                                className={`hotspots__cluster ${highlightedCluster === cluster.id ? 'hotspots__cluster--highlight' : ''}`}
                                id={`cluster-${cluster.id}`}
                            >
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
