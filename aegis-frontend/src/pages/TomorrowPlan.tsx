import { Button, Badge, Card } from '../components/ui'
import { CloudRain, Thermometer, Droplets, AlertTriangle, Plus } from 'lucide-react'
import './TomorrowPlan.css'

// Mock forecast data
const mockWeather = {
    rainProb: 85,
    temp: 32,
    humidity: 78,
}

const mockForecasts = [
    { id: 'F001', zone: 'Tampines North', category: 'bin_overflow', riskScore: 0.82, reason: 'High rain probability + historical overflow pattern' },
    { id: 'F002', zone: 'Pasir Ris', category: 'bin_overflow', riskScore: 0.79, reason: 'Large market nearby + rain forecast' },
    { id: 'F003', zone: 'Bedok Central', category: 'smell', riskScore: 0.65, reason: 'High humidity + food centre proximity' },
]

const mockPreemptiveTasks = [
    { id: 'PT001', type: 'bin_check', zone: 'Tampines North', selected: true },
    { id: 'PT002', type: 'inspection', zone: 'Pasir Ris', selected: true },
    { id: 'PT003', type: 'bin_washdown', zone: 'Bedok Central', selected: false },
]

export default function TomorrowPlan() {
    return (
        <div className="tomorrow-plan">
            {/* Weather Signal */}
            <Card className="tomorrow-plan__weather">
                <h3>Weather Signals</h3>
                <div className="tomorrow-plan__weather-grid">
                    <div className="tomorrow-plan__signal">
                        <CloudRain size={24} className="text-info" />
                        <span className="tomorrow-plan__signal-value">{mockWeather.rainProb}%</span>
                        <span className="tomorrow-plan__signal-label">Rain Prob.</span>
                    </div>
                    <div className="tomorrow-plan__signal">
                        <Thermometer size={24} className="text-warning" />
                        <span className="tomorrow-plan__signal-value">{mockWeather.temp}°C</span>
                        <span className="tomorrow-plan__signal-label">Temperature</span>
                    </div>
                    <div className="tomorrow-plan__signal">
                        <Droplets size={24} className="text-primary" />
                        <span className="tomorrow-plan__signal-value">{mockWeather.humidity}%</span>
                        <span className="tomorrow-plan__signal-label">Humidity</span>
                    </div>
                </div>
                <div className="tomorrow-plan__alert">
                    <AlertTriangle size={16} />
                    <span>High overflow risk due to weather conditions</span>
                </div>
            </Card>

            <div className="tomorrow-plan__content">
                {/* Risk Forecast */}
                <div className="tomorrow-plan__forecasts">
                    <h3>Risk Forecast</h3>
                    <div className="tomorrow-plan__forecast-list">
                        {mockForecasts.map((forecast) => (
                            <Card key={forecast.id} padding="md" className="tomorrow-plan__forecast">
                                <div className="tomorrow-plan__forecast-header">
                                    <span className="tomorrow-plan__forecast-zone">{forecast.zone}</span>
                                    <RiskMeter value={forecast.riskScore} />
                                </div>
                                <Badge variant={forecast.category === 'bin_overflow' ? 'danger' : 'warning'} size="sm">
                                    {forecast.category.replace('_', ' ')}
                                </Badge>
                                <p className="tomorrow-plan__forecast-reason">{forecast.reason}</p>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Preemptive Tasks */}
                <div className="tomorrow-plan__tasks">
                    <h3>Preemptive Tasks</h3>
                    <div className="tomorrow-plan__task-list">
                        {mockPreemptiveTasks.map((task) => (
                            <label key={task.id} className="tomorrow-plan__task">
                                <input type="checkbox" defaultChecked={task.selected} />
                                <div className="tomorrow-plan__task-info">
                                    <span className="tomorrow-plan__task-type">{task.type.replace('_', ' ')}</span>
                                    <span className="tomorrow-plan__task-zone">{task.zone}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                    <Button variant="primary" icon={<Plus size={16} />} className="tomorrow-plan__add-btn">
                        Add to Run Sheet
                    </Button>
                </div>
            </div>

            {/* Merge Preview */}
            <Card className="tomorrow-plan__preview">
                <span>Merged Preview:</span>
                <strong>Reactive (8) + Proactive (2) = 10 Tasks</strong>
            </Card>
        </div>
    )
}

function RiskMeter({ value }: { value: number }) {
    const percentage = Math.round(value * 100)
    const color = value >= 0.7 ? 'var(--color-danger)' : value >= 0.5 ? 'var(--color-warning)' : 'var(--color-success)'

    return (
        <div className="risk-meter">
            <div className="risk-meter__bar">
                <div className="risk-meter__fill" style={{ width: `${percentage}%`, background: color }} />
            </div>
            <span className="risk-meter__value" style={{ color }}>{percentage}%</span>
        </div>
    )
}
