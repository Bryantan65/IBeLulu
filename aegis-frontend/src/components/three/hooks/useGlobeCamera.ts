// Custom camera animation hook with easing
import { useRef, useCallback } from 'react'
import * as THREE from 'three'

interface CameraTarget {
    position: THREE.Vector3
    lookAt: THREE.Vector3
}

interface AnimationState {
    isAnimating: boolean
    startTime: number
    duration: number
    startPosition: THREE.Vector3
    startLookAt: THREE.Vector3
    endPosition: THREE.Vector3
    endLookAt: THREE.Vector3
}

// Easing functions
export const easing = {
    // Smooth ease-in-out
    easeInOutCubic: (t: number): number => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    },
    // Fast start, slow end
    easeOutQuart: (t: number): number => {
        return 1 - Math.pow(1 - t, 4)
    },
    // Slow start, fast end
    easeInQuart: (t: number): number => {
        return t * t * t * t
    },
    // Bouncy effect
    easeOutBack: (t: number): number => {
        const c1 = 1.70158
        const c3 = c1 + 1
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
    },
}

export function useGlobeCamera(
    camera: THREE.PerspectiveCamera | null,
    controls: { target: THREE.Vector3; update: () => void } | null
) {
    const animationRef = useRef<AnimationState | null>(null)
    const currentLookAt = useRef(new THREE.Vector3())

    // Fly camera to a specific position/target
    const flyTo = useCallback(
        (
            target: CameraTarget,
            duration: number = 1200,
            easingFn: (t: number) => number = easing.easeInOutCubic
        ): Promise<void> => {
            return new Promise((resolve) => {
                if (!camera || !controls) {
                    resolve()
                    return
                }

                animationRef.current = {
                    isAnimating: true,
                    startTime: performance.now(),
                    duration,
                    startPosition: camera.position.clone(),
                    startLookAt: controls.target.clone(),
                    endPosition: target.position.clone(),
                    endLookAt: target.lookAt.clone(),
                }

                const animate = () => {
                    if (!animationRef.current || !animationRef.current.isAnimating) {
                        resolve()
                        return
                    }

                    const elapsed = performance.now() - animationRef.current.startTime
                    const progress = Math.min(elapsed / animationRef.current.duration, 1)
                    const easedProgress = easingFn(progress)

                    // Interpolate position
                    camera.position.lerpVectors(
                        animationRef.current.startPosition,
                        animationRef.current.endPosition,
                        easedProgress
                    )

                    // Interpolate look-at target
                    currentLookAt.current.lerpVectors(
                        animationRef.current.startLookAt,
                        animationRef.current.endLookAt,
                        easedProgress
                    )
                    controls.target.copy(currentLookAt.current)
                    controls.update()

                    if (progress < 1) {
                        requestAnimationFrame(animate)
                    } else {
                        animationRef.current.isAnimating = false
                        resolve()
                    }
                }

                requestAnimationFrame(animate)
            })
        },
        [camera, controls]
    )

    // Convert lat/lng to 3D position on globe
    const latLngToVector3 = useCallback(
        (lat: number, lng: number, radius: number = 5, altitude: number = 0): THREE.Vector3 => {
            const phi = (90 - lat) * (Math.PI / 180)
            const theta = (lng + 180) * (Math.PI / 180)
            const r = radius + altitude

            return new THREE.Vector3(
                -r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta)
            )
        },
        []
    )

    // Fly to a specific lat/lng on the globe
    const flyToLatLng = useCallback(
        (
            lat: number,
            lng: number,
            distance: number = 8,
            duration: number = 1200
        ): Promise<void> => {
            const surfacePoint = latLngToVector3(lat, lng, 5)
            const cameraPosition = latLngToVector3(lat, lng, 5, distance)

            return flyTo(
                {
                    position: cameraPosition,
                    lookAt: surfacePoint,
                },
                duration
            )
        },
        [flyTo, latLngToVector3]
    )

    // Reset to default global view
    const resetView = useCallback(
        (duration: number = 1000): Promise<void> => {
            return flyTo(
                {
                    position: new THREE.Vector3(0, 8, 15),
                    lookAt: new THREE.Vector3(0, 0, 0),
                },
                duration
            )
        },
        [flyTo]
    )

    // Check if animation is in progress
    const isAnimating = useCallback((): boolean => {
        return animationRef.current?.isAnimating ?? false
    }, [])

    // Cancel current animation
    const cancelAnimation = useCallback(() => {
        if (animationRef.current) {
            animationRef.current.isAnimating = false
        }
    }, [])

    return {
        flyTo,
        flyToLatLng,
        resetView,
        isAnimating,
        cancelAnimation,
        latLngToVector3,
    }
}
