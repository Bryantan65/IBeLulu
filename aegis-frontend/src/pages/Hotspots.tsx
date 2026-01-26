import { Badge, Card } from '../components/ui'
import { MapPin, AlertTriangle, Shield } from 'lucide-react'
import './Hotspots.css'

// Mock cluster data
const mockClusters = [
    { id: 'CL-001', category: 'Overflow', zone: 'Tampines East', state: 'REVIEWED', severity: 4, complaints: 5, priority: 85, fairnessBoost: true },
    { id: 'CL-002', category: 'Litter', zone: 'Bedok Central', state: 'TRIAGED', severity: 3, complaints: 3, priority: 72, fairnessBoost: false },
    { id: 'CL-003', category: 'Smell', zone: 'Pasir Ris', state: 'PLANNED', severity: 5, complaints: 7, priority: 95, fairnessBoost: true },
    { id: 'CL-004', category: 'Overflow', zone: 'Simei', state: 'NEW', severity: 2, complaints: 2, priority: 45, fairnessBoost: false },
]

export default function Hotspots() {
    return (
        <div className="hotspots">
            {/* Map placeholder */}
            <div className="hotspots__map">
                <div className="hotspots__map-placeholder">
                    <MapPin size={48} />
                    <span>Interactive Map</span>
                    <p>Zone polygons and cluster markers would appear here</p>
                </div>
            </div>

            {/* Cluster list */}
            <div className="hotspots__list">
                <h3>Active Clusters ({mockClusters.length})</h3>
                <div className="hotspots__clusters">
                    {mockClusters.map((cluster) => (
                        <Card key={cluster.id} variant="elevated" padding="md" className="hotspots__cluster">
                            <div className="hotspots__cluster-header">
                                <span className="hotspots__cluster-id">{cluster.id}</span>
                                <Badge
                                    variant={
                                        cluster.state === 'PLANNED' ? 'success' :
                                            cluster.state === 'REVIEWED' ? 'info' :
                                                cluster.state === 'TRIAGED' ? 'warning' : 'neutral'
                                    }
                                    size="sm"
                                >
                                    {cluster.state}
                                </Badge>
                            </div>

                            <div className="hotspots__cluster-body">
                                <div className="hotspots__cluster-category">
                                    <AlertTriangle size={16} />
                                    <span>{cluster.category}</span>
                                </div>
                                <div className="hotspots__cluster-zone">
                                    <MapPin size={16} />
                                    <span>{cluster.zone}</span>
                                </div>
                            </div>

                            <div className="hotspots__cluster-footer">
                                <div className="hotspots__cluster-stats">
                                    <span>Severity: <strong>{cluster.severity}</strong></span>
                                    <span>Complaints: <strong>{cluster.complaints}</strong></span>
                                </div>
                                <div className="hotspots__cluster-priority">
                                    Priority: <strong>{cluster.priority}</strong>
                                    {cluster.fairnessBoost && (
                                        <span className="hotspots__fairness-badge" title="Silent Zone Boost Applied">
                                            <Shield size={12} /> Boost
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
