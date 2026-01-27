// Singapore Map - Extruded GeoJSON land mesh with water plane
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { useGeoJSON } from '../hooks/useGeoJSON'

export interface SingaporeMapRef {
    group: THREE.Group | null
    updateTheme: (isDark: boolean) => void
    setVisible: (visible: boolean) => void
}

interface SingaporeMapProps {
    scene: THREE.Scene
    isDark: boolean
    visible?: boolean
    scale?: number
}

const THEME_COLORS = {
    light: {
        land: 0x1A3F4E,
        landEdge: 0x163642,
        water: 0xB8D4E3,
        waterEdge: 0x8FBCD5,
    },
    dark: {
        land: 0x2B5A6D,
        landEdge: 0x3C8FB0,
        water: 0x0B171C,
        waterEdge: 0x1A2D38,
    },
}

// Singapore scale factor for display
const SG_SCALE = 50

const SingaporeMap = forwardRef<SingaporeMapRef, SingaporeMapProps>(
    ({ scene, isDark, visible = true, scale = SG_SCALE }, ref) => {
        const groupRef = useRef<THREE.Group | null>(null)
        const landMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)

        const { loadGeoJSON, createExtrudedGeometry, calculateBounds } = useGeoJSON()

        useImperativeHandle(ref, () => ({
            get group() {
                return groupRef.current
            },
            updateTheme: (dark: boolean) => {
                const colors = dark ? THEME_COLORS.dark : THEME_COLORS.light
                if (landMaterialRef.current) {
                    landMaterialRef.current.color.setHex(colors.land)
                    landMaterialRef.current.emissive.setHex(colors.landEdge)
                }

            },
            setVisible: (v: boolean) => {
                if (groupRef.current) {
                    groupRef.current.visible = v
                }
            },
        }))

        // Handle visibility changes separately to avoid recreating the group
        useEffect(() => {
            if (groupRef.current) {
                groupRef.current.visible = visible
            }
        }, [visible])

        useEffect(() => {
            const colors = isDark ? THEME_COLORS.dark : THEME_COLORS.light

            // Create group
            const group = new THREE.Group()
            group.name = 'singaporeMap'
            // Initialize with current visibility, but updates are handled by the effect above
            // We default to the prop value, but subsequent updates won't recreate the group
            group.visible = visible
            groupRef.current = group

            // Load and process GeoJSON
            const loadMap = async () => {
                const data = await loadGeoJSON('/data/singapore.geojson')
                if (!data) return

                // Calculate bounds for centering
                const bounds = calculateBounds(data)
                const centerOffset = {
                    x: -bounds.centerX,
                    y: -bounds.centerY,
                }

                // Create extruded land geometry
                const geometries = createExtrudedGeometry(data, {
                    depth: 0.02,
                    bevelEnabled: true,
                    bevelThickness: 0.005,
                    bevelSize: 0.003,
                    scale: scale,
                    centerOffset,
                })

                // Land material
                const landMaterial = new THREE.MeshStandardMaterial({
                    color: colors.land,
                    emissive: colors.landEdge,
                    emissiveIntensity: 0.1,
                    metalness: 0.2,
                    roughness: 0.8,
                    flatShading: false,
                })
                landMaterialRef.current = landMaterial

                // Add land meshes
                geometries.forEach((geometry) => {
                    const mesh = new THREE.Mesh(geometry, landMaterial)
                    mesh.userData = { type: 'land' }
                    mesh.castShadow = true
                    mesh.receiveShadow = true
                    group.add(mesh)
                })


            }

            loadMap()
            scene.add(group)

            // Cleanup
            return () => {
                scene.remove(group)
                group.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose()
                        if (child.material instanceof THREE.Material) {
                            child.material.dispose()
                        }
                    }
                })
            }
        }, [scene, isDark, scale, loadGeoJSON, createExtrudedGeometry, calculateBounds])

        return null
    }
)

SingaporeMap.displayName = 'SingaporeMap'
export default SingaporeMap
