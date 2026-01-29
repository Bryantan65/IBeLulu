import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { TilesRenderer } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins'

export interface PhotorealisticTilesRef {
    group: THREE.Group | null
    update: () => void
    setVisible: (visible: boolean) => void
}

interface PhotorealisticTilesProps {
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera | null
    renderer: THREE.WebGLRenderer | null
    apiKey: string
    visible?: boolean
}

const SINGAPORE_LAT = 1.3521
const SINGAPORE_LNG = 103.8198
const WORLD_SCALE = 0.001 // meters -> km scale for scene friendliness

function ecefFromLatLng(latDeg: number, lngDeg: number, height = 0): THREE.Vector3 {
    const lat = THREE.MathUtils.degToRad(latDeg)
    const lng = THREE.MathUtils.degToRad(lngDeg)
    const radius = 6378137 + height // WGS84 approximate

    const cosLat = Math.cos(lat)
    const sinLat = Math.sin(lat)
    const cosLng = Math.cos(lng)
    const sinLng = Math.sin(lng)

    const x = radius * cosLat * cosLng
    const y = radius * cosLat * sinLng
    const z = radius * sinLat

    return new THREE.Vector3(x, y, z)
}

function enuRotationMatrix(latDeg: number, lngDeg: number): THREE.Matrix4 {
    const lat = THREE.MathUtils.degToRad(latDeg)
    const lng = THREE.MathUtils.degToRad(lngDeg)

    const sinLat = Math.sin(lat)
    const cosLat = Math.cos(lat)
    const sinLng = Math.sin(lng)
    const cosLng = Math.cos(lng)

    // Basis vectors: East (X), Up (Y), North (Z)
    const east = new THREE.Vector3(-sinLng, cosLng, 0)
    const up = new THREE.Vector3(cosLat * cosLng, cosLat * sinLng, sinLat)
    const north = new THREE.Vector3(-sinLat * cosLng, -sinLat * sinLng, cosLat)

    return new THREE.Matrix4().makeBasis(east, up, north)
}

const PhotorealisticTiles = forwardRef<PhotorealisticTilesRef, PhotorealisticTilesProps>(
    ({ scene, camera, renderer, apiKey, visible = false }, ref) => {
        const tilesRef = useRef<TilesRenderer | null>(null)
        const groupRef = useRef<THREE.Group | null>(null)

        useImperativeHandle(ref, () => ({
            get group() {
                return groupRef.current
            },
            update: () => {
                if (!tilesRef.current || !camera || !renderer) return
                if (groupRef.current && !groupRef.current.visible) return
                tilesRef.current.setCamera(camera)
                tilesRef.current.setResolutionFromRenderer(camera, renderer)
                tilesRef.current.update()
            },
            setVisible: (v: boolean) => {
                if (groupRef.current) groupRef.current.visible = v
            },
        }))

        useEffect(() => {
            if (!scene || !camera || !renderer || !apiKey) return

            // Create TilesRenderer with GoogleCloudAuthPlugin for proper session/token handling
            const tilesRenderer = new TilesRenderer()
            tilesRenderer.registerPlugin(
                new GoogleCloudAuthPlugin({
                    apiToken: apiKey,
                    autoRefreshToken: true,
                } as any)
            )

            tilesRenderer.setCamera(camera)
            tilesRenderer.setResolutionFromRenderer(camera, renderer)

            tilesRenderer.group.name = 'singaporePhotorealisticTiles'
            tilesRenderer.group.visible = visible

            // Georeference tiles into local ENU space around Singapore
            const origin = ecefFromLatLng(SINGAPORE_LAT, SINGAPORE_LNG)
            const rotation = enuRotationMatrix(SINGAPORE_LAT, SINGAPORE_LNG)
            const translatedOrigin = origin.clone().applyMatrix4(rotation).multiplyScalar(-WORLD_SCALE)

            tilesRenderer.group.setRotationFromMatrix(rotation)
            tilesRenderer.group.position.copy(translatedOrigin)
            tilesRenderer.group.scale.setScalar(WORLD_SCALE)
            tilesRenderer.group.userData.baseScale = WORLD_SCALE
            tilesRenderer.group.userData.basePosition = translatedOrigin.clone()

            scene.add(tilesRenderer.group)

            tilesRef.current = tilesRenderer
            groupRef.current = tilesRenderer.group

            return () => {
                scene.remove(tilesRenderer.group)
                tilesRenderer.group.clear()
                if (typeof (tilesRenderer as any).dispose === 'function') {
                    (tilesRenderer as any).dispose()
                }
            }
        }, [scene, camera, renderer, apiKey])

        useEffect(() => {
            if (groupRef.current) {
                groupRef.current.visible = visible
            }
        }, [visible])

        return null
    }
)

PhotorealisticTiles.displayName = 'PhotorealisticTiles'
export default PhotorealisticTiles
