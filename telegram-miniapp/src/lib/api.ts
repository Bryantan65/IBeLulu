// Client-side API helper — attaches Telegram initData as auth token
// All fetch calls to our BFF API routes go through here

export async function apiFetch<T>(
  url: string,
  options: {
    method?: string
    body?: Record<string, unknown>
  } = {}
): Promise<T> {
  // Prefer Telegram WebApp.initData (available immediately via beforeInteractive script)
  // Fall back to localStorage (set by TelegramInit component, may not be ready on first render)
  const token = typeof window !== 'undefined'
    ? (window.Telegram?.WebApp?.initData || localStorage.getItem('tg_init_data'))
    : null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(data.error || `Request failed (${res.status})`)
  }

  return res.json()
}
