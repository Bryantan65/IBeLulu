import { Bell, Send, User, Settings } from 'lucide-react'
import './TopNav.css'

interface TopNavProps {
    title: string
    subtitle?: string
}

export default function TopNav({ title, subtitle }: TopNavProps) {
    return (
        <header className="topnav">
            <div className="topnav__title-group">
                <h1 className="topnav__title">{title}</h1>
                {subtitle && <span className="topnav__subtitle">{subtitle}</span>}
            </div>

            <div className="topnav__actions">
                <button className="topnav__action topnav__action--primary">
                    <Send size={18} />
                    <span>Dispatch</span>
                </button>

                <button className="topnav__icon-btn topnav__notification">
                    <Bell size={20} />
                    <span className="topnav__notification-badge">3</span>
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
