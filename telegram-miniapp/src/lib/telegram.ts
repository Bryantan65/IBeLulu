// Client-side Telegram WebApp helpers
// Must only be called from 'use client' components

function getWebApp() {
  if (typeof window === 'undefined') return null
  return window.Telegram?.WebApp ?? null
}

export function getTelegramUser() {
  return getWebApp()?.initDataUnsafe?.user ?? null
}

export function getMainButton() {
  return getWebApp()?.MainButton ?? null
}
