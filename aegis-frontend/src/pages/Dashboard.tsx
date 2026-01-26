import { Clock, Users, AlertTriangle, MapPin } from 'lucide-react'
import { MetricCard } from '../components/ui'
import OperationsHub from '../components/three/OperationsHub'
import './Dashboard.css'

// Mock data for demo
const mockMetrics = {
    pendingReview: 3,
    activeClusters: 12,
    teamsDeployed: 4,
    forecastRisk: 'High',
}

export default function Dashboard() {
    return (
        <div className="dashboard">
            {/* 3D Operations Hub */}
            <section className="dashboard__hub">
                <OperationsHub />
            </section>

            {/* KPI Cards */}
            <section className="dashboard__metrics">
                <MetricCard
                    label="Pending Review"
                    value={mockMetrics.pendingReview}
                    trend="up"
                    trendValue="+2"
                    icon={<Clock size={18} />}
                />
                <MetricCard
                    label="Active Clusters"
                    value={mockMetrics.activeClusters}
                    trend="down"
                    trendValue="-3"
                    icon={<MapPin size={18} />}
                />
                <MetricCard
                    label="Teams Deployed"
                    value={mockMetrics.teamsDeployed}
                    trend="flat"
                    icon={<Users size={18} />}
                />
                <MetricCard
                    label="Tomorrow Risk"
                    value={mockMetrics.forecastRisk}
                    trend="up"
                    trendValue="Rain 85%"
                    icon={<AlertTriangle size={18} />}
                />
            </section>

            {/* Activity feeds */}
            <section className="dashboard__feeds">
                <div className="dashboard__feed">
                    <h3>Recent Activity</h3>
                    <div className="dashboard__feed-list">
                        <ActivityItem
                            time="2m ago"
                            text="Cluster #42 dispatched to Cleaning Team"
                            type="dispatch"
                        />
                        <ActivityItem
                            time="5m ago"
                            text="New complaint triaged: Litter at Tampines St 21"
                            type="triage"
                        />
                        <ActivityItem
                            time="12m ago"
                            text="Task verified: Bin washdown at Bedok North"
                            type="verify"
                        />
                        <ActivityItem
                            time="18m ago"
                            text="Forecast generated for tomorrow"
                            type="forecast"
                        />
                    </div>
                </div>

                <div className="dashboard__feed">
                    <h3>Agent Decisions</h3>
                    <div className="dashboard__feed-list">
                        <AgentItem
                            agent="ComplaintsAgent"
                            action="TRIAGE"
                            confidence={0.89}
                            detail="Overflow → Severity 4"
                        />
                        <AgentItem
                            agent="ReviewAgent"
                            action="REVIEW"
                            confidence={0.92}
                            detail="Playbook: bin_washdown"
                        />
                        <AgentItem
                            agent="ForecastAgent"
                            action="FORECAST"
                            confidence={0.78}
                            detail="3 high-risk zones"
                        />
                    </div>
                </div>
            </section>
        </div>
    )
}

function ActivityItem({ time, text, type }: { time: string; text: string; type: string }) {
    const typeColors: Record<string, string> = {
        dispatch: 'var(--color-primary)',
        triage: 'var(--color-info)',
        verify: 'var(--color-success)',
        forecast: 'var(--color-secondary)',
    }

    return (
        <div className="activity-item">
            <span className="activity-item__dot" style={{ background: typeColors[type] }} />
            <span className="activity-item__text">{text}</span>
            <span className="activity-item__time">{time}</span>
        </div>
    )
}

function AgentItem({ agent, action, confidence, detail }: {
    agent: string; action: string; confidence: number; detail: string
}) {
    return (
        <div className="agent-item">
            <div className="agent-item__header">
                <span className="agent-item__name">{agent}</span>
                <span className="agent-item__action">{action}</span>
            </div>
            <div className="agent-item__body">
                <span className="agent-item__detail">{detail}</span>
                <span className="agent-item__confidence">{Math.round(confidence * 100)}%</span>
            </div>
        </div>
    )
}
