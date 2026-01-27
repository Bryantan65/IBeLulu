// Cluster Markers - Data-driven points on the globe
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'

export interface ClusterData {
    id: string
    name: string
    lat: number
    lng: number
    count: number
    severity: 'low' | 'medium' | 'high' | 'critical'
    region: string
    country: string
}

export interface ClusterMarkersRef {
    markers: Map<string, THREE.Mesh>
    highlightCluster: (id: string | null) => void
    updateClusters: (clusters: ClusterData[]) => void
}

interface ClusterMarkersProps {
    scene: THREE.Scene
    clusters: ClusterData[]
    globeRadius?: number
    onClusterHover?: (cluster: ClusterData | null) => void
    onClusterClick?: (cluster: ClusterData) => void
    isDark?: boolean
}

const SEVERITY_COLORS = {
    low: 0x2F8A5B,      // Green
    medium: 0xD08700,   // Amber
    high: 0xE65100,     // Orange
    critical: 0xC2413A, // Red
}

const SEVERITY_SIZES = {
    low: 0.08,
    medium: 0.12,
    high: 0.18,
    critical: 0.25,
}

// Convert lat/lng to 3D position on sphere
function latLngToPosition(lat: number, lng: number, radius: number): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (lng + 180) * (Math.PI / 180)

    return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    )
}

const ClusterMarkers = forwardRef<ClusterMarkersRef, ClusterMarkersProps>(
    ({ scene, clusters, globeRadius = 5, onClusterHover, onClusterClick, isDark = false }, ref) => {
        const markersRef = useRef<Map<string, THREE.Mesh>>(new Map())
        const groupRef = useRef<THREE.Group | null>(null)
        const highlightedRef = useRef<string | null>(null)
        const materialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map())

        // Expose methods to parent
        useImperativeHandle(ref, () => ({
            markers: markersRef.current,
            highlightCluster: (id: string | null) => {
                // Reset previous highlight
                if (highlightedRef.current) {
                    const prevMesh = markersRef.current.get(highlightedRef.current)
                    if (prevMesh) {
                        prevMesh.scale.setScalar(1)
                    }
                }
                // Apply new highlight
                if (id) {
                    const mesh = markersRef.current.get(id)
                    if (mesh) {
                        mesh.scale.setScalar(1.5)
                    }
                }
                highlightedRef.current = id
            },
            updateClusters: (newClusters: ClusterData[]) => {
                // This would rebuild the markers - simplified for now
                console.log('Updating clusters:', newClusters.length)
            },
        }))

        useEffect(() => {
            // Create a group for all markers
            const group = new THREE.Group()
            group.name = 'clusterMarkers'
            groupRef.current = group

            // Create markers for each cluster
            clusters.forEach((cluster) => {
                const position = latLngToPosition(cluster.lat, cluster.lng, globeRadius * 1.02)
                const size = SEVERITY_SIZES[cluster.severity]
                const color = SEVERITY_COLORS[cluster.severity]

                // Main marker sphere
                const geometry = new THREE.SphereGeometry(size, 16, 16)
                const material = new THREE.MeshStandardMaterial({
                    color,
                    emissive: color,
                    emissiveIntensity: 0.5,
                    transparent: true,
                    opacity: 0.9,
                })
                materialsRef.current.set(cluster.id, material)

                const mesh = new THREE.Mesh(geometry, material)
                mesh.position.copy(position)
                mesh.userData = { type: 'cluster', data: cluster }
                mesh.name = `cluster-${cluster.id}`
                markersRef.current.set(cluster.id, mesh)
                group.add(mesh)

                // Pulse ring for critical clusters
                if (cluster.severity === 'critical') {
                    const ringGeometry = new THREE.RingGeometry(size * 1.5, size * 2, 32)
                    const ringMaterial = new THREE.MeshBasicMaterial({
                        color,
                        transparent: true,
                        opacity: 0.3,
                        side: THREE.DoubleSide,
                    })
                    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
                    ring.position.copy(position)
                    ring.lookAt(new THREE.Vector3(0, 0, 0))
                    ring.userData = { pulseRing: true, clusterId: cluster.id }
                    group.add(ring)
                }

                // Create a "pin stem" pointing outward
                const stemGeometry = new THREE.CylinderGeometry(0.01, 0.01, size * 2, 8)
                const stemMaterial = new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.5,
                })
                const stem = new THREE.Mesh(stemGeometry, stemMaterial)

                // Position stem between globe surface and marker
                const surfacePos = latLngToPosition(cluster.lat, cluster.lng, globeRadius)
                stem.position.copy(surfacePos.clone().add(position).multiplyScalar(0.5))
                stem.lookAt(new THREE.Vector3(0, 0, 0))
                stem.rotateX(Math.PI / 2)
                group.add(stem)
            })

            scene.add(group)

            // Animation for pulsing critical markers
            let time = 0
            let animationId: number
            const animate = () => {
                time += 0.016
                group.children.forEach((child) => {
                    if (child.userData.pulseRing) {
                        const scale = 1 + Math.sin(time * 3) * 0.2
                        child.scale.setScalar(scale)
                        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                            child.material.opacity = 0.3 - Math.sin(time * 3) * 0.15
                        }
                    }
                })
                animationId = requestAnimationFrame(animate)
            }
            animate()

            // Cleanup
            return () => {
                cancelAnimationFrame(animationId)
                scene.remove(group)
                markersRef.current.forEach((mesh) => {
                    mesh.geometry.dispose()
                    if (mesh.material instanceof THREE.Material) {
                        mesh.material.dispose()
                    }
                })
                markersRef.current.clear()
                materialsRef.current.clear()
            }
        }, [scene, clusters, globeRadius])

        return null
    }
)

ClusterMarkers.displayName = 'ClusterMarkers'
export default ClusterMarkers
