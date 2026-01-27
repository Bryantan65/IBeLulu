import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface ThemeState {
    theme: Theme
    setTheme: (theme: Theme) => void
    toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: 'light',
            setTheme: (theme) => {
                set({ theme })
                applyTheme(theme)
            },
            toggleTheme: () => {
                const newTheme = get().theme === 'light' ? 'dark' : 'light'
                set({ theme: newTheme })
                applyTheme(newTheme)
            },
        }),
        {
            name: 'aegis-theme',
            onRehydrateStorage: () => (state) => {
                // Apply theme on rehydration
                if (state) {
                    applyTheme(state.theme)
                }
            },
        }
    )
)

function applyTheme(theme: Theme) {
    const root = document.documentElement
    if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark')
    } else {
        root.removeAttribute('data-theme')
    }
}

// Initialize theme on load
if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('aegis-theme')
    if (stored) {
        try {
            const parsed = JSON.parse(stored)
            applyTheme(parsed.state?.theme || 'light')
        } catch {
            applyTheme('light')
        }
    }
}
