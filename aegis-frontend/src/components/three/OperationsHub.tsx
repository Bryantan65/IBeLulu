// Operations Hub - 3D Map visualization using Google Maps Map3DElement
// Supports Global ↔ Singapore view transitions with photorealistic 3D tiles
import { useEffect, useRef, useCallback, useState } from 'react'
import { useOperationsStore } from '../../store'
import SceneOverlay, { ViewMode } from './ui/SceneOverlay'
import './OperationsHub.css'

// Supabase configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Data interfaces
interface ClusterData {
    id: string
    category: string
    location_label: string
    zone_id: string
    severity_score: number
    complaint_count: number
    state: string
    lat?: number
    lng?: number
}

interface ComplaintData {
    id: string
    text: string
    location_label: string
    severity_pred: number
    category_pred: string
    status: string
    lat?: number
    lng?: number
}

// Severity color mapping
const SEVERITY_COLORS = {
    1: '#22c55e', // green - low
    2: '#eab308', // yellow - moderate
    3: '#f97316', // orange - high
    4: '#ef4444', // red - critical
    5: '#dc2626', // dark red - severe
}

const clampSeverity = (value?: number | null) => {
    const numeric = typeof value === 'number' ? value : Number(value)
    const safe = Number.isFinite(numeric) ? Math.round(numeric) : 3
    return Math.min(5, Math.max(1, safe))
}

const getSeverityColor = (value?: number | null) =>
    SEVERITY_COLORS[clampSeverity(value) as keyof typeof SEVERITY_COLORS]

const darkenColor = (hex: string, amount = 30) => {
    const clamp = (value: number) => Math.max(0, Math.min(255, value))
    const normalized = hex.replace('#', '')
    if (normalized.length !== 6) return hex
    const r = clamp(parseInt(normalized.slice(0, 2), 16) - amount)
    const g = clamp(parseInt(normalized.slice(2, 4), 16) - amount)
    const b = clamp(parseInt(normalized.slice(4, 6), 16) - amount)
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

// Camera presets for each view mode
const VIEWS = {
    global: {
        center: { lat: 10, lng: 105, altitude: 0 },
        range: 5_000_000,
        tilt: 0,
        heading: 0,
    },
    singapore: {
        center: { lat: 1.3521, lng: 103.8198, altitude: 200 },
        range: 18000,
        tilt: 55,
        heading: 0,
    },
}

const TRANSITION_MS = 2500

// Helper: Create circular polygon coordinates for zone overlay
function createCircleCoordinates(lat: number, lng: number, radiusMeters: number, points = 32) {
    const coords: Array<{ lat: number; lng: number; altitude: number }> = []
    const earthRadius = 6371000 // meters

    for (let i = 0; i <= points; i++) {
        const angle = (i * 360) / points
        const rad = (angle * Math.PI) / 180

        const latOffset = (radiusMeters / earthRadius) * (180 / Math.PI)
        const lngOffset = (radiusMeters / earthRadius) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180)

        const circleLat = lat + latOffset * Math.cos(rad)
        const circleLng = lng + lngOffset * Math.sin(rad)

        coords.push({ lat: circleLat, lng: circleLng, altitude: 0 })
    }

    return coords
}

// Geocoding cache to avoid repeated API calls
const geocodeCache = new Map<string, { lat: number; lng: number } | null>()

// Helper: Geocode location label to lat/lng using Google Geocoding API
async function geocodeLocation(locationLabel: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
    // Check cache first
    if (geocodeCache.has(locationLabel)) {
        return geocodeCache.get(locationLabel)!
    }

    // Default to Singapore center if no location
    const singaporeCenter = { lat: 1.3521, lng: 103.8198 }
    if (!locationLabel) {
        geocodeCache.set(locationLabel, singaporeCenter)
        return singaporeCenter
    }

    try {
        // Add "Singapore" to the query if not already present
        const query = locationLabel.toLowerCase().includes('singapore')
            ? locationLabel
            : `${locationLabel}, Singapore`

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
        )
        const data = await response.json()

        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const result = {
                lat: data.results[0].geometry.location.lat,
                lng: data.results[0].geometry.location.lng
            }
            geocodeCache.set(locationLabel, result)
            return result
        } else {
            console.warn(`Geocoding failed for "${locationLabel}":`, data.status)
            // Fallback to Singapore center
            geocodeCache.set(locationLabel, singaporeCenter)
            return singaporeCenter
        }
    } catch (error) {
        console.error('Geocoding error:', error)
        // Fallback to Singapore center
        geocodeCache.set(locationLabel, singaporeCenter)
        return singaporeCenter
    }
}

// Google-recommended async bootstrap loader (runs once at module level)
function ensureMapsBootstrap(apiKey: string) {
    const g: Record<string, string> = { key: apiKey, v: 'alpha' }
    const w = window as any
    const c = 'google'
    const l = 'importLibrary'
    const q = '__ib__'
    const m = document

    w[c] = w[c] || {}
    const d = w[c].maps || (w[c].maps = {})
    const r = new Set<string>()
    const e = new URLSearchParams()

    if (d[l]) return // Already bootstrapped

    let h: Promise<void> | null = null
    const u = () =>
        h ||
        (h = new Promise<void>((resolve, reject) => {
            const a = m.createElement('script')
            e.set('libraries', [...r].join(','))
            for (const k in g) {
                e.set(
                    k.replace(/[A-Z]/g, (t: string) => '_' + t[0].toLowerCase()),
                    g[k] ?? ''
                )
            }
            e.set('callback', c + '.maps.' + q)
            a.src = `https://maps.${c}apis.com/maps/api/js?` + e
            d[q] = resolve
            a.onerror = () => {
                h = null
                reject(new Error('Google Maps JavaScript API could not load.'))
            }
            a.nonce = (m.querySelector('script[nonce]') as HTMLScriptElement)?.nonce || ''
            m.head.append(a)
        }))

    d[l] = (f: string, ...n: any[]) => {
        r.add(f)
        return u().then(() => d[l](f, ...n))
    }
}

export default function OperationsHub() {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapContainerRef = useRef<HTMLDivElement>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map3dRef = useRef<any>(null)
    const markersRef = useRef<any[]>([])
    const polygonsRef = useRef<any[]>([])

    const [clustersData, setClustersData] = useState<ClusterData[]>([])
    const [complaintsData, setComplaintsData] = useState<ComplaintData[]>([])
    const [hoveredItem, setHoveredItem] = useState<{ type: 'cluster' | 'complaint'; data: ClusterData | ComplaintData } | null>(null)
    const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

    const { viewMode, isTransitioning, setViewMode, setIsTransitioning, setSceneReady } = useOperationsStore()
    const tilesApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string

    // ── Track mouse position for tooltip ──────────────────────────────
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (hoveredItem && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect()
                setTooltipPosition({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                })
            }
        }

        if (hoveredItem) {
            window.addEventListener('mousemove', handleMouseMove)
            return () => window.removeEventListener('mousemove', handleMouseMove)
        }
    }, [hoveredItem])

    // ── Fetch clusters and complaints data ────────────────────────────
    const fetchData = useCallback(async () => {
        try {
            // Fetch clusters
            const clustersResponse = await fetch(`${SUPABASE_URL}/rest/v1/clusters?state=not.in.(CLOSED,RESOLVED)&select=*`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })
            if (clustersResponse.ok) {
                const clusters = await clustersResponse.json()
                setClustersData(clusters)
            }

            // Fetch recent complaints
            const complaintsResponse = await fetch(`${SUPABASE_URL}/rest/v1/complaints?order=created_at.desc&limit=100&select=*`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            })
            if (complaintsResponse.ok) {
                const complaints = await complaintsResponse.json()
                setComplaintsData(complaints)
            }
        } catch (error) {
            console.error('Failed to fetch data:', error)
        }
    }, [])

    // ── Add zone polygons and complaint markers ────────────────────────
    const addOverlays = useCallback(async () => {
        const map3d = map3dRef.current
        if (!map3d) return

        try {
            const { Polygon3DElement, Marker3DElement } = await (window as any).google.maps.importLibrary('maps3d')
            const { PinElement } = await (window as any).google.maps.importLibrary('marker')

            // Clear existing overlays
            markersRef.current.forEach(marker => marker.remove?.())
            polygonsRef.current.forEach(polygon => polygon.remove?.())
            markersRef.current = []
            polygonsRef.current = []

            // Add zone polygons for clusters
            for (const cluster of clustersData) {
                const coords = await geocodeLocation(cluster.location_label || cluster.zone_id, tilesApiKey)
                if (!coords) continue

                // Calculate zone radius based on complaint count (battle royale style)
                const baseRadius = 200 // meters
                const radius = baseRadius + (cluster.complaint_count * 20)

                // Create circular zone polygon
                const circlePath = createCircleCoordinates(coords.lat, coords.lng, radius)

                // Determine zone color based on severity
                const color = getSeverityColor(cluster.severity_score)

                // Convert hex color to rgba with opacity for Polygon3DElement
                const hexToRgba = (hex: string, alpha: number) => {
                    const r = parseInt(hex.slice(1, 3), 16)
                    const g = parseInt(hex.slice(3, 5), 16)
                    const b = parseInt(hex.slice(5, 7), 16)
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`
                }

                const polygon = new Polygon3DElement({
                    path: circlePath,
                    strokeColor: color,
                    strokeWidth: 3,
                    fillColor: hexToRgba(color, 0.15),
                    altitudeMode: 'CLAMP_TO_GROUND',
                    extruded: false,
                })

                // Add hover events for cluster zones
                polygon.addEventListener('gmp-mouseenter', () => {
                    setHoveredItem({ type: 'cluster', data: cluster })
                    polygon.strokeWidth = 5 // Highlight on hover
                })

                polygon.addEventListener('gmp-mouseleave', () => {
                    setHoveredItem(null)
                    polygon.strokeWidth = 3 // Reset
                })

                map3d.append(polygon)
                polygonsRef.current.push(polygon)
            }

            // Add complaint markers
            for (const complaint of complaintsData) {
                const coords = await geocodeLocation(complaint.location_label, tilesApiKey)
                if (!coords) continue

                const color = getSeverityColor(complaint.severity_pred)

                const marker = new Marker3DElement({
                    position: { lat: coords.lat, lng: coords.lng, altitude: 0 },
                    altitudeMode: 'CLAMP_TO_GROUND',
                    extruded: true,
                })

                // Style the marker with severity color via PinElement (supported customization)
                const pin = new PinElement({
                    background: color,
                    borderColor: darkenColor(color, 25),
                    glyphColor: '#ffffff',
                    scale: 1.0,
                })
                marker.appendChild(pin.element ?? pin)

                // Add hover events for complaint markers
                marker.addEventListener('gmp-mouseenter', () => {
                    setHoveredItem({ type: 'complaint', data: complaint })
                    marker.style.setProperty('--gmp-3d-marker-scale', '1.0') // Enlarge on hover (if supported)
                })

                marker.addEventListener('gmp-mouseleave', () => {
                    setHoveredItem(null)
                    marker.style.setProperty('--gmp-3d-marker-scale', '0.7') // Reset
                })

                // Add click handler for complaint details
                marker.addEventListener('gmp-click', () => {
                    console.log('Complaint clicked:', complaint)
                })

                map3d.append(marker)
                markersRef.current.push(marker)
            }

            console.log(`Added ${polygonsRef.current.length} zones and ${markersRef.current.length} complaint markers`)
        } catch (error) {
            console.error('Failed to add overlays:', error)
        }
    }, [clustersData, complaintsData, tilesApiKey])

    // ── Load Google Maps JS API & create Map3DElement ──────────────────
    useEffect(() => {
        if (!mapContainerRef.current || !tilesApiKey) return

        let cancelled = false

        // Install the async bootstrap loader (idempotent)
        ensureMapsBootstrap(tilesApiKey)

        const init = async () => {
            // importLibrary is set up by the bootstrap — it loads the script on first call
            const { Map3DElement } = await (window as any).google.maps.importLibrary('maps3d')

            if (cancelled) return

            const view = VIEWS.global
            const map3d = new Map3DElement({
                center: view.center,
                range: view.range,
                tilt: view.tilt,
                heading: view.heading,
                mode: 'SATELLITE',
                defaultUIHidden: true,
            })

            map3d.style.width = '100%'
            map3d.style.height = '100%'
            map3d.style.position = 'absolute'
            map3d.style.inset = '0'

            mapContainerRef.current!.appendChild(map3d)
            map3dRef.current = map3d
            setSceneReady(true)

            // Fetch data after map is ready
            fetchData()
        }

        init().catch(console.error)

        return () => {
            cancelled = true
            // Cleanup markers and polygons
            markersRef.current.forEach(marker => marker.remove?.())
            polygonsRef.current.forEach(polygon => polygon.remove?.())
            markersRef.current = []
            polygonsRef.current = []

            if (map3dRef.current?.parentElement) {
                map3dRef.current.parentElement.removeChild(map3dRef.current)
            }
            map3dRef.current = null
            setSceneReady(false)
        }
    }, [tilesApiKey, setSceneReady, fetchData])

    // ── Add overlays when data changes ────────────────────────────────
    useEffect(() => {
        if (map3dRef.current && (clustersData.length > 0 || complaintsData.length > 0)) {
            addOverlays()
        }
    }, [clustersData, complaintsData, addOverlays])

    // ── View mode transition ──────────────────────────────────────────
    const handleModeChange = useCallback(
        (mode: ViewMode) => {
            const map3d = map3dRef.current
            if (isTransitioning || !map3d) return

            setIsTransitioning(true)

            const view = VIEWS[mode]

            map3d.flyCameraTo({
                endCamera: {
                    center: view.center,
                    range: view.range,
                    tilt: view.tilt,
                    heading: view.heading,
                },
                durationMillis: TRANSITION_MS,
            })

            // Listen for animation end to update state
            const onEnd = () => {
                setViewMode(mode)
                setIsTransitioning(false)
                map3d.removeEventListener('gmp-animationend', onEnd)
            }
            map3d.addEventListener('gmp-animationend', onEnd)

            // Fallback timeout in case the event doesn't fire
            setTimeout(() => {
                setViewMode(mode)
                setIsTransitioning(false)
            }, TRANSITION_MS + 500)
        },
        [isTransitioning, setIsTransitioning, setViewMode]
    )

    // ── Reset view ────────────────────────────────────────────────────
    const handleResetView = useCallback(() => {
        const map3d = map3dRef.current
        if (!map3d) return

        const view = VIEWS[viewMode]
        map3d.flyCameraTo({
            endCamera: {
                center: view.center,
                range: view.range,
                tilt: view.tilt,
                heading: view.heading,
            },
            durationMillis: 1000,
        })
    }, [viewMode])

    // ── Zoom controls ─────────────────────────────────────────────────
    const handleZoomIn = useCallback(() => {
        const map3d = map3dRef.current
        if (!map3d) return

        const currentRange = map3d.range ?? VIEWS[viewMode].range
        map3d.flyCameraTo({
            endCamera: {
                center: map3d.center,
                range: currentRange * 0.6,
                tilt: map3d.tilt,
                heading: map3d.heading,
            },
            durationMillis: 500,
        })
    }, [viewMode])

    const handleZoomOut = useCallback(() => {
        const map3d = map3dRef.current
        if (!map3d) return

        const currentRange = map3d.range ?? VIEWS[viewMode].range
        map3d.flyCameraTo({
            endCamera: {
                center: map3d.center,
                range: currentRange * 1.6,
                tilt: map3d.tilt,
                heading: map3d.heading,
            },
            durationMillis: 500,
        })
    }, [viewMode])

    return (
        <div className="operations-hub" ref={containerRef}>
            {/* Google Maps 3D container */}
            <div
                ref={mapContainerRef}
                style={{ position: 'absolute', inset: 0, zIndex: 0 }}
            />

            {/* UI Overlay */}
            <SceneOverlay
                mode={viewMode}
                onModeChange={handleModeChange}
                onResetView={handleResetView}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                isTransitioning={isTransitioning}
            />

            {/* Hover Tooltip */}
            {hoveredItem && (
                <div
                    className="operations-hub__tooltip operations-hub__tooltip--dynamic"
                    style={{
                        left: `${tooltipPosition.x}px`,
                        top: `${tooltipPosition.y - 10}px`,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    {hoveredItem.type === 'cluster' ? (
                        <>
                            <span className="operations-hub__tooltip-type">
                                CLUSTER · {(hoveredItem.data as ClusterData).category.toUpperCase()}
                            </span>
                            <span className="operations-hub__tooltip-name">
                                {(hoveredItem.data as ClusterData).location_label || (hoveredItem.data as ClusterData).zone_id}
                            </span>
                            <div className="operations-hub__tooltip-stats">
                                <span>{(hoveredItem.data as ClusterData).complaint_count} complaints</span>
                                <span className="operations-hub__tooltip-divider">•</span>
                                <span>Severity: {Math.round((hoveredItem.data as ClusterData).severity_score || 0)}</span>
                            </div>
                            <span className="operations-hub__tooltip-state">
                                {(hoveredItem.data as ClusterData).state}
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="operations-hub__tooltip-type">
                                COMPLAINT · {(hoveredItem.data as ComplaintData).category_pred?.toUpperCase() || 'UNKNOWN'}
                            </span>
                            <span className="operations-hub__tooltip-name">
                                {(hoveredItem.data as ComplaintData).location_label}
                            </span>
                            <span className="operations-hub__tooltip-text">
                                {(hoveredItem.data as ComplaintData).text?.substring(0, 80)}
                                {(hoveredItem.data as ComplaintData).text?.length > 80 ? '...' : ''}
                            </span>
                            <div className="operations-hub__tooltip-stats">
                                <span>Severity: {(hoveredItem.data as ComplaintData).severity_pred || 'N/A'}</span>
                                <span className="operations-hub__tooltip-divider">•</span>
                                <span>{(hoveredItem.data as ComplaintData).status}</span>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
