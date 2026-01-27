// Globe Scene - Rotating Earth with atmosphere glow
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { createAtmosphereMaterial, createEarthMaterial } from './GlobeShaders'

export interface GlobeSceneRef {
    globe: THREE.Mesh | null
    atmosphere: THREE.Mesh | null
    group: THREE.Group | null
    updateTheme: (isDark: boolean) => void
}

interface GlobeSceneProps {
    scene: THREE.Scene
    isDark: boolean
    radius?: number
    autoRotate?: boolean
    rotationSpeed?: number
}

const THEME_COLORS = {
    light: {
        land: 0x1A3F4E,
        ocean: 0xE3EBEF,
        grid: 0x3C8FB0,
        atmosphere: 0x4FC3F7,
    },
    dark: {
        land: 0x1A3F4E,
        ocean: 0x0B171C,
        grid: 0x3C8FB0,
        atmosphere: 0x4FC3F7,
    },
}

const GlobeScene = forwardRef<GlobeSceneRef, GlobeSceneProps>(
    ({ scene, isDark, radius = 5, autoRotate = true, rotationSpeed = 0.1 }, ref) => {
        const groupRef = useRef<THREE.Group | null>(null)
        const globeRef = useRef<THREE.Mesh | null>(null)
        const atmosphereRef = useRef<THREE.Mesh | null>(null)
        const earthMaterialRef = useRef<THREE.ShaderMaterial | null>(null)
        const atmosphereMaterialRef = useRef<THREE.ShaderMaterial | null>(null)

        // Expose refs to parent
        useImperativeHandle(ref, () => ({
            globe: globeRef.current,
            atmosphere: atmosphereRef.current,
            group: groupRef.current,
            updateTheme: (dark: boolean) => {
                const colors = dark ? THEME_COLORS.dark : THEME_COLORS.light
                if (earthMaterialRef.current?.uniforms) {
                    earthMaterialRef.current.uniforms.landColor?.value?.setHex(colors.land)
                    earthMaterialRef.current.uniforms.oceanColor?.value?.setHex(colors.ocean)
                    earthMaterialRef.current.uniforms.gridColor?.value?.setHex(colors.grid)
                }
                if (atmosphereMaterialRef.current?.uniforms) {
                    atmosphereMaterialRef.current.uniforms.glowColor?.value?.setHex(colors.atmosphere)
                }
            },
        }))

        useEffect(() => {
            const colors = isDark ? THEME_COLORS.dark : THEME_COLORS.light

            // Create group for globe + atmosphere
            const group = new THREE.Group()
            groupRef.current = group

            // Globe sphere
            const globeGeometry = new THREE.SphereGeometry(radius, 64, 64)
            const earthMaterial = createEarthMaterial(colors.land, colors.ocean, colors.grid)
            earthMaterialRef.current = earthMaterial
            const globe = new THREE.Mesh(globeGeometry, earthMaterial)
            globe.name = 'globe'
            globe.userData = { type: 'globe', clickable: true }
            globeRef.current = globe
            group.add(globe)

            // Atmosphere glow
            const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.15, 64, 64)
            const atmosphereMaterial = createAtmosphereMaterial(colors.atmosphere)
            atmosphereMaterialRef.current = atmosphereMaterial
            const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
            atmosphere.name = 'atmosphere'
            atmosphereRef.current = atmosphere
            group.add(atmosphere)

            // Add subtle ring around equator
            const ringGeometry = new THREE.RingGeometry(radius * 1.02, radius * 1.04, 64)
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: colors.grid,
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
            })
            const ring = new THREE.Mesh(ringGeometry, ringMaterial)
            ring.rotation.x = Math.PI / 2
            ring.name = 'equatorRing'
            group.add(ring)

            // Add to scene
            scene.add(group)

            // Animation for auto-rotation
            let animationId: number
            const animate = () => {
                if (autoRotate && groupRef.current) {
                    groupRef.current.rotation.y += rotationSpeed * 0.01
                }
                animationId = requestAnimationFrame(animate)
            }
            animate()

            // Cleanup
            return () => {
                cancelAnimationFrame(animationId)
                scene.remove(group)
                globeGeometry.dispose()
                earthMaterial.dispose()
                atmosphereGeometry.dispose()
                atmosphereMaterial.dispose()
                ringGeometry.dispose()
                ringMaterial.dispose()
            }
        }, [scene, isDark, radius, autoRotate, rotationSpeed])

        return null // This component manages Three.js objects directly
    }
)

GlobeScene.displayName = 'GlobeScene'
export default GlobeScene
