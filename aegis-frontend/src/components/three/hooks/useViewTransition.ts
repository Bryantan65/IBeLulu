// View Transition Hook - Manages globe ↔ Singapore transitions
import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import { easing } from './useGlobeCamera'

export type ViewMode = 'global' | 'singapore'

interface TransitionState {
    isAnimating: boolean
    startTime: number
    duration: number
    fromMode: ViewMode
    toMode: ViewMode
}

interface TransitionCallbacks {
    onTransitionStart?: (fromMode: ViewMode, toMode: ViewMode) => void
    onTransitionComplete?: (mode: ViewMode) => void
    onTransitionProgress?: (progress: number) => void
}

export function useViewTransition(callbacks?: TransitionCallbacks) {
    const stateRef = useRef<TransitionState | null>(null)
    const globeOpacityRef = useRef(1)
    const singaporeOpacityRef = useRef(0)

    // Animate transition between views
    const transition = useCallback(
        (
            toMode: ViewMode,
            options: {
                duration?: number
                globeGroup?: THREE.Group | null
                singaporeGroup?: THREE.Group | null
                camera?: THREE.PerspectiveCamera | null
                controls?: { target: THREE.Vector3; update: () => void } | null
            } = {}
        ): Promise<void> => {
            return new Promise((resolve) => {
                const {
                    duration = 1200,
                    globeGroup,
                    singaporeGroup,
                    camera,
                    controls,
                } = options

                const fromMode: ViewMode = toMode === 'global' ? 'singapore' : 'global'

                stateRef.current = {
                    isAnimating: true,
                    startTime: performance.now(),
                    duration,
                    fromMode,
                    toMode,
                }

                callbacks?.onTransitionStart?.(fromMode, toMode)

                // Camera positions
                const globalCameraPos = new THREE.Vector3(0, 8, 15)
                const globalLookAt = new THREE.Vector3(0, 0, 0)
                const sgCameraPos = new THREE.Vector3(0, 15, 10)
                const sgLookAt = new THREE.Vector3(0, 0, 0)

                const startCameraPos = camera?.position.clone() || globalCameraPos
                const startLookAt = controls?.target.clone() || globalLookAt
                const endCameraPos = toMode === 'singapore' ? sgCameraPos : globalCameraPos
                const endLookAt = toMode === 'singapore' ? sgLookAt : globalLookAt

                const animate = () => {
                    if (!stateRef.current || !stateRef.current.isAnimating) {
                        resolve()
                        return
                    }

                    const elapsed = performance.now() - stateRef.current.startTime
                    const rawProgress = Math.min(elapsed / duration, 1)
                    const progress = easing.easeInOutCubic(rawProgress)

                    callbacks?.onTransitionProgress?.(progress)

                    // Animate camera
                    if (camera && controls) {
                        camera.position.lerpVectors(startCameraPos, endCameraPos, progress)
                        controls.target.lerpVectors(startLookAt, endLookAt, progress)
                        controls.update()
                    }

                    // Crossfade visibility
                    if (toMode === 'singapore') {
                        globeOpacityRef.current = 1 - progress
                        singaporeOpacityRef.current = progress

                        if (globeGroup) {
                            globeGroup.visible = progress < 0.9
                            globeGroup.scale.setScalar(1 - progress * 0.5)
                        }
                        if (singaporeGroup) {
                            singaporeGroup.visible = progress > 0.1
                            singaporeGroup.scale.setScalar(0.5 + progress * 0.5)
                        }
                    } else {
                        globeOpacityRef.current = progress
                        singaporeOpacityRef.current = 1 - progress

                        if (globeGroup) {
                            globeGroup.visible = progress > 0.1
                            globeGroup.scale.setScalar(0.5 + progress * 0.5)
                        }
                        if (singaporeGroup) {
                            singaporeGroup.visible = progress < 0.9
                            singaporeGroup.scale.setScalar(1 - progress * 0.5)
                        }
                    }

                    if (rawProgress < 1) {
                        requestAnimationFrame(animate)
                    } else {
                        stateRef.current.isAnimating = false

                        // Final visibility state
                        if (globeGroup) {
                            globeGroup.visible = toMode === 'global'
                            globeGroup.scale.setScalar(1)
                        }
                        if (singaporeGroup) {
                            singaporeGroup.visible = toMode === 'singapore'
                            singaporeGroup.scale.setScalar(1)
                        }

                        callbacks?.onTransitionComplete?.(toMode)
                        resolve()
                    }
                }

                requestAnimationFrame(animate)
            })
        },
        [callbacks]
    )

    // Check if currently transitioning
    const isTransitioning = useCallback((): boolean => {
        return stateRef.current?.isAnimating ?? false
    }, [])

    // Cancel current transition
    const cancelTransition = useCallback(() => {
        if (stateRef.current) {
            stateRef.current.isAnimating = false
        }
    }, [])

    return {
        transition,
        isTransitioning,
        cancelTransition,
        globeOpacity: globeOpacityRef.current,
        singaporeOpacity: singaporeOpacityRef.current,
    }
}
