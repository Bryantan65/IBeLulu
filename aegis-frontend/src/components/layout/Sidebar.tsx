import { NavLink } from 'react-router-dom'
import {
    LayoutDashboard,
    MessageSquareWarning,
    MapPin,
    ClipboardCheck,
    Calendar,
    Camera,
    CloudSun,
    BarChart3,
    Users,
    ChevronLeft,
    Shield,
    X,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import './Sidebar.css'

interface NavItem {
    label: string
    icon: React.ReactNode
    href: string
    badge?: number
}

interface SidebarProps {
    mobileMenuOpen?: boolean
    onMobileMenuClose?: () => void
}

const navGroups: { title: string; items: NavItem[] }[] = [
    {
        title: 'Operations',
        items: [
            { label: 'Dashboard', icon: <LayoutDashboard size={20} />, href: '/' },
            { label: 'Complaints', icon: <MessageSquareWarning size={20} />, href: '/complaints' },
            { label: 'Hotspots', icon: <MapPin size={20} />, href: '/hotspots' },
            { label: 'Review Queue', icon: <ClipboardCheck size={20} />, href: '/review' },
        ],
    },
    {
        title: 'Execution',
        items: [
            { label: 'Teams', icon: <Users size={20} />, href: '/teams' },
            { label: 'Run Sheet', icon: <Calendar size={20} />, href: '/runsheet' },
            { label: 'Evidence', icon: <Camera size={20} />, href: '/evidence' },
        ],
    },
    {
        title: 'Intelligence',
        items: [
            { label: 'Tomorrow Plan', icon: <CloudSun size={20} />, href: '/forecast' },
        ],
    },
    {
        title: 'Insights',
        items: [
            { label: 'Outcomes', icon: <BarChart3 size={20} />, href: '/outcomes' },
        ],
    },
]

export default function Sidebar({ mobileMenuOpen = false, onMobileMenuClose }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false)

    // Close mobile menu on navigation click
    const handleLinkClick = () => {
        if (onMobileMenuClose) {
            onMobileMenuClose()
        }
    }

    // Prevent body scroll when mobile menu is open
    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [mobileMenuOpen])

    return (
        <>
            {/* Mobile backdrop */}
            {mobileMenuOpen && (
                <div
                    className="sidebar__backdrop"
                    onClick={onMobileMenuClose}
                    aria-hidden="true"
                />
            )}

            <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileMenuOpen ? 'sidebar--mobile-open' : ''}`}>
                <div className="sidebar__header">
                    <div className="sidebar__logo">
                        <Shield size={28} className="sidebar__logo-icon" />
                        {!collapsed && <span className="sidebar__brand">AEGIS</span>}
                    </div>
                    <button
                        className="sidebar__toggle sidebar__toggle--desktop"
                        onClick={() => setCollapsed(!collapsed)}
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        className="sidebar__toggle sidebar__toggle--mobile"
                        onClick={onMobileMenuClose}
                        aria-label="Close menu"
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar__nav">
                    {navGroups.map((group) => (
                        <div key={group.title} className="sidebar__group">
                            {!collapsed && <span className="sidebar__group-title">{group.title}</span>}
                            <ul className="sidebar__list">
                                {group.items.map((item) => (
                                    <li key={item.href}>
                                        <NavLink
                                            to={item.href}
                                            className={({ isActive }) =>
                                                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                                            }
                                            title={collapsed ? item.label : undefined}
                                            onClick={handleLinkClick}
                                        >
                                            <span className="sidebar__icon">{item.icon}</span>
                                            {!collapsed && <span className="sidebar__label">{item.label}</span>}
                                            {!collapsed && item.badge && (
                                                <span className="sidebar__badge">{item.badge}</span>
                                            )}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>

                <div className="sidebar__footer">
                    {!collapsed && (
                        <span className="sidebar__version">v0.1.0 • MVP</span>
                    )}
                </div>
            </aside>
        </>
    )
}
