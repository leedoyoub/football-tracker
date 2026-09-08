import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import { oauthRedirectUrl } from './oauthRedirect'
import { clearLastRoute } from './lastRoute'
import { clearSupabaseAuthCallbackHash } from './oauthCallback'
import type { Session, User } from '@supabase/supabase-js'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  startupError: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  retryStartup: () => void
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  startupError: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  retryStartup: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [startupError, setStartupError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const client = supabase

    let active = true
    setLoading(true)
    setStartupError(false)

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setSession(session)
      // An auth event is emitted only after the SDK has completed its own URL
      // processing. Never read or persist callback tokens in application code.
      if (session) clearSupabaseAuthCallbackHash()
    })

    const resolveInitialSession = async () => {
      try {
        // In supabase-js v2 this awaits detectSessionInUrl initialization,
        // including the implicit hash callback used by this app.
        const { data: { session }, error } = await client.auth.getSession()
        if (error) throw error
        if (!active) return
        setSession(session)
        if (session) clearSupabaseAuthCallbackHash()
      } catch {
        if (!active) return
        // Do not log the thrown object: provider errors can contain URL data.
        console.error('[Football Tracker auth] Unable to resolve authentication startup.')
        setStartupError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    void resolveInitialSession()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [attempt])

  const retryStartup = useCallback(() => setAttempt(value => value + 1), [])

  const signInWithGoogle = async () => {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirectUrl(window.location.origin, import.meta.env.BASE_URL) },
    })
  }

  const signOut = async () => {
    if (!supabase) return
    // A route is device UI state, but it must not reopen a private screen after logout.
    clearLastRoute()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, startupError, signInWithGoogle, signOut, retryStartup }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
