import { useRef, useCallback } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'


interface TransitionOptions {
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    onTransitionStart?: () => void
    onTransitionComplete?: () => void
    globeGroup?: THREE.Group | null
    singaporeGroup?: THREE.Group | null
    markersGroup?: THREE.Group | null
}

export function useCameraTransition() {
    const timelineRef = useRef<gsap.core.Timeline | null>(null)

    const transitionToSingapore = useCallback(
        ({ camera, controls, globeGroup, singaporeGroup, markersGroup, onTransitionStart, onTransitionComplete }: TransitionOptions) => {
            if (timelineRef.current) timelineRef.current.kill()

            // Singapore coordinates (approximate for camera positioning)
            const sgLat = 1.3521
            const sgLng = 103.8198

            // Convert to 3D position on globe (radius ~5)
            const phi = (90 - sgLat) * (Math.PI / 180)
            const theta = (sgLng + 180) * (Math.PI / 180)
            const radius = 5

            // Target position on globe surface
            const targetPos = new THREE.Vector3(
                -radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.sin(theta)
            )

            // Camera position for "Zoom in" phase
            const zoomPos = targetPos.clone().multiplyScalar(1.5) // Closer to surface

            const tl = gsap.timeline({
                onStart: onTransitionStart,
                onComplete: onTransitionComplete,
            })

            timelineRef.current = tl

            // 1. Rotate Globe to Singapore
            // Calculating rotation needed to bring Singapore to front (0,0,radius)
            // Ideally we move the camera, but moving the camera to look at the point is easier with OrbitControls

            tl.to(controls.target, {
                x: targetPos.x,
                y: targetPos.y,
                z: targetPos.z,
                duration: 1.5,
                ease: 'power2.inOut',
            }, 0)

            tl.to(camera.position, {
                x: zoomPos.x,
                y: zoomPos.y,
                z: zoomPos.z,
                duration: 1.5,
                ease: 'power2.inOut',
            }, 0)

            // 2. Fade out Globe, Fade in Singapore Map
            if (globeGroup) {
                tl.to(globeGroup.scale, { x: 0.8, y: 0.8, z: 0.8, duration: 1 }, 1.2)
                tl.to(globeGroup.position, { y: -2, duration: 1 }, 1.2) // Drop down effect
            }
            if (markersGroup) {
                tl.to(markersGroup.scale, { x: 0.8, y: 0.8, z: 0.8, duration: 1 }, 1.2)
                tl.to(markersGroup.position, { y: -2, duration: 1 }, 1.2)
            }

            if (singaporeGroup) {
                // Initial state for singapore group
                singaporeGroup.visible = true
                singaporeGroup.scale.set(0.1, 0.1, 0.1)
                singaporeGroup.position.set(0, 0, 0)

                tl.fromTo(singaporeGroup.scale,
                    { x: 0.1, y: 0.1, z: 0.1 },
                    { x: 1, y: 1, z: 1, duration: 1, ease: 'back.out(1.2)' },
                    1.0
                )
            }

            // 3. Re-orient camera for flat map view (Singapore Mode)
            // Tilted view: Positioned somewhat above and south
            tl.to(controls.target, {
                x: 0,
                y: 0,
                z: 0,
                duration: 1.5,
                ease: 'power2.inOut',
            }, 1.5)

            tl.to(camera.position, {
                x: 0,
                y: 4, // Altitude
                z: 6, // Distance
                duration: 1.5,
                ease: 'power2.inOut',
            }, 1.5)

            return tl
        },
        []
    )

    const transitionToGlobal = useCallback(
        ({ camera, controls, globeGroup, singaporeGroup, markersGroup, onTransitionStart, onTransitionComplete }: TransitionOptions) => {
            if (timelineRef.current) timelineRef.current.kill()

            const tl = gsap.timeline({
                onStart: onTransitionStart,
                onComplete: onTransitionComplete,
            })

            timelineRef.current = tl

            // 1. Pull back from Singapore Map
            tl.to(camera.position, {
                y: 10,
                z: 10,
                duration: 1,
                ease: 'power2.in',
            }, 0)

            // 2. Scale down/Fade out Singapore
            if (singaporeGroup) {
                tl.to(singaporeGroup.scale, {
                    x: 0.01,
                    y: 0.01,
                    z: 0.01,
                    duration: 0.8,
                    ease: 'power2.in'
                }, 0.2)
            }

            // 3. Bring back Globe
            if (globeGroup) {
                globeGroup.visible = true
                tl.to(globeGroup.position, { y: 0, duration: 1, ease: 'power2.out' }, 0.5)
                tl.to(globeGroup.scale, { x: 1, y: 1, z: 1, duration: 1, ease: 'elastic.out(1, 0.75)' }, 0.5)
            }
            if (markersGroup) {
                markersGroup.visible = true
                tl.to(markersGroup.position, { y: 0, duration: 1, ease: 'power2.out' }, 0.5)
                tl.to(markersGroup.scale, { x: 1, y: 1, z: 1, duration: 1, ease: 'elastic.out(1, 0.75)' }, 0.5)
            }

            // 4. Reset Camera to Global Orbit
            tl.to(controls.target, {
                x: 0,
                y: 0,
                z: 0,
                duration: 1.5,
                ease: 'power2.inOut',
            }, 0.5)

            tl.to(camera.position, {
                x: 0,
                y: 8,
                z: 15,
                duration: 1.5,
                ease: 'power2.inOut',
            }, 0.5)

            return tl
        },
        []
    )

    return {
        transitionToSingapore,
        transitionToGlobal
    }
}
