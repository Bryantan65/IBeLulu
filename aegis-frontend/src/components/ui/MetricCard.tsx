import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import './MetricCard.css'

interface MetricCardProps {
    label: string
    value: string | number
    trend?: 'up' | 'down' | 'flat'
    trendValue?: string
    icon?: React.ReactNode
    className?: string
}

export default function MetricCard({
    label,
    value,
    trend,
    trendValue,
    icon,
    className = '',
}: MetricCardProps) {
    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

    return (
        <div className={`metric-card ${className}`}>
            <div className="metric-card__header">
                <span className="metric-card__label">{label}</span>
                {icon && <span className="metric-card__icon">{icon}</span>}
            </div>
            <div className="metric-card__value">{value}</div>
            {trend && (
                <div className={`metric-card__trend metric-card__trend--${trend}`}>
                    <TrendIcon size={14} />
                    {trendValue && <span>{trendValue}</span>}
                </div>
            )}
        </div>
    )
}
