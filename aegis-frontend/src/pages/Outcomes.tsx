import { Card, MetricCard } from '../components/ui'
import { Clock, RotateCcw, CheckCircle, Route, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './Outcomes.css'

// Mock metrics data
const mockMetrics = {
    timeToDispatch: { value: '2.4h', trend: 'down' as const, delta: '-18%' },
    timeToResolve: { value: '18h', trend: 'down' as const, delta: '-12%' },
    repeatRate: { value: '8%', trend: 'down' as const, delta: '-3%' },
    firstFixRate: { value: '87%', trend: 'up' as const, delta: '+5%' },
    distanceSaved: { value: '23%', trend: 'up' as const, delta: '+8%' },
}

const mockTrendData = [
    { day: 'Mon', dispatch: 3.2, resolve: 22, repeat: 12 },
    { day: 'Tue', dispatch: 2.8, resolve: 20, repeat: 10 },
    { day: 'Wed', dispatch: 2.6, resolve: 19, repeat: 9 },
    { day: 'Thu', dispatch: 2.5, resolve: 18, repeat: 8 },
    { day: 'Fri', dispatch: 2.3, resolve: 17, repeat: 7 },
    { day: 'Sat', dispatch: 2.4, resolve: 18, repeat: 8 },
    { day: 'Sun', dispatch: 2.4, resolve: 18, repeat: 8 },
]

const mockPlaybooks = [
    { name: 'bin_washdown', success: 45, fail: 3, rate: 94 },
    { name: 'bulky_removal', success: 32, fail: 5, rate: 86 },
    { name: 'cleanup', success: 78, fail: 8, rate: 91 },
    { name: 'inspection', success: 25, fail: 1, rate: 96 },
]

export default function Outcomes() {
    return (
        <div className="outcomes">
            {/* KPI Cards */}
            <div className="outcomes__kpis">
                <MetricCard
                    label="Time to Dispatch"
                    value={mockMetrics.timeToDispatch.value}
                    trend={mockMetrics.timeToDispatch.trend}
                    trendValue={mockMetrics.timeToDispatch.delta}
                    icon={<Clock size={18} />}
                />
                <MetricCard
                    label="Time to Resolve"
                    value={mockMetrics.timeToResolve.value}
                    trend={mockMetrics.timeToResolve.trend}
                    trendValue={mockMetrics.timeToResolve.delta}
                    icon={<CheckCircle size={18} />}
                />
                <MetricCard
                    label="Repeat Rate"
                    value={mockMetrics.repeatRate.value}
                    trend={mockMetrics.repeatRate.trend}
                    trendValue={mockMetrics.repeatRate.delta}
                    icon={<RotateCcw size={18} />}
                />
                <MetricCard
                    label="First-Fix Rate"
                    value={mockMetrics.firstFixRate.value}
                    trend={mockMetrics.firstFixRate.trend}
                    trendValue={mockMetrics.firstFixRate.delta}
                    icon={<TrendingUp size={18} />}
                />
                <MetricCard
                    label="Distance Saved"
                    value={mockMetrics.distanceSaved.value}
                    trend={mockMetrics.distanceSaved.trend}
                    trendValue={mockMetrics.distanceSaved.delta}
                    icon={<Route size={18} />}
                />
            </div>

            {/* Trend Chart */}
            <Card className="outcomes__chart">
                <h3>7-Day Trend</h3>
                <div className="outcomes__chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={mockTrendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="day" stroke="#6B7280" fontSize={12} />
                            <YAxis stroke="#6B7280" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    background: '#1F2937',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '8px',
                                }}
                            />
                            <Line type="monotone" dataKey="dispatch" stroke="#0D9488" strokeWidth={2} dot={false} name="Dispatch (h)" />
                            <Line type="monotone" dataKey="resolve" stroke="#6366F1" strokeWidth={2} dot={false} name="Resolve (h)" />
                            <Line type="monotone" dataKey="repeat" stroke="#EF4444" strokeWidth={2} dot={false} name="Repeat (%)" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* Playbook Performance */}
            <Card className="outcomes__playbooks">
                <h3>Playbook Performance</h3>
                <table className="outcomes__table">
                    <thead>
                        <tr>
                            <th>Playbook</th>
                            <th>Success</th>
                            <th>Fail</th>
                            <th>Success Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mockPlaybooks.map((pb) => (
                            <tr key={pb.name}>
                                <td className="outcomes__playbook-name">{pb.name.replace('_', ' ')}</td>
                                <td className="outcomes__success">{pb.success}</td>
                                <td className="outcomes__fail">{pb.fail}</td>
                                <td>
                                    <div className="outcomes__rate">
                                        <div className="outcomes__rate-bar">
                                            <div
                                                className="outcomes__rate-fill"
                                                style={{ width: `${pb.rate}%` }}
                                            />
                                        </div>
                                        <span>{pb.rate}%</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
        </div>
    )
}
