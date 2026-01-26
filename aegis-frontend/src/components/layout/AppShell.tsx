import { Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import './AppShell.css'

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
    '/': { title: 'Operations Hub', subtitle: 'Real-time overview' },
    '/complaints': { title: 'Complaints', subtitle: 'Incoming & triaged' },
    '/hotspots': { title: 'Hotspots', subtitle: 'Active clusters' },
    '/review': { title: 'Review Queue', subtitle: 'Pending approvals' },
    '/runsheet': { title: 'Run Sheet', subtitle: 'Daily dispatch plan' },
    '/evidence': { title: 'Evidence', subtitle: 'Verification pending' },
    '/forecast': { title: 'Tomorrow Plan', subtitle: 'Proactive forecast' },
    '/simulator': { title: 'What-If', subtitle: 'Scenario analysis' },
    '/outcomes': { title: 'Outcomes', subtitle: 'Performance metrics' },
}

export default function AppShell() {
    const location = useLocation()
    const pageInfo = pageTitles[location.pathname] || { title: 'AEGIS' }
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <div className="app-shell">
            <Sidebar
                mobileMenuOpen={mobileMenuOpen}
                onMobileMenuClose={() => setMobileMenuOpen(false)}
            />
            <div className="app-shell__main">
                <TopNav
                    title={pageInfo.title}
                    subtitle={pageInfo.subtitle}
                    onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
                />
                <main className="app-shell__content">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}

