// GeoJSON loader and cache utility
import { useRef, useCallback, useState } from 'react'
import * as THREE from 'three'

export interface GeoJSONFeature {
    type: 'Feature'
    properties: Record<string, unknown>
    geometry: {
        type: 'Polygon' | 'MultiPolygon' | 'Point' | 'LineString'
        coordinates: number[][] | number[][][] | number[][][][]
    }
}

export interface GeoJSONData {
    type: 'FeatureCollection'
    features: GeoJSONFeature[]
}

// Note: CachedShape interface removed as it's not currently used
// Future optimization: implement shape caching for repeated geometries

export function useGeoJSON() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const loadedData = useRef<Map<string, GeoJSONData>>(new Map())

    // Load GeoJSON from URL
    const loadGeoJSON = useCallback(async (url: string): Promise<GeoJSONData | null> => {
        // Check cache first
        if (loadedData.current.has(url)) {
            return loadedData.current.get(url)!
        }

        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch(url)
            if (!response.ok) {
                throw new Error(`Failed to load GeoJSON: ${response.statusText}`)
            }
            const data: GeoJSONData = await response.json()
            loadedData.current.set(url, data)
            return data
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            setError(message)
            return null
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Convert GeoJSON coordinates to THREE.Shape
    const coordinatesToShape = useCallback((coordinates: number[][]): THREE.Shape => {
        const shape = new THREE.Shape()

        coordinates.forEach((coord, index) => {
            // GeoJSON uses [lng, lat], we use [x, y] = [lng, lat]
            const x = coord[0] ?? 0
            const y = coord[1] ?? 0

            if (index === 0) {
                shape.moveTo(x, y)
            } else {
                shape.lineTo(x, y)
            }
        })

        shape.closePath()
        return shape
    }, [])

    // Parse GeoJSON feature to THREE.Shape(s)
    const featureToShapes = useCallback(
        (feature: GeoJSONFeature): THREE.Shape[] => {
            const shapes: THREE.Shape[] = []
            const { geometry } = feature

            if (geometry.type === 'Polygon') {
                // First ring is the outer boundary, rest are holes
                const coords = geometry.coordinates as number[][][]
                if (coords.length > 0 && coords[0]) {
                    const shape = coordinatesToShape(coords[0])
                    // Add holes
                    for (let i = 1; i < coords.length; i++) {
                        const holeCoords = coords[i]
                        if (!holeCoords) continue
                        const hole = new THREE.Path()
                        holeCoords.forEach((coord, index) => {
                            if (index === 0) {
                                hole.moveTo(coord[0] ?? 0, coord[1] ?? 0)
                            } else {
                                hole.lineTo(coord[0] ?? 0, coord[1] ?? 0)
                            }
                        })
                        shape.holes.push(hole)
                    }
                    shapes.push(shape)
                }
            } else if (geometry.type === 'MultiPolygon') {
                const multiCoords = geometry.coordinates as number[][][][]
                multiCoords.forEach((polygonCoords) => {
                    if (polygonCoords.length > 0 && polygonCoords[0]) {
                        const shape = coordinatesToShape(polygonCoords[0])
                        // Add holes
                        for (let i = 1; i < polygonCoords.length; i++) {
                            const holeCoords = polygonCoords[i]
                            if (!holeCoords) continue
                            const hole = new THREE.Path()
                            holeCoords.forEach((coord, index) => {
                                if (index === 0) {
                                    hole.moveTo(coord[0] ?? 0, coord[1] ?? 0)
                                } else {
                                    hole.lineTo(coord[0] ?? 0, coord[1] ?? 0)
                                }
                            })
                            shape.holes.push(hole)
                        }
                        shapes.push(shape)
                    }
                })
            }

            return shapes
        },
        [coordinatesToShape]
    )

    // Create extruded geometry from GeoJSON
    const createExtrudedGeometry = useCallback(
        (
            data: GeoJSONData,
            options: {
                depth?: number
                bevelEnabled?: boolean
                bevelThickness?: number
                bevelSize?: number
                scale?: number
                centerOffset?: { x: number; y: number }
            } = {}
        ): THREE.ExtrudeGeometry[] => {
            const {
                depth = 0.1,
                bevelEnabled = true,
                bevelThickness = 0.02,
                bevelSize = 0.01,
                scale = 1,
                centerOffset = { x: 0, y: 0 },
            } = options

            const geometries: THREE.ExtrudeGeometry[] = []

            data.features.forEach((feature) => {
                const shapes = featureToShapes(feature)

                shapes.forEach((shape) => {
                    // Scale and center the shape
                    const points = shape.getPoints()
                    points.forEach((point) => {
                        point.x = (point.x + centerOffset.x) * scale
                        point.y = (point.y + centerOffset.y) * scale
                    })

                    const geometry = new THREE.ExtrudeGeometry(shape, {
                        depth: depth * scale,
                        bevelEnabled,
                        bevelThickness: bevelThickness * scale,
                        bevelSize: bevelSize * scale,
                        bevelSegments: 2,
                    })

                    // Rotate to lie flat (XZ plane)
                    geometry.rotateX(-Math.PI / 2)

                    geometries.push(geometry)
                })
            })

            return geometries
        },
        [featureToShapes]
    )

    // Calculate bounds of GeoJSON
    const calculateBounds = useCallback((data: GeoJSONData): {
        minX: number
        maxX: number
        minY: number
        maxY: number
        centerX: number
        centerY: number
        width: number
        height: number
    } => {
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity

        const processCoords = (coords: number[]) => {
            const x = coords[0] ?? 0
            const y = coords[1] ?? 0
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, y)
            maxY = Math.max(maxY, y)
        }

        const processNestedCoords = (coords: unknown) => {
            if (Array.isArray(coords)) {
                if (typeof coords[0] === 'number') {
                    processCoords(coords as number[])
                } else {
                    coords.forEach(processNestedCoords)
                }
            }
        }

        data.features.forEach((feature) => {
            processNestedCoords(feature.geometry.coordinates)
        })

        return {
            minX,
            maxX,
            minY,
            maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            width: maxX - minX,
            height: maxY - minY,
        }
    }, [])

    return {
        loadGeoJSON,
        featureToShapes,
        createExtrudedGeometry,
        calculateBounds,
        isLoading,
        error,
    }
}
