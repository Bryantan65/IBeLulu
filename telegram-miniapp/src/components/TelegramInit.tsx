'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  backButton,
  closingBehavior,
  init,
  miniApp,
  useRawInitData,
} from '@telegram-apps/sdk-react'

export default function TelegramInit() {
  const rawInitData = useRawInitData()
  const pathname = usePathname()

  // Save rawInitData to localStorage for auth headers
  useEffect(() => {
    if (rawInitData) {
      localStorage.setItem('tg_init_data', rawInitData)
      console.log('[TelegramInit] initData saved to localStorage')
    }
  }, [rawInitData])

  // Initialize SDK, back button, mini app, closing behavior
  useEffect(() => {
    let offBackButtonClick: VoidFunction | undefined

    try {
      init()
      console.log('[TelegramInit] SDK initialized')

      // Mount and handle back button
      if (backButton.mount.isAvailable()) {
        backButton.mount()
      }
      if (backButton.onClick.isAvailable()) {
        offBackButtonClick = backButton.onClick(() => {
          window.history.back()
        })
      }

      // Mount mini app component (allows header/bg color customization)
      if (miniApp.mountSync.isAvailable()) {
        miniApp.mountSync()
      }

      // Enable closing confirmation to prevent accidental data loss
      if (closingBehavior.mount.isAvailable()) {
        closingBehavior.mount()
      }
      if (closingBehavior.enableConfirmation.isAvailable()) {
        closingBehavior.enableConfirmation()
      }
    } catch (err) {
      console.error('[TelegramInit] SDK init failed:', err)
      // Clean up URL params that Telegram injects
      const cleanUrl = window.location.origin + window.location.pathname
      window.history.replaceState({}, '', cleanUrl)
    }

    return () => {
      offBackButtonClick?.()
      if (backButton.isMounted()) {
        backButton.unmount()
      }
    }
  }, [])

  useEffect(() => {
    if (!backButton.isMounted()) return

    if (pathname === '/') {
      if (backButton.hide.isAvailable()) {
        backButton.hide()
      }
      return
    }

    if (backButton.show.isAvailable()) {
      backButton.show()
    }
  }, [pathname])

  return null
}
