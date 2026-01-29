import { useState, useEffect, useRef, useMemo } from 'react'
import { Button, Badge, Card } from '../components/ui'
import { CloudRain, Thermometer, Droplets, Plus, Loader2, Bot, Send, X, MessageSquare, User } from 'lucide-react'
import { sendMessageToAgent, ChatMessage } from '../services/orchestrate'
import { GoogleMap, MarkerF, InfoWindowF, useJsApiLoader } from '@react-google-maps/api'
import './TomorrowPlan.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const FORECAST_AGENT_ID = 'b897af4a-759f-4bf9-8163-fa66ceb97a0c' // Forecast Agent ID
const WINDY_EMBED_URL =
    'https://embed.windy.com/embed2.html?lat=1.3521&lon=103.8198&detailLat=1.3521&detailLon=103.8198&width=650&height=450&zoom=20&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1'
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

const SINGAPORE_CENTER = { lat: 1.3521, lng: 103.8198 }

const ZONE_COORDINATES: Record<string, { lat: number; lng: number; label: string }> = {
    BEDOK_BIN_CENTRE_4: { lat: 1.3336, lng: 103.9352, label: 'Bedok' },
    YISHUN_DRAIN_A: { lat: 1.4344, lng: 103.8366, label: 'Yishun' },
    JURONG_EAST_FOOD_CENTRE: { lat: 1.3346, lng: 103.7429, label: 'Jurong East' },
    TAMPINES_PARK_WALKWAY: { lat: 1.3571, lng: 103.9618, label: 'Tampines Park' },
    BEDOK: { lat: 1.3336, lng: 103.9352, label: 'Bedok' },
    YISHUN: { lat: 1.4344, lng: 103.8366, label: 'Yishun' },
    JURONG_EAST: { lat: 1.3346, lng: 103.7429, label: 'Jurong East' },
    TAMPINES: { lat: 1.3527, lng: 103.9546, label: 'Tampines' },
    WOODLANDS: { lat: 1.4382, lng: 103.7892, label: 'Woodlands' },
    PUNGGOL: { lat: 1.4051, lng: 103.9023, label: 'Punggol' },
    SENGKANG: { lat: 1.3919, lng: 103.8953, label: 'Sengkang' },
    HOUGANG: { lat: 1.3612, lng: 103.8863, label: 'Hougang' },
    TOA_PAYOH: { lat: 1.3341, lng: 103.8563, label: 'Toa Payoh' },
    ANG_MO_KIO: { lat: 1.3691, lng: 103.8454, label: 'Ang Mo Kio' }
}

interface Forecast {
    id: string
    zone_id: string
    predicted_category: string
    risk_score: number
    reason: string
    suggested_preemptive_task: string | null
    confidence: number
}

// Helper to get tomorrow's date string YYYY-MM-DD
function getTomorrowDate(): string {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0] || ''
}

export default function TomorrowPlan() {
    const [forecasts, setForecasts] = useState<Forecast[]>([])
    const [loading, setLoading] = useState(true)
    const [weatherSummary, setWeatherSummary] = useState({ rainProb: 40, temp: 30, humidity: 80, desc: "Cloudy" })
    const [mapView, setMapView] = useState<'windy' | 'google'>('windy')
    const [googleMap, setGoogleMap] = useState<google.maps.Map | null>(null)
    const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null)

    // Chat State
    const [showChat, setShowChat] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [chatLoading, setChatLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const mapContainerRef = useRef<HTMLDivElement>(null)

    const { isLoaded: isGoogleMapsLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: GOOGLE_MAPS_API_KEY
    })

    const normalizeZoneKey = (value: string) =>
        value
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')

    const getZoneCoordinate = (zoneId: string) => {
        const normalized = normalizeZoneKey(zoneId)
        if (ZONE_COORDINATES[zoneId]) return ZONE_COORDINATES[zoneId]
        if (ZONE_COORDINATES[normalized]) return ZONE_COORDINATES[normalized]
        const parts = normalized.split('_')
        for (let i = parts.length; i > 0; i--) {
            const key = parts.slice(0, i).join('_')
            if (ZONE_COORDINATES[key]) return ZONE_COORDINATES[key]
        }
        return null
    }

    const markers = useMemo(() => {
        return forecasts
            .map((forecast) => {
                const coord = getZoneCoordinate(forecast.zone_id)
                if (!coord) return null
                return {
                    id: forecast.id,
                    zone: forecast.zone_id,
                    category: forecast.predicted_category,
                    reason: forecast.reason,
                    position: coord
                }
            })
            .filter(Boolean) as {
                id: string
                zone: string
                category: string
                reason: string
                position: { lat: number; lng: number; label: string }
            }[]
    }, [forecasts])

    useEffect(() => {
        fetchForecasts()
        fetchWeather()
    }, [])

    useEffect(() => {
        if (!googleMap || mapView !== 'google' || !activeMarkerId) return
        const marker = markers.find((item) => item.id === activeMarkerId)
        if (!marker) return
        googleMap.panTo({ lat: marker.position.lat, lng: marker.position.lng })
        googleMap.setZoom(14)
    }, [activeMarkerId, googleMap, mapView, markers])

    const fetchWeather = async () => {
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/get-weather`, {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            })
            if (response.ok) {
                const data = await response.json()
                const forecasts = data.forecasts || []
                if (forecasts.length > 0) {
                    const rep = forecasts.find((f: any) => f.area === "City") || forecasts[0]
                    const desc = rep.forecast || "Cloudy"
                    let rain = 10, temp = 31, hum = 70
                    const d = desc.toLowerCase()
                    if (d.includes('rain') || d.includes('shower')) { rain = 85; temp = 27; hum = 90; }
                    else if (d.includes('cloud')) { rain = 30; temp = 29; hum = 80; }
                    else if (d.includes('fair') || d.includes('sunny')) { rain = 5; temp = 33; hum = 65; }

                    setWeatherSummary({ rainProb: rain, temp: temp, humidity: hum, desc: desc })
                }
            }
        } catch (error) { console.error("Failed to fetch weather", error) }
    }

    const fetchForecasts = async () => {
        try {
            const dateStr = getTomorrowDate()
            const response = await fetch(`${SUPABASE_URL}/rest/v1/forecasts?date=eq.${dateStr}&order=risk_score.desc`, {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            })
            if (response.ok) {
                const data = await response.json()
                setForecasts(data)
            }
        } catch (error) { console.error("Failed to fetch forecasts", error) }
        finally { setLoading(false) }
    }

    const handleSend = async () => {
        if (!input.trim() || chatLoading) return
        const userMessage: ChatMessage = { role: 'user', text: input }
        setMessages(prev => [...prev, userMessage])
        setInput('')
        setChatLoading(true)
        try {
            const forecastContext = {
                date: getTomorrowDate(),
                weather: weatherSummary,
                forecasts: forecasts.map((forecast) => ({
                    zone_id: forecast.zone_id,
                    predicted_category: forecast.predicted_category,
                    risk_score: forecast.risk_score,
                    reason: forecast.reason
                }))
            }
            const contextMessage: ChatMessage = {
                role: 'user',
                text:
                    'Use ONLY this forecast data when answering (do not invent new zones). ' +
                    `Forecast context: ${JSON.stringify(forecastContext)}`
            }
            const responseText = await sendMessageToAgent([contextMessage, ...messages, userMessage], FORECAST_AGENT_ID)
            setMessages(prev => [...prev, { role: 'assistant', text: responseText }])
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', text: "I'm having trouble connecting right now." }])
        } finally { setChatLoading(false) }
    }

    // Dynamic Agent Summary
    const getAgentSummary = () => {
        if (loading) return "Analyzing latest data..."
        if (forecasts.length === 0) return "I haven't detected any significant risks for tomorrow. Standard maintenance schedule is recommended."
        const types = [...new Set(forecasts.map(f => f.predicted_category.replace('_', ' ')))].slice(0, 2).join(' and ')
        return `I've flagged ${forecasts.length} high-risk zones for tomorrow, primarily driven by ${types}. Based on the ${weatherSummary.desc} forecast, I strongly recommend prioritizing the tasks below.`
    }

    // Interactive Tasks State
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
    const toggleTask = (id: string) => {
        const newSet = new Set(selectedTasks)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedTasks(newSet)
    }

    const overflowRiskCount = forecasts.filter((forecast) =>
        forecast.predicted_category.includes('overflow')
    ).length

    const handleZoomToSingapore = () => {
        if (mapView === 'google' && googleMap) {
            googleMap.setCenter(SINGAPORE_CENTER)
            googleMap.setZoom(12)
            return
        }
        if (mapView === 'windy') {
            mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }

    const focusOnForecast = (forecast: Forecast) => {
        const coord = getZoneCoordinate(forecast.zone_id)
        if (!coord) return
        setMapView('google')
        setActiveMarkerId(forecast.id)
        if (googleMap) {
            googleMap.panTo({ lat: coord.lat, lng: coord.lng })
            googleMap.setZoom(14)
        }
        mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    return (
        <div className="tomorrow-plan">
            {/* Agent Briefing Section */}
            <div className="tomorrow-plan__agent-brief">
                <div className="tomorrow-plan__agent-header">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-full text-primary border border-primary/20">
                            <Bot size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">Forecast Agent Briefing</h3>
                            <p className="text-sm text-neutral-500">Analysis for {getTomorrowDate()}</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" icon={<MessageSquare size={16} />} onClick={() => setShowChat(true)}>
                        Chat with Agent
                    </Button>
                </div>
                <div className="tomorrow-plan__agent-body">
                    <p className="text-foreground/80 leading-relaxed">"{getAgentSummary()}"</p>
                </div>
            </div>

            {/* Collapsible Chat Section */}
            <div className={`tomorrow-plan-chat-collapsible ${showChat ? 'open' : ''}`}>
                <Card className="h-[500px] shadow-lg" padding="none">
                    <div className="tomorrow-plan-chat__container">
                        <div className="tomorrow-plan-chat__header">
                            <div className="tomorrow-plan-chat__title">
                                <Bot size={20} className="text-primary" />
                                <span>Chat with Forecast Agent</span>
                            </div>
                            <button onClick={() => setShowChat(false)} className="tomorrow-plan-chat__close">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="tomorrow-plan-chat__messages">
                            {messages.length === 0 && (
                                <div className="tomorrow-plan-chat__empty">
                                    <Bot size={48} />
                                    <p>Ask me about tomorrow's risks or weather.</p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`tomorrow-plan-chat__message tomorrow-plan-chat__message--${msg.role}`}>
                                    <div className="tomorrow-plan-chat__avatar">
                                        {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                    </div>
                                    <div className="tomorrow-plan-chat__bubble">
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {chatLoading && (
                                <div className="tomorrow-plan-chat__message tomorrow-plan-chat__message--assistant">
                                    <div className="tomorrow-plan-chat__avatar">
                                        <Bot size={16} />
                                    </div>
                                    <div className="tomorrow-plan-chat__bubble tomorrow-plan-chat__bubble--loading">
                                        <Loader2 size={16} className="animate-spin" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="tomorrow-plan-chat__input-area">
                            <input
                                className="tomorrow-plan-chat__input"
                                placeholder="Type a message..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                                disabled={chatLoading}
                            />
                            <button
                                className="tomorrow-plan-chat__send-btn"
                                onClick={() => handleSend()}
                                disabled={!input.trim() || chatLoading}
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Weather Signal */}
            <Card className="tomorrow-plan__weather">
                <h3>Weather Outlook</h3>
                <div className="tomorrow-plan__weather-grid">
                    <div className="tomorrow-plan__signal">
                        <CloudRain size={24} className={weatherSummary.rainProb > 50 ? "text-info" : "text-neutral"} />
                        <span className="tomorrow-plan__signal-value">{weatherSummary.rainProb}%</span>
                        <span className="tomorrow-plan__signal-label">Rain Prob.</span>
                    </div>
                    <div className="tomorrow-plan__signal">
                        <Thermometer size={24} className="text-warning" />
                        <span className="tomorrow-plan__signal-value">{weatherSummary.temp}°C</span>
                        <span className="tomorrow-plan__signal-label">Temp</span>
                    </div>
                    <div className="tomorrow-plan__signal">
                        <Droplets size={24} className="text-primary" />
                        <span className="tomorrow-plan__signal-value">{weatherSummary.humidity}%</span>
                        <span className="tomorrow-plan__signal-label">Humidity</span>
                    </div>
                </div>
                <div className="tomorrow-plan__map">
                    <div className="tomorrow-plan__map-header">
                        <span className="tomorrow-plan__map-title">Live Weather Map</span>
                        <div className="tomorrow-plan__map-actions">
                            <Button
                                variant={mapView === 'windy' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setMapView('windy')}
                            >
                                Windy
                            </Button>
                            <Button
                                variant={mapView === 'google' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setMapView('google')}
                            >
                                Google Map
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleZoomToSingapore}>
                                Zoom to Singapore
                            </Button>
                        </div>
                    </div>
                    <div className="tomorrow-plan__map-frame">
                        {mapView === 'windy' && (
                            <iframe
                                title="Windy Live Weather Map"
                                src={WINDY_EMBED_URL}
                                loading="lazy"
                                allowFullScreen
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        )}
                        {mapView === 'google' && (
                            <div ref={mapContainerRef} className="tomorrow-plan__google-map">
                                {!GOOGLE_MAPS_API_KEY && (
                                    <div className="tomorrow-plan__map-fallback">Missing Google Maps API key.</div>
                                )}
                                {GOOGLE_MAPS_API_KEY && loadError && (
                                    <div className="tomorrow-plan__map-fallback">Unable to load Google Maps.</div>
                                )}
                                {GOOGLE_MAPS_API_KEY && !loadError && isGoogleMapsLoaded && (
                                    <GoogleMap
                                        mapContainerClassName="tomorrow-plan__google-map-inner"
                                        center={SINGAPORE_CENTER}
                                        zoom={11}
                                        onLoad={(map) => setGoogleMap(map)}
                                        options={{
                                            streetViewControl: false,
                                            mapTypeControl: false,
                                            fullscreenControl: true,
                                            clickableIcons: false
                                        }}
                                    >
                                        {markers.map((marker) => (
                                            <MarkerF
                                                key={marker.id}
                                                position={marker.position}
                                                title={marker.zone}
                                                label={marker.position.label[0]}
                                                onClick={() => setActiveMarkerId(marker.id)}
                                            />
                                        ))}
                                        {markers
                                            .filter((marker) => marker.id === activeMarkerId)
                                            .map((marker) => (
                                                <InfoWindowF
                                                    key={`info-${marker.id}`}
                                                    position={marker.position}
                                                    onCloseClick={() => setActiveMarkerId(null)}
                                                >
                                                    <div className="tomorrow-plan__map-info">
                                                        <div className="tomorrow-plan__map-info-title">{marker.zone}</div>
                                                        <div className="tomorrow-plan__map-info-meta">
                                                            {marker.category.replace('_', ' ')}
                                                        </div>
                                                        <div className="tomorrow-plan__map-info-reason">{marker.reason}</div>
                                                    </div>
                                                </InfoWindowF>
                                            ))}
                                    </GoogleMap>
                                )}
                                {GOOGLE_MAPS_API_KEY && !loadError && !isGoogleMapsLoaded && (
                                    <div className="tomorrow-plan__map-fallback">Loading map...</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="tomorrow-plan__environment">
                    <div className="tomorrow-plan__environment-title">Environmental Impact (Proxy)</div>
                    <div className="tomorrow-plan__environment-grid">
                        <div className="tomorrow-plan__environment-card">
                            <span className="tomorrow-plan__environment-value">{overflowRiskCount}</span>
                            <span className="tomorrow-plan__environment-label">Potential Overflows Avoided</span>
                        </div>
                    </div>
                    <p className="tomorrow-plan__environment-note">
                        Proxy based on forecasted overflow hotspots and proactive inspection coverage.
                    </p>
                </div>
            </Card>

            <div className="tomorrow-plan__content">
                {/* Risk Forecast Column */}
                <div className="tomorrow-plan__forecasts">
                    <h3>Risk Forecast</h3>
                    {loading ? (
                        <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>
                    ) : forecasts.length === 0 ? (
                        <div className="p-4 text-neutral-500 italic">No risks predicted.</div>
                    ) : (
                        <div className="tomorrow-plan__forecast-list">
                            {forecasts.map((forecast) => (
                                <Card
                                    key={forecast.id}
                                    padding="md"
                                    className="tomorrow-plan__forecast"
                                    onClick={() => focusOnForecast(forecast)}
                                >
                                    <div className="tomorrow-plan__forecast-header">
                                        <span className="tomorrow-plan__forecast-zone">{forecast.zone_id}</span>
                                        <RiskMeter value={forecast.risk_score} />
                                    </div>
                                    <Badge variant={forecast.predicted_category === 'bin_overflow' ? 'danger' : 'warning'} size="sm">
                                        {forecast.predicted_category.replace('_', ' ')}
                                    </Badge>
                                    <p className="tomorrow-plan__forecast-reason">{forecast.reason}</p>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Preemptive Tasks Column */}
                <div className="tomorrow-plan__tasks">
                    <h3>Recommended Actions</h3>
                    {loading ? (
                        <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>
                    ) : forecasts.length === 0 ? (
                        <div className="p-4 text-neutral-500 italic">No tasks recommended.</div>
                    ) : (
                        <>
                            <div className="tomorrow-plan__task-list">
                                {forecasts.map((forecast) => (
                                    <label key={forecast.id} className="tomorrow-plan__task">
                                        <input
                                            type="checkbox"
                                            checked={!selectedTasks.has(forecast.id)} // Default checked
                                            onChange={() => toggleTask(forecast.id)}
                                        />
                                        <div className="tomorrow-plan__task-info">
                                            <span className="tomorrow-plan__task-type">
                                                {forecast.suggested_preemptive_task?.replace('_', ' ') || 'Inspect'}
                                            </span>
                                            <span className="tomorrow-plan__task-zone">{forecast.zone_id}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <Button variant="primary" icon={<Plus size={16} />} className="tomorrow-plan__add-btn">
                                Convert to Run Sheet
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Merge Preview */}
            <Card className="tomorrow-plan__preview">
                <span>Merged Preview:</span>
                <strong>Reactive (8) + Proactive ({forecasts.length}) = {8 + forecasts.length} Tasks</strong>
            </Card>

        </div>
    )
}


function RiskMeter({ value }: { value: number }) {
    const percentage = Math.round(value * 100)
    const color = value >= 0.7 ? 'var(--color-danger)' : value >= 0.5 ? 'var(--color-warning)' : 'var(--color-success)'

    return (
        <div className="risk-meter">
            <div className="risk-meter__bar">
                <div className="risk-meter__fill" style={{ width: `${percentage}%`, background: color }} />
            </div>
            <span className="risk-meter__value" style={{ color }}>{percentage}%</span>
        </div>
    )
}

