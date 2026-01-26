import React from 'react'
import './Card.css'

interface CardProps {
    variant?: 'default' | 'elevated' | 'outlined'
    padding?: 'none' | 'sm' | 'md' | 'lg'
    onClick?: () => void
    className?: string
    children: React.ReactNode
}

export default function Card({
    variant = 'default',
    padding = 'md',
    onClick,
    className = '',
    children,
}: CardProps) {
    const Component = onClick ? 'button' : 'div'

    return (
        <Component
            className={`card card--${variant} card--padding-${padding} ${onClick ? 'card--clickable' : ''} ${className}`}
            onClick={onClick}
        >
            {children}
        </Component>
    )
}

// Card subcomponents
export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`card__header ${className}`}>{children}</div>
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`card__content ${className}`}>{children}</div>
}

export function CardFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`card__footer ${className}`}>{children}</div>
}
