import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Export null if not configured to keep local-first working seamlessly
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      // Supabase owns OAuth callback parsing and session persistence. In
      // particular, getSession() waits for this browser initialization before
      // it resolves, so callers never need to inspect OAuth tokens themselves.
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
export const isSupabaseConfigured = Boolean(supabase)
