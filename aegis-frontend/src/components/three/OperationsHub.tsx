import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useOperationsStore, useThemeStore } from '../../store'
import './OperationsHub.css'

// Theme colors for the 3D scene
const THEME_COLORS = {
    light: {
        background: 0xF6F8F9,
        grid1: 0xCBD7DE,
        grid2: 0xE3EBEF,
        primary: 0x1A3F4E,
    },
    dark: {
        background: 0x0B171C,
        grid1: 0x243642,
        grid2: 0x1A2D38,
        primary: 0x3C8FB0,
    },
}

// Zone data representing estates
const ZONES: { id: string; name: string; position: [number, number, number]; risk: number }[] = [
    { id: 'zone-a', name: 'Tampines North', position: [-3, 0, -2], risk: 0.2 },
    { id: 'zone-b', name: 'Tampines Central', position: [0, 0, -2], risk: 0.5 },
    { id: 'zone-c', name: 'Tampines East', position: [3, 0, -2], risk: 0.8 },
    { id: 'zone-d', name: 'Bedok North', position: [-3, 0, 1], risk: 0.3 },
    { id: 'zone-e', name: 'Bedok Central', position: [0, 0, 1], risk: 0.6 },
    { id: 'zone-f', name: 'Bedok East', position: [3, 0, 1], risk: 0.4 },
    { id: 'zone-g', name: 'Simei', position: [-1.5, 0, 4], risk: 0.7 },
    { id: 'zone-h', name: 'Pasir Ris', position: [1.5, 0, 4], risk: 0.9 },
]

// Mock clusters
const CLUSTERS: { id: string; zoneId: string; severity: number; urgency: string; position: [number, number, number] }[] = [
    { id: 'cluster-1', zoneId: 'zone-c', severity: 4, urgency: 'TODAY', position: [3, 1.5, -2] },
    { id: 'cluster-2', zoneId: 'zone-e', severity: 3, urgency: '48H', position: [0, 1.2, 1] },
    { id: 'cluster-3', zoneId: 'zone-h', severity: 5, urgency: 'TODAY', position: [1.5, 2, 4] },
]

export default function OperationsHub() {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<{
        scene: THREE.Scene
        camera: THREE.PerspectiveCamera
        renderer: THREE.WebGLRenderer
        controls: OrbitControls
        zones: Map<string, THREE.Mesh>
        clusters: Map<string, THREE.Mesh>
        gridHelper: THREE.GridHelper
        shieldMaterial: THREE.MeshStandardMaterial
        pointLight: THREE.PointLight
        animationId: number
    } | null>(null)

    const [hoveredItem, setHoveredItem] = useState<{ type: string; name: string } | null>(null)
    const { setSceneReady, selectZone, hoverCluster } = useOperationsStore()
    const { theme } = useThemeStore()

    // Update scene colors when theme changes
    useEffect(() => {
        if (!sceneRef.current) return
        const { scene, gridHelper, shieldMaterial, pointLight } = sceneRef.current
        const colors = THEME_COLORS[theme]

        scene.background = new THREE.Color(colors.background)
        scene.fog = new THREE.Fog(colors.background, 30, 80)

        // Update grid colors
        scene.remove(gridHelper)
        const newGridHelper = new THREE.GridHelper(30, 30, colors.grid1, colors.grid2)
        scene.add(newGridHelper)
        sceneRef.current.gridHelper = newGridHelper

        // Update shield core color
        shieldMaterial.color.setHex(colors.primary)
        shieldMaterial.emissive.setHex(colors.primary)

        // Update point light color
        pointLight.color.setHex(colors.primary)
    }, [theme])

    useEffect(() => {
        if (!containerRef.current) return

        const container = containerRef.current
        const width = container.clientWidth
        const height = container.clientHeight
        const colors = THEME_COLORS[theme]

        // Scene setup
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(colors.background)
        scene.fog = new THREE.Fog(colors.background, 30, 80)

        // Camera
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
        camera.position.set(0, 15, 20)
        camera.lookAt(0, 0, 0)

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(renderer.domElement)

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.minDistance = 10
        controls.maxDistance = 40
        controls.maxPolarAngle = Math.PI / 2.2
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.3

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
        scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(10, 20, 10)
        scene.add(directionalLight)

        const pointLight = new THREE.PointLight(colors.primary, 1, 50)
        pointLight.position.set(0, 10, 0)
        scene.add(pointLight)

        // Grid helper
        const gridHelper = new THREE.GridHelper(30, 30, colors.grid1, colors.grid2)
        scene.add(gridHelper)

        // Central shield core
        const shieldGeometry = new THREE.OctahedronGeometry(1, 0)
        const shieldMaterial = new THREE.MeshStandardMaterial({
            color: colors.primary,
            emissive: colors.primary,
            emissiveIntensity: 0.5,
            metalness: 0.8,
            roughness: 0.2,
            wireframe: true,
        })
        const shieldCore = new THREE.Mesh(shieldGeometry, shieldMaterial)
        shieldCore.position.set(0, 3, 0)
        scene.add(shieldCore)

        // Zone hexagons
        const zones = new Map<string, THREE.Mesh>()
        ZONES.forEach((zone) => {
            const hexGeometry = new THREE.CylinderGeometry(1.2, 1.2, 0.3, 6)
            const riskColor = new THREE.Color().lerpColors(
                new THREE.Color(0x2F8A5B), // success green
                new THREE.Color(0xC2413A), // error red
                zone.risk
            )
            const hexMaterial = new THREE.MeshStandardMaterial({
                color: riskColor,
                transparent: true,
                opacity: 0.6,
                metalness: 0.3,
                roughness: 0.7,
            })
            const hexMesh = new THREE.Mesh(hexGeometry, hexMaterial)
            hexMesh.position.set(zone.position[0] * 2.5, zone.position[1], zone.position[2] * 2.5)
            hexMesh.userData = { type: 'zone', id: zone.id, name: zone.name }
            scene.add(hexMesh)
            zones.set(zone.id, hexMesh)
        })

        // Cluster orbs
        const clusters = new Map<string, THREE.Mesh>()
        CLUSTERS.forEach((cluster) => {
            const orbGeometry = new THREE.SphereGeometry(0.3 + cluster.severity * 0.1, 16, 16)
            const urgencyColor = cluster.urgency === 'TODAY' ? 0xC2413A : 0xD08700
            const orbMaterial = new THREE.MeshStandardMaterial({
                color: urgencyColor,
                emissive: urgencyColor,
                emissiveIntensity: 0.4,
                transparent: true,
                opacity: 0.9,
            })
            const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial)
            orbMesh.position.set(cluster.position[0] * 2.5, cluster.position[1], cluster.position[2] * 2.5)
            orbMesh.userData = { type: 'cluster', id: cluster.id, severity: cluster.severity }
            scene.add(orbMesh)
            clusters.set(cluster.id, orbMesh)
        })

        // Raycaster for interactions
        const raycaster = new THREE.Raycaster()
        const mouse = new THREE.Vector2()

        const onMouseMove = (event: MouseEvent) => {
            const rect = container.getBoundingClientRect()
            mouse.x = ((event.clientX - rect.left) / width) * 2 - 1
            mouse.y = -((event.clientY - rect.top) / height) * 2 + 1

            raycaster.setFromCamera(mouse, camera)
            const intersects = raycaster.intersectObjects([...zones.values(), ...clusters.values()])

            if (intersects.length > 0 && intersects[0]) {
                const obj = intersects[0].object
                const userData = obj?.userData
                setHoveredItem({ type: userData?.type, name: userData?.name || userData?.id })
                container.style.cursor = 'pointer'
                controls.autoRotate = false
            } else {
                setHoveredItem(null)
                container.style.cursor = 'grab'
                controls.autoRotate = true
            }
        }

        const onClick = (event: MouseEvent) => {
            const rect = container.getBoundingClientRect()
            mouse.x = ((event.clientX - rect.left) / width) * 2 - 1
            mouse.y = -((event.clientY - rect.top) / height) * 2 + 1

            raycaster.setFromCamera(mouse, camera)
            const intersects = raycaster.intersectObjects([...zones.values(), ...clusters.values()])

            if (intersects.length > 0 && intersects[0]) {
                const userData = intersects[0].object.userData
                if (userData.type === 'zone') {
                    selectZone(userData.id)
                } else if (userData.type === 'cluster') {
                    hoverCluster(userData.id)
                }
            }
        }

        container.addEventListener('mousemove', onMouseMove)
        container.addEventListener('click', onClick)

        // Animation loop
        const clock = new THREE.Clock()

        const animate = () => {
            const elapsed = clock.getElapsedTime()

            // Rotate shield core
            shieldCore.rotation.y = elapsed * 0.5
            shieldCore.rotation.x = Math.sin(elapsed * 0.3) * 0.2

            // Pulse clusters
            clusters.forEach((mesh, id) => {
                const cluster = CLUSTERS.find(c => c.id === id)
                if (cluster?.urgency === 'TODAY') {
                    mesh.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.15)
                }
            })

            controls.update()
            renderer.render(scene, camera)
            if (sceneRef.current) {
                sceneRef.current.animationId = requestAnimationFrame(animate)
            }
        }

        sceneRef.current = { scene, camera, renderer, controls, zones, clusters, gridHelper, shieldMaterial, pointLight, animationId: 0 }
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
            container.removeEventListener('mousemove', onMouseMove)
            container.removeEventListener('click', onClick)
            if (sceneRef.current) {
                cancelAnimationFrame(sceneRef.current.animationId)
            }
            renderer.dispose()
            container.removeChild(renderer.domElement)
            setSceneReady(false)
        }
    }, [setSceneReady, selectZone, hoverCluster])

    return (
        <div className="operations-hub" ref={containerRef}>
            {hoveredItem && (
                <div className="operations-hub__tooltip">
                    <span className="operations-hub__tooltip-type">{hoveredItem.type}</span>
                    <span className="operations-hub__tooltip-name">{hoveredItem.name}</span>
                </div>
            )}
            <div className="operations-hub__legend">
                <div className="operations-hub__legend-item">
                    <span className="operations-hub__legend-dot" style={{ background: '#2F8A5B' }} />
                    <span>Low Risk</span>
                </div>
                <div className="operations-hub__legend-item">
                    <span className="operations-hub__legend-dot" style={{ background: '#D08700' }} />
                    <span>Medium</span>
                </div>
                <div className="operations-hub__legend-item">
                    <span className="operations-hub__legend-dot" style={{ background: '#C2413A' }} />
                    <span>High Risk</span>
                </div>
            </div>
        </div>
    )
}
