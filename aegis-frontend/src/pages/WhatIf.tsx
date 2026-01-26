import { useState } from 'react'
import { Button, Card, MetricCard } from '../components/ui'
import { RefreshCw, Check, AlertTriangle } from 'lucide-react'
import './WhatIf.css'

interface Knobs {
    fairnessBoost: number
    manpower: number
    proactiveBudget: number
    slaThreshold: 'TODAY' | '48H'
}

interface Metrics {
    estimatedDistance: number
    tasksPerTrip: number
    slaCompliance: number
    overflowRiskReduction: number
}

const defaultKnobs: Knobs = {
    fairnessBoost: 1.0,
    manpower: 4,
    proactiveBudget: 4,
    slaThreshold: '48H',
}

const calculateMetrics = (knobs: Knobs): Metrics => {
    // Simulated calculation based on knobs
    const baseDistance = 12.4
    const distanceMultiplier = 1 + (knobs.fairnessBoost - 1) * 0.3 - (knobs.manpower - 4) * 0.05

    return {
        estimatedDistance: Math.round(baseDistance * distanceMultiplier * 10) / 10,
        tasksPerTrip: Math.round((3.2 - (knobs.proactiveBudget - 4) * 0.1) * 10) / 10,
        slaCompliance: Math.min(100, Math.round(85 + (knobs.slaThreshold === 'TODAY' ? 7 : 0) + (knobs.manpower - 4) * 3)),
        overflowRiskReduction: Math.min(100, Math.round(40 + knobs.proactiveBudget * 5)),
    }
}

export default function WhatIf() {
    const [scenarioA] = useState<Knobs>(defaultKnobs)
    const [scenarioB, setScenarioB] = useState<Knobs>({ ...defaultKnobs, fairnessBoost: 1.5, manpower: 3, proactiveBudget: 6 })

    const metricsA = calculateMetrics(scenarioA)
    const metricsB = calculateMetrics(scenarioB)

    const getDelta = (a: number, b: number) => {
        const diff = b - a
        const sign = diff > 0 ? '+' : ''
        return `${sign}${Math.round(diff * 10) / 10}`
    }

    return (
        <div className="whatif">
            <div className="whatif__header">
                <Button variant="ghost" icon={<RefreshCw size={16} />}>Reset</Button>
                <Button variant="primary" icon={<Check size={16} />}>Apply to Dispatch</Button>
            </div>

            <div className="whatif__scenarios">
                {/* Scenario A - Current */}
                <Card className="whatif__scenario">
                    <h3>Scenario A <span>(Current)</span></h3>

                    <div className="whatif__knobs">
                        <KnobDisplay label="Fairness Boost" value={scenarioA.fairnessBoost.toFixed(1)} />
                        <KnobDisplay label="Manpower" value={scenarioA.manpower} />
                        <KnobDisplay label="Proactive Budget" value={scenarioA.proactiveBudget} />
                        <KnobDisplay label="SLA Threshold" value={scenarioA.slaThreshold} />
                    </div>

                    <div className="whatif__metrics">
                        <MetricCard label="Est. Distance" value={`${metricsA.estimatedDistance} km`} />
                        <MetricCard label="Tasks/Trip" value={metricsA.tasksPerTrip} />
                        <MetricCard label="SLA Compliance" value={`${metricsA.slaCompliance}%`} />
                        <MetricCard label="Overflow Risk Δ" value={`-${metricsA.overflowRiskReduction}%`} />
                    </div>
                </Card>

                {/* Scenario B - Modified */}
                <Card className="whatif__scenario whatif__scenario--active">
                    <h3>Scenario B <span>(Modified)</span></h3>

                    <div className="whatif__knobs">
                        <Knob
                            label="Fairness Boost"
                            value={scenarioB.fairnessBoost}
                            min={0.5}
                            max={2}
                            step={0.1}
                            onChange={(v) => setScenarioB({ ...scenarioB, fairnessBoost: v })}
                        />
                        <Knob
                            label="Manpower"
                            value={scenarioB.manpower}
                            min={2}
                            max={8}
                            step={1}
                            onChange={(v) => setScenarioB({ ...scenarioB, manpower: v })}
                        />
                        <Knob
                            label="Proactive Budget"
                            value={scenarioB.proactiveBudget}
                            min={0}
                            max={10}
                            step={1}
                            onChange={(v) => setScenarioB({ ...scenarioB, proactiveBudget: v })}
                        />
                        <div className="whatif__knob">
                            <label>SLA Threshold</label>
                            <select
                                value={scenarioB.slaThreshold}
                                onChange={(e) => setScenarioB({ ...scenarioB, slaThreshold: e.target.value as 'TODAY' | '48H' })}
                            >
                                <option value="TODAY">TODAY</option>
                                <option value="48H">48H</option>
                            </select>
                        </div>
                    </div>

                    <div className="whatif__metrics">
                        <MetricCard
                            label="Est. Distance"
                            value={`${metricsB.estimatedDistance} km`}
                            trend={metricsB.estimatedDistance > metricsA.estimatedDistance ? 'up' : 'down'}
                            trendValue={getDelta(metricsA.estimatedDistance, metricsB.estimatedDistance)}
                        />
                        <MetricCard
                            label="Tasks/Trip"
                            value={metricsB.tasksPerTrip}
                            trend={metricsB.tasksPerTrip < metricsA.tasksPerTrip ? 'down' : 'up'}
                            trendValue={getDelta(metricsA.tasksPerTrip, metricsB.tasksPerTrip)}
                        />
                        <MetricCard
                            label="SLA Compliance"
                            value={`${metricsB.slaCompliance}%`}
                            trend={metricsB.slaCompliance > metricsA.slaCompliance ? 'up' : 'down'}
                            trendValue={getDelta(metricsA.slaCompliance, metricsB.slaCompliance)}
                        />
                        <MetricCard
                            label="Overflow Risk Δ"
                            value={`-${metricsB.overflowRiskReduction}%`}
                            trend="up"
                            trendValue={getDelta(metricsA.overflowRiskReduction, metricsB.overflowRiskReduction)}
                        />
                    </div>
                </Card>
            </div>

            {/* Tradeoff Alert */}
            <Card className="whatif__alert">
                <AlertTriangle size={18} />
                <span>
                    <strong>Tradeoff:</strong> Distance increased by {getDelta(metricsA.estimatedDistance, metricsB.estimatedDistance)} km but SLA compliance improved by {getDelta(metricsA.slaCompliance, metricsB.slaCompliance)}%
                </span>
            </Card>
        </div>
    )
}

function KnobDisplay({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="whatif__knob whatif__knob--readonly">
            <label>{label}</label>
            <span>{value}</span>
        </div>
    )
}

function Knob({ label, value, min, max, step, onChange }: {
    label: string
    value: number
    min: number
    max: number
    step: number
    onChange: (value: number) => void
}) {
    return (
        <div className="whatif__knob">
            <label>{label}</label>
            <div className="whatif__knob-input">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                />
                <span>{step < 1 ? value.toFixed(1) : value}</span>
            </div>
        </div>
    )
}
