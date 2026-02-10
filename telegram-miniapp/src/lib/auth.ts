// Server-side auth helper — validates Telegram initData
import { isValid, parse } from '@telegram-apps/init-data-node/web'

const BOT_TOKEN = process.env.BOT_TOKEN

/**
 * Validate the Telegram initData token from the Authorization header.
 * Returns the parsed user info if valid, or null if invalid/missing.
 */
export async function validateInitData(authHeader: string | null) {
  if (!BOT_TOKEN) {
    console.warn('[auth] BOT_TOKEN not set — skipping validation')
    return { valid: true, user: null }
  }

  if (!authHeader) {
    return { valid: false, user: null }
  }

  const token = authHeader.replace('Bearer ', '')
  if (!token) {
    return { valid: false, user: null }
  }

  try {
    const valid = await isValid(token, BOT_TOKEN)
    if (!valid) {
      return { valid: false, user: null }
    }

    const parsed = parse(token)
    return { valid: true, user: parsed.user ?? null }
  } catch (err) {
    console.error('[auth] initData validation error:', err)
    return { valid: false, user: null }
  }
}
