import { create } from 'zustand'

// Types matching Context.md data model
export interface Complaint {
    id: string
    userId: string
    text: string
    photoUrl?: string
    lat: number
    lng: number
    locationLabel: string
    createdAt: string
    channel: 'telegram' | 'web'
    status: 'RECEIVED' | 'LINKED'
    categoryPred: string
    severityPred: 1 | 2 | 3 | 4 | 5
    urgencyPred: 'TODAY' | '48H' | 'WEEK'
    confidence: number
    clusterId?: string
}

export interface Cluster {
    id: string
    category: string
    centroidLat: number
    centroidLng: number
    zoneId: string
    state: 'NEW' | 'TRIAGED' | 'REVIEWED' | 'PLANNED' | 'DISPATCHED' | 'VERIFIED' | 'CLOSED'
    severityScore: number
    recurrenceCount: number
    lastSeenAt: string
    assignedPlaybook?: string
    requiresHumanReview: boolean
    priorityScore: number
    lastActionAt?: string
    complaintCount: number
}

export interface Task {
    id: string
    clusterId?: string
    taskType: 'cleanup' | 'bulky_removal' | 'bin_washdown' | 'inspection'
    assignedTeam: 'CLEANING' | 'WASTE'
    plannedDate: string
    timeWindow: 'AM' | 'PM'
    status: 'PLANNED' | 'DISPATCHED' | 'DONE' | 'VERIFIED'
    requiresApproval: boolean
    dispatchMessageId?: string
}

export interface Forecast {
    id: string
    date: string
    zoneId: string
    predictedCategory: 'bin_overflow' | 'litter' | 'smell' | 'general_cleanliness'
    riskScore: number
    reason: string
    suggestedPreemptiveTask: 'inspection' | 'bin_washdown' | 'bin_check'
}

export interface Simulation {
    id: string
    date: string
    knobs: {
        fairnessBoostStrength: number
        manpower: number
        proactiveBudget: number
        slaThreshold: 'TODAY' | '48H'
        maxTasksPerTeam: number
    }
    outputMetrics: {
        estimatedDistance: number
        tasksPerTrip: number
        slaCompliance: number
        overflowRiskReduction: number
        zonesServed: number
    }
}

interface OperationsState {
    // Data
    complaints: Complaint[]
    clusters: Cluster[]
    tasks: Task[]
    forecasts: Forecast[]
    simulations: Simulation[]

    // UI State
    selectedClusterId: string | null
    selectedZoneId: string | null
    hoveredClusterId: string | null

    // 3D Scene State
    cameraTarget: [number, number, number]
    highlightedZones: string[]
    sceneReady: boolean

    // Actions
    setComplaints: (complaints: Complaint[]) => void
    setClusters: (clusters: Cluster[]) => void
    setTasks: (tasks: Task[]) => void
    setForecasts: (forecasts: Forecast[]) => void
    selectCluster: (id: string | null) => void
    selectZone: (id: string | null) => void
    hoverCluster: (id: string | null) => void
    setCameraTarget: (target: [number, number, number]) => void
    setHighlightedZones: (zones: string[]) => void
    setSceneReady: (ready: boolean) => void
}

export const useOperationsStore = create<OperationsState>((set) => ({
    // Initial data
    complaints: [],
    clusters: [],
    tasks: [],
    forecasts: [],
    simulations: [],

    // Initial UI state
    selectedClusterId: null,
    selectedZoneId: null,
    hoveredClusterId: null,

    // Initial 3D state
    cameraTarget: [0, 0, 0],
    highlightedZones: [],
    sceneReady: false,

    // Actions
    setComplaints: (complaints) => set({ complaints }),
    setClusters: (clusters) => set({ clusters }),
    setTasks: (tasks) => set({ tasks }),
    setForecasts: (forecasts) => set({ forecasts }),
    selectCluster: (id) => set({ selectedClusterId: id }),
    selectZone: (id) => set({ selectedZoneId: id }),
    hoverCluster: (id) => set({ hoveredClusterId: id }),
    setCameraTarget: (target) => set({ cameraTarget: target }),
    setHighlightedZones: (zones) => set({ highlightedZones: zones }),
    setSceneReady: (ready) => set({ sceneReady: ready }),
}))
