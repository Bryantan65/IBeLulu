import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Lazy singleton — avoids crashing at build time when env vars are absent
let _client: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (_client) return _client
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  return _client
}

// Server-side only — never import this from client components
export { getSupabase as supabase }
export { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }
