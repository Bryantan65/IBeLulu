import { Routes, Route } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import Dashboard from './pages/Dashboard'
import Complaints from './pages/Complaints'
import Hotspots from './pages/Hotspots'
import ReviewQueue from './pages/ReviewQueue'
import RunSheet from './pages/RunSheet'
import Evidence from './pages/Evidence'
import TomorrowPlan from './pages/TomorrowPlan'
import WhatIf from './pages/WhatIf'
import Outcomes from './pages/Outcomes'

function App() {
    return (
        <Routes>
            <Route path="/" element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="complaints" element={<Complaints />} />
                <Route path="hotspots" element={<Hotspots />} />
                <Route path="review" element={<ReviewQueue />} />
                <Route path="runsheet" element={<RunSheet />} />
                <Route path="evidence" element={<Evidence />} />
                <Route path="forecast" element={<TomorrowPlan />} />
                <Route path="simulator" element={<WhatIf />} />
                <Route path="outcomes" element={<Outcomes />} />
            </Route>
        </Routes>
    )
}

export default App
