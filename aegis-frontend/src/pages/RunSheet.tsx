import { Button, Badge, Card } from '../components/ui'
import { Download, Send, Calendar, Clock } from 'lucide-react'
import './RunSheet.css'

// Mock run sheet data
const mockRunSheet = {
    date: '2026-01-27',
    teams: {
        CLEANING: {
            AM: [
                { id: 'T001', type: 'cleanup', zone: 'Tampines East', clusterId: 'CL-001' },
                { id: 'T002', type: 'cleanup', zone: 'Tampines East', clusterId: 'CL-001' },
                { id: 'T003', type: 'inspection', zone: 'Bedok Central', clusterId: null },
            ],
            PM: [
                { id: 'T004', type: 'cleanup', zone: 'Pasir Ris', clusterId: 'CL-003' },
            ],
        },
        WASTE: {
            AM: [
                { id: 'T005', type: 'bulky_removal', zone: 'Simei', clusterId: 'CL-004' },
                { id: 'T006', type: 'bin_washdown', zone: 'Tampines Central', clusterId: null },
            ],
            PM: [
                { id: 'T007', type: 'bin_washdown', zone: 'Pasir Ris', clusterId: 'CL-003' },
                { id: 'T008', type: 'bulky_removal', zone: 'Pasir Ris', clusterId: 'CL-003' },
            ],
        },
    },
    summary: {
        totalTasks: 8,
        zonesServed: 5,
        estimatedDistance: 12.4,
    },
}

export default function RunSheet() {
    return (
        <div className="runsheet">
            {/* Header */}
            <div className="runsheet__header">
                <div className="runsheet__date">
                    <Calendar size={20} />
                    <span>{new Date(mockRunSheet.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                </div>
                <div className="runsheet__actions">
                    <Button variant="ghost" icon={<Download size={16} />}>Export</Button>
                    <Button variant="primary" icon={<Send size={16} />}>Dispatch All</Button>
                </div>
            </div>

            {/* Team columns */}
            <div className="runsheet__teams">
                {Object.entries(mockRunSheet.teams).map(([teamName, windows]) => (
                    <div key={teamName} className="runsheet__team">
                        <div className="runsheet__team-header">
                            <h3>{teamName} Team</h3>
                            <Badge variant="neutral" size="sm">
                                {(windows.AM?.length || 0) + (windows.PM?.length || 0)} tasks
                            </Badge>
                        </div>

                        {['AM', 'PM'].map((window) => (
                            <div key={window} className="runsheet__window">
                                <div className="runsheet__window-header">
                                    <Clock size={14} />
                                    <span>{window} Window</span>
                                </div>
                                <div className="runsheet__tasks">
                                    {(windows[window as 'AM' | 'PM'] || []).map((task) => (
                                        <Card key={task.id} padding="sm" className="runsheet__task">
                                            <div className="runsheet__task-header">
                                                <span className="runsheet__task-id">{task.id}</span>
                                                <Badge variant="info" size="sm">{task.type.replace('_', ' ')}</Badge>
                                            </div>
                                            <div className="runsheet__task-zone">{task.zone}</div>
                                            {task.clusterId && (
                                                <span className="runsheet__task-cluster">→ {task.clusterId}</span>
                                            )}
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Summary */}
            <Card className="runsheet__summary">
                <div className="runsheet__summary-item">
                    <span>Total Tasks</span>
                    <strong>{mockRunSheet.summary.totalTasks}</strong>
                </div>
                <div className="runsheet__summary-item">
                    <span>Zones Served</span>
                    <strong>{mockRunSheet.summary.zonesServed}</strong>
                </div>
                <div className="runsheet__summary-item">
                    <span>Est. Distance</span>
                    <strong>{mockRunSheet.summary.estimatedDistance} km</strong>
                </div>
            </Card>
        </div>
    )
}
