// Operations Hub - Main 3D visualization controller
// Refactored to support Global → Singapore view transitions
import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useOperationsStore, useThemeStore } from '../../store'
import GlobeScene, { GlobeSceneRef } from './globe/GlobeScene'
import ClusterMarkers, { ClusterMarkersRef, ClusterData } from './globe/ClusterMarkers'
import SingaporeMap, { SingaporeMapRef } from './singapore/SingaporeMap'
import SceneOverlay, { ViewMode } from './ui/SceneOverlay'
import { useGlobeCamera } from './hooks/useGlobeCamera'
import { useViewTransition } from './hooks/useViewTransition'
import './OperationsHub.css'

// Theme colors for the 3D scene
const THEME_COLORS = {
    light: {
        background: 0xF6F8F9,
        ambient: 0xffffff,
    },
    dark: {
        background: 0x0B171C,
        ambient: 0xffffff,
    },
}

// Sample global clusters data
const GLOBAL_CLUSTERS: ClusterData[] = [
    // Singapore region (main focus)
    { id: 'sg-east', name: 'Singapore East', lat: 1.35, lng: 103.94, count: 42, severity: 'high', region: 'asia', country: 'SG' },
    { id: 'sg-central', name: 'Singapore Central', lat: 1.30, lng: 103.85, count: 28, severity: 'medium', region: 'asia', country: 'SG' },
    { id: 'sg-west', name: 'Singapore West', lat: 1.34, lng: 103.70, count: 15, severity: 'low', region: 'asia', country: 'SG' },
    { id: 'sg-north', name: 'Singapore North', lat: 1.42, lng: 103.82, count: 35, severity: 'critical', region: 'asia', country: 'SG' },
    // Other Asia Pacific
    { id: 'my-kl', name: 'Kuala Lumpur', lat: 3.14, lng: 101.69, count: 18, severity: 'medium', region: 'asia', country: 'MY' },
    { id: 'th-bk', name: 'Bangkok', lat: 13.76, lng: 100.50, count: 22, severity: 'low', region: 'asia', country: 'TH' },
    { id: 'id-jk', name: 'Jakarta', lat: -6.21, lng: 106.85, count: 31, severity: 'high', region: 'asia', country: 'ID' },
    { id: 'ph-mn', name: 'Manila', lat: 14.60, lng: 120.98, count: 12, severity: 'low', region: 'asia', country: 'PH' },
    { id: 'jp-tk', name: 'Tokyo', lat: 35.68, lng: 139.69, count: 8, severity: 'low', region: 'asia', country: 'JP' },
    { id: 'au-sy', name: 'Sydney', lat: -33.87, lng: 151.21, count: 14, severity: 'medium', region: 'oceania', country: 'AU' },
]

export default function OperationsHub() {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<THREE.Scene | null>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const animationIdRef = useRef<number>(0)

    // Component refs
    const globeRef = useRef<GlobeSceneRef>(null)
    const clusterMarkersRef = useRef<ClusterMarkersRef>(null)
    const singaporeMapRef = useRef<SingaporeMapRef>(null)

    // State
    const [hoveredCluster, setHoveredCluster] = useState<ClusterData | null>(null)
    const { viewMode, isTransitioning, setViewMode, setIsTransitioning, setSceneReady } = useOperationsStore()
    const { theme } = useThemeStore()
    const isDark = theme === 'dark'

    // Camera and transition hooks
    const { resetView } = useGlobeCamera(cameraRef.current, controlsRef.current)
    const { transition } = useViewTransition({
        onTransitionStart: () => setIsTransitioning(true),
        onTransitionComplete: (mode) => {
            setViewMode(mode)
            setIsTransitioning(false)
        },
    })

    // Handle view mode change
    const handleModeChange = useCallback(
        async (mode: ViewMode) => {
            if (isTransitioning) return

            await transition(mode, {
                duration: 1500,
                globeGroup: globeRef.current?.group,
                singaporeGroup: singaporeMapRef.current?.group,
                camera: cameraRef.current,
                controls: controlsRef.current,
            })
        },
        [isTransitioning, transition]
    )

    // Handle reset view
    const handleResetView = useCallback(() => {
        if (viewMode === 'global') {
            resetView(800)
        } else {
            // Reset Singapore view
            if (cameraRef.current && controlsRef.current) {
                cameraRef.current.position.set(0, 15, 10)
                controlsRef.current.target.set(0, 0, 0)
                controlsRef.current.update()
            }
        }
    }, [viewMode, resetView])

    // Handle zoom
    const handleZoomIn = useCallback(() => {
        if (cameraRef.current) {
            const direction = new THREE.Vector3()
            cameraRef.current.getWorldDirection(direction)
            cameraRef.current.position.addScaledVector(direction, 2)
        }
    }, [])

    const handleZoomOut = useCallback(() => {
        if (cameraRef.current) {
            const direction = new THREE.Vector3()
            cameraRef.current.getWorldDirection(direction)
            cameraRef.current.position.addScaledVector(direction, -2)
        }
    }, [])

    // Update theme colors
    useEffect(() => {
        if (!sceneRef.current) return
        const colors = THEME_COLORS[theme]

        sceneRef.current.background = new THREE.Color(colors.background)
        sceneRef.current.fog = new THREE.Fog(colors.background, 30, 80)

        // Update child components
        globeRef.current?.updateTheme(isDark)
        singaporeMapRef.current?.updateTheme(isDark)
    }, [theme, isDark])

    // Initialize Three.js scene
    useEffect(() => {
        if (!containerRef.current) return

        const container = containerRef.current
        const width = container.clientWidth
        const height = container.clientHeight
        const colors = THEME_COLORS[theme]

        // Scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(colors.background)
        scene.fog = new THREE.Fog(colors.background, 30, 80)
        sceneRef.current = scene

        // Camera
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
        camera.position.set(0, 8, 15)
        camera.lookAt(0, 0, 0)
        cameraRef.current = camera

        // Renderer
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        container.appendChild(renderer.domElement)
        rendererRef.current = renderer

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.minDistance = 8
        controls.maxDistance = 30
        controls.maxPolarAngle = Math.PI / 2
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.2
        controlsRef.current = controls

        // Lights
        const ambientLight = new THREE.AmbientLight(colors.ambient, 0.5)
        scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
        directionalLight.position.set(10, 20, 10)
        directionalLight.castShadow = true
        directionalLight.shadow.mapSize.width = 2048
        directionalLight.shadow.mapSize.height = 2048
        scene.add(directionalLight)

        const hemisphereLight = new THREE.HemisphereLight(0x4FC3F7, 0x1A3F4E, 0.3)
        scene.add(hemisphereLight)

        // Animation loop
        const animate = () => {
            controls.update()
            renderer.render(scene, camera)
            animationIdRef.current = requestAnimationFrame(animate)
        }
        animate()
        setSceneReady(true)

        // Resize handler
        const handleResize = () => {
            const newWidth = container.clientWidth
            const newHeight = container.clientHeight
            camera.aspect = newWidth / newHeight
            camera.updateProjectionMatrix()
            renderer.setSize(newWidth, newHeight)
        }
        window.addEventListener('resize', handleResize)

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize)
            cancelAnimationFrame(animationIdRef.current)
            renderer.dispose()
            container.removeChild(renderer.domElement)
            setSceneReady(false)
        }
    }, [setSceneReady, theme])

    return (
        <div className="operations-hub" ref={containerRef}>
            {/* Three.js child components */}
            {sceneRef.current && (
                <>
                    <GlobeScene
                        ref={globeRef}
                        scene={sceneRef.current}
                        isDark={isDark}
                        autoRotate={viewMode === 'global' && !isTransitioning}
                    />
                    <ClusterMarkers
                        ref={clusterMarkersRef}
                        scene={sceneRef.current}
                        clusters={GLOBAL_CLUSTERS}
                        onClusterHover={setHoveredCluster}
                        isDark={isDark}
                    />
                    <SingaporeMap
                        ref={singaporeMapRef}
                        scene={sceneRef.current}
                        isDark={isDark}
                        visible={viewMode === 'singapore'}
                    />
                </>
            )}

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
            {hoveredCluster && (
                <div className="operations-hub__tooltip">
                    <span className="operations-hub__tooltip-type">{hoveredCluster.country}</span>
                    <span className="operations-hub__tooltip-name">{hoveredCluster.name}</span>
                    <span className="operations-hub__tooltip-count">{hoveredCluster.count} incidents</span>
                </div>
            )}
        </div>
    )
}
