import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getSupabase, isSupabaseConfigured } from './supabase'
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
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let active = true
    let initialSessionResolved = false
    let unsubscribe: (() => void) | undefined
    setLoading(true)
    setStartupError(false)

    const resolveInitialSession = async () => {
      try {
        // Client construction is inside the mounted async path: a Safari
        // storage exception becomes recovery UI instead of a pre-React crash.
        const client = getSupabase()
        if (!client) throw new Error('Supabase client is unavailable')
        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
          if (!active) return
          setSession(session)
          // getSession() is the single initial OAuth resolution path. Events
          // received while it is still running must not remove the hash first.
          if (initialSessionResolved && session) clearSupabaseAuthCallbackHash()
        })
        unsubscribe = () => subscription.unsubscribe()
        // In supabase-js v2 this awaits detectSessionInUrl initialization,
        // including the implicit hash callback used by this app.
        const { data: { session }, error } = await client.auth.getSession()
        if (error) throw error
        if (!active) return
        initialSessionResolved = true
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
      unsubscribe?.()
    }
  }, [attempt])

  const retryStartup = useCallback(() => setAttempt(value => value + 1), [])

  const signInWithGoogle = async () => {
    const client = getSupabase()
    if (!client) return
    await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirectUrl(window.location.origin, import.meta.env.BASE_URL) },
    })
  }

  const signOut = async () => {
    const client = getSupabase()
    if (!client) return
    // A route is device UI state, but it must not reopen a private screen after logout.
    clearLastRoute()
    await client.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, startupError, signInWithGoogle, signOut, retryStartup }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
