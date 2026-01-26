import React from 'react'
import './Badge.css'

interface BadgeProps {
    variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
    size?: 'sm' | 'md'
    dot?: boolean
    children: React.ReactNode
}

export default function Badge({
    variant = 'neutral',
    size = 'md',
    dot = false,
    children,
}: BadgeProps) {
    return (
        <span className={`badge badge--${variant} badge--${size}`}>
            {dot && <span className="badge__dot" />}
            {children}
        </span>
    )
}
