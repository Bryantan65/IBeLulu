// Scene Overlay - Mode indicator, controls, and legend
import { Globe, Map, RotateCcw, ZoomIn, ZoomOut, Layers, RefreshCw } from 'lucide-react'
import './SceneOverlay.css'

export type ViewMode = 'global' | 'singapore'

interface SceneOverlayProps {
    mode: ViewMode
    onModeChange: (mode: ViewMode) => void
    onResetView: () => void
    onZoomIn?: () => void
    onZoomOut?: () => void
    onRefresh?: () => void
    isRefreshing?: boolean
    showLayersPanel?: boolean
    onToggleLayers?: () => void
    isTransitioning?: boolean
}

export default function SceneOverlay({
    mode,
    onModeChange,
    onResetView,
    onZoomIn,
    onZoomOut,
    onRefresh,
    isRefreshing = false,
    showLayersPanel,
    onToggleLayers,
    isTransitioning = false,
}: SceneOverlayProps) {
    return (
        <div className="scene-overlay">
            {/* Top Left - Mode Indicator */}
            <div className="scene-overlay__mode">
                <div className="scene-overlay__mode-icon">
                    {mode === 'global' ? <Globe size={20} /> : <Map size={20} />}
                </div>
                <div className="scene-overlay__mode-info">
                    <span className="scene-overlay__mode-label">
                        {mode === 'global' ? 'Global View' : 'Singapore'}
                    </span>
                    <span className="scene-overlay__mode-hint">
                        {mode === 'global'
                            ? 'Click Singapore to focus'
                            : 'Viewing local operations'}
                    </span>
                </div>
            </div>

            {/* Top Right - View Controls */}
            <div className="scene-overlay__controls">
                {mode === 'singapore' && (
                    <button
                        className="scene-overlay__btn scene-overlay__btn--primary"
                        onClick={() => onModeChange('global')}
                        disabled={isTransitioning}
                        title="Back to Global View"
                    >
                        <Globe size={18} />
                        <span>Global</span>
                    </button>
                )}

                {mode === 'global' && (
                    <button
                        className="scene-overlay__btn scene-overlay__btn--primary"
                        onClick={() => onModeChange('singapore')}
                        disabled={isTransitioning}
                        title="Focus on Singapore"
                    >
                        <Map size={18} />
                        <span>Singapore</span>
                    </button>
                )}

                <div className="scene-overlay__divider" />

                <button
                    className="scene-overlay__btn scene-overlay__btn--icon"
                    onClick={onZoomIn}
                    disabled={isTransitioning}
                    title="Zoom In"
                >
                    <ZoomIn size={18} />
                </button>

                <button
                    className="scene-overlay__btn scene-overlay__btn--icon"
                    onClick={onZoomOut}
                    disabled={isTransitioning}
                    title="Zoom Out"
                >
                    <ZoomOut size={18} />
                </button>

                <button
                    className="scene-overlay__btn scene-overlay__btn--icon"
                    onClick={onResetView}
                    disabled={isTransitioning}
                    title="Reset View"
                >
                    <RotateCcw size={18} />
                </button>

                {onRefresh && (
                    <>
                        <div className="scene-overlay__divider" />
                        <button
                            className="scene-overlay__btn scene-overlay__btn--icon"
                            onClick={onRefresh}
                            disabled={isRefreshing || isTransitioning}
                            title="Refresh Data"
                        >
                            <RefreshCw size={18} className={isRefreshing ? 'scene-overlay__spin' : ''} />
                        </button>
                    </>
                )}

                {onToggleLayers && (
                    <button
                        className={`scene-overlay__btn scene-overlay__btn--icon ${showLayersPanel ? 'active' : ''}`}
                        onClick={onToggleLayers}
                        title="Toggle Layers"
                    >
                        <Layers size={18} />
                    </button>
                )}
            </div>

            {/* Bottom Left - Legend */}
            <div className="scene-overlay__legend">
                <div className="scene-overlay__legend-title">Risk Level</div>
                <div className="scene-overlay__legend-items">
                    <div className="scene-overlay__legend-item">
                        <span className="scene-overlay__legend-dot" style={{ background: '#2F8A5B' }} />
                        <span>Low</span>
                    </div>
                    <div className="scene-overlay__legend-item">
                        <span className="scene-overlay__legend-dot" style={{ background: '#D08700' }} />
                        <span>Medium</span>
                    </div>
                    <div className="scene-overlay__legend-item">
                        <span className="scene-overlay__legend-dot" style={{ background: '#E65100' }} />
                        <span>High</span>
                    </div>
                    <div className="scene-overlay__legend-item">
                        <span className="scene-overlay__legend-dot" style={{ background: '#C2413A' }} />
                        <span>Critical</span>
                    </div>
                </div>
            </div>

            {/* Transition Indicator */}
            {isTransitioning && (
                <div className="scene-overlay__transition">
                    <div className="scene-overlay__transition-spinner" />
                    <span>Transitioning...</span>
                </div>
            )}
        </div>
    )
}
