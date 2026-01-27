
// Singapore Map - Flat Satellite/Digital Twin View
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'

export interface SingaporeMapRef {
    group: THREE.Group | null
    updateTheme: (isDark: boolean) => void
    setVisible: (visible: boolean) => void
}

interface SingaporeMapProps {
    scene: THREE.Scene
    isDark: boolean
    visible?: boolean
}

const THEME_COLORS = {
    light: {
        ground: 0xE3EBEF,
        grid: 0x3C8FB0,
    },
    dark: {
        ground: 0x0B171C,
        grid: 0x1A3F4E,
    },
}

const SingaporeMap = forwardRef<SingaporeMapRef, SingaporeMapProps>(
    ({ scene, isDark, visible = false }, ref) => {
        const groupRef = useRef<THREE.Group | null>(null)
        const planeMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
        const gridHelperRef = useRef<THREE.GridHelper | null>(null)

        useImperativeHandle(ref, () => ({
            get group() {
                return groupRef.current
            },
            updateTheme: (dark: boolean) => {
                const colors = dark ? THEME_COLORS.dark : THEME_COLORS.light
                if (planeMaterialRef.current) {
                    planeMaterialRef.current.color.setHex(colors.ground)
                }
                if (gridHelperRef.current) {

                    // GridHelper colors are attributes, simpler to recreate or just update material color if possible
                    // For standard GridHelper, updating colors is tricky without recreation,
                    // so we'll just update the material color which affects lines
                    if (gridHelperRef.current.material instanceof THREE.LineBasicMaterial) {
                        gridHelperRef.current.material.color.setHex(colors.grid)
                    }
                }
            },
            setVisible: (v: boolean) => {
                if (groupRef.current) {
                    groupRef.current.visible = v
                }
            },
        }))

        // Handle visibility changes (fallback / initial sync)
        useEffect(() => {
            if (groupRef.current) {
                groupRef.current.visible = visible
            }
        }, [visible])

        useEffect(() => {
            const colors = isDark ? THEME_COLORS.dark : THEME_COLORS.light

            const group = new THREE.Group()
            group.name = 'singaporeMap'
            group.visible = visible
            groupRef.current = group

            // 1. Base Plane (Satellite/Map Placeholder)
            // Singapore is roughly 50km wide. We'll map this to 50 world units for simplicity.
            const width = 50
            const height = 30 // Aspect ratio roughly 1.6
            const geometry = new THREE.PlaneGeometry(width, height, 64, 64)

            // Placeholder for Satellite Texture
            // In a real app, load texture here: const texture = new THREE.TextureLoader().load('/singapore_sat.jpg')
            const material = new THREE.MeshStandardMaterial({
                color: colors.ground,
                roughness: 0.8,
                metalness: 0.2,
                side: THREE.DoubleSide,
            })
            planeMaterialRef.current = material

            const plane = new THREE.Mesh(geometry, material)
            plane.rotation.x = -Math.PI / 2
            plane.receiveShadow = true
            group.add(plane)

            // 2. Terrain Grid (Digital Twin aesthetic)
            const gridHelper = new THREE.GridHelper(60, 60, colors.grid, colors.grid)
            gridHelper.position.y = 0.05 // Slightly above plane
            gridHelper.material.transparent = true
            gridHelper.material.opacity = 0.3
            gridHelperRef.current = gridHelper
            group.add(gridHelper)

            // 3. Optional: Add a few "Buildings" as extrusion placeholders
            // Central Business District
            const cbdGeo = new THREE.BoxGeometry(2, 4, 2)
            const cbdMat = new THREE.MeshStandardMaterial({ color: 0x4FC3F7, transparent: true, opacity: 0.7 })
            const cbd = new THREE.Mesh(cbdGeo, cbdMat)
            cbd.position.set(0, 2, 2) // Roughly center-south
            group.add(cbd)

            scene.add(group)

            return () => {
                scene.remove(group)
                geometry.dispose()
                material.dispose()
                cbdGeo.dispose()
                cbdMat.dispose()
            }
        }, [scene, isDark])

        return null
    }
)

SingaporeMap.displayName = 'SingaporeMap'
export default SingaporeMap
