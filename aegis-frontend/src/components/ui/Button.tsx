import React from 'react'
import './Button.css'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    icon?: React.ReactNode
    children: React.ReactNode
}

export default function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    children,
    className = '',
    disabled,
    ...props
}: ButtonProps) {
    return (
        <button
            className={`btn btn--${variant} btn--${size} ${loading ? 'btn--loading' : ''} ${className}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span className="btn__spinner" />}
            {icon && !loading && <span className="btn__icon">{icon}</span>}
            <span className="btn__text">{children}</span>
        </button>
    )
}
