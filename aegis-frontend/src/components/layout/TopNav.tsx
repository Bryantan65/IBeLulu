import { Bell, User, Settings, Menu, Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../../store'
import './TopNav.css'

interface TopNavProps {
    title: string
    subtitle?: string
    onMobileMenuToggle?: () => void
}

export default function TopNav({ title, subtitle, onMobileMenuToggle }: TopNavProps) {
    const { theme, toggleTheme } = useThemeStore()

    return (
        <header className="topnav">
            <div className="topnav__title-group">
                <button
                    className="topnav__mobile-menu-btn"
                    onClick={onMobileMenuToggle}
                    aria-label="Open menu"
                >
                    <Menu size={24} />
                </button>
                <h1 className="topnav__title">{title}</h1>
                {subtitle && <span className="topnav__subtitle">{subtitle}</span>}
            </div>

            <div className="topnav__actions">
                <button className="topnav__icon-btn topnav__notification">
                    <Bell size={20} />
                    <span className="topnav__notification-badge">3</span>
                </button>

                <button
                    className="topnav__icon-btn topnav__theme-toggle"
                    onClick={toggleTheme}
                    aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>

                <button className="topnav__icon-btn">
                    <Settings size={20} />
                </button>

                <div className="topnav__user">
                    <div className="topnav__avatar">
                        <User size={18} />
                    </div>
                    <div className="topnav__user-info">
                        <span className="topnav__user-name">Supervisor</span>
                        <span className="topnav__user-role">Operations</span>
                    </div>
                </div>
            </div>
        </header>
    )
}
