import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let client: SupabaseClient | null | undefined

/**
 * Deliberately create the browser client only after React has mounted. Safari
 * can deny Web Storage while restoring an OAuth tab; constructing the SDK at
 * module evaluation time used to leave index.html with an empty root.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client
  if (!isSupabaseConfigured) {
    client = null
    return client
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
      // Supabase owns OAuth callback parsing and session persistence. In
      // particular, getSession() waits for this browser initialization before
      // it resolves, so callers never need to inspect OAuth tokens themselves.
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  return client
}
