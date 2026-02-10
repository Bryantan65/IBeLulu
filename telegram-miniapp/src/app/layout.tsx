import type { Metadata } from 'next'
import Script from 'next/script'
import dynamic from 'next/dynamic'
import './globals.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Load TelegramInit client-only (no SSR) — the SDK needs the browser
const TelegramInit = dynamic(() => import('@/components/TelegramInit'), {
  ssr: false,
})

export const metadata: Metadata = {
  title: 'AEGIS Complaint',
  description: 'Telegram Mini App for AEGIS Complaint',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js?59"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <ErrorBoundary>
          <TelegramInit />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {children}
          </div>
        </ErrorBoundary>
      </body>
    </html>
  )
}
