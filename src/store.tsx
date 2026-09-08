import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppState, Match, Player, Team } from './types'
import { LocalRepository } from './lib/repository'
import { STATIC_TEAMS } from './data/teams'
import { assertRosterCapacity, currentTeamIds } from './lib/roster'
import { SyncManager } from './lib/sync'
import { useAuth } from './lib/auth'

interface StoreValue extends AppState {
  addTeam: (team: Omit<Team, 'id'> & { id?: string }) => string
  updateTeam: (id: string, team: Partial<Team>) => void
  addPlayer: (player: Omit<Player, 'id'> & { id?: string }) => string
  updatePlayer: (id: string, player: Partial<Player>) => void
  addMatch: (match: Omit<Match, 'id'> & { id?: string }) => string
  updateMatch: (id: string, match: Match) => void
  saveDraftMatch: (match: Match) => void
  clearDraftMatch: () => void
  deleteMatch: (id: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<AppState>({ teams: STATIC_TEAMS, players: [], matches: [] })
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    LocalRepository.getAppState().then((saved) => {
      if (saved) setState(saved)
      setIsLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!isLoaded || !user) return
    const sync = async () => {
      await SyncManager.syncNow()
      const restored = await LocalRepository.getAppState()
      if (restored) setState(restored)
    }
    void sync()
    const onOnline = () => { void sync() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [isLoaded, user?.id])

  const update = useCallback((fn: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = fn(prev)
      // Local persistence is always first. Cloud queueing is deliberately
      // detached so offline/auth/network failures never affect match recording.
      void LocalRepository.saveAppState(next).then(() => SyncManager.queueStateChange(prev, next)).then(() => SyncManager.syncNow())
      return next
    })
  }, [])
  const saveDraftMatch = useCallback((match: Match) => {
    update((prev) => ({ ...prev, draftMatch: match }))
  }, [update])
  const clearDraftMatch = useCallback(() => {
    update((prev) => ({ ...prev, draftMatch: undefined }))
  }, [update])

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      addTeam: (team) => {
        const id = team.id ?? crypto.randomUUID()
        update((prev) => ({ ...prev, teams: [...prev.teams, { ...team, id }] }))
        return id
      },
      updateTeam: (id, team) => update((prev) => ({ ...prev, teams: prev.teams.map((item) => item.id === id ? { ...item, ...team, id } : item) })),
      addPlayer: (player) => {
        const id = player.id ?? crypto.randomUUID()
        const teamIds = currentTeamIds(player)
        update((prev) => {
          assertRosterCapacity(prev.players, id, [], teamIds)
          return { ...prev, players: [...prev.players, { ...player, fullName: player.fullName ?? player.name, displayName: player.displayName ?? player.name, teamIds, teamId: teamIds[0] ?? '', id }] }
        })
        return id
      },
      updatePlayer: (id, player) => {
        update((prev) => ({
          ...prev,
          players: prev.players.map((p) => {
            if (p.id !== id) return p
            const previousIds = currentTeamIds(p)
            const teamIds = player.teamIds === undefined && player.teamId === undefined ? previousIds : currentTeamIds({ ...p, ...player })
            assertRosterCapacity(prev.players, id, previousIds, teamIds)
            return { ...p, ...player, teamIds, teamId: teamIds[0] ?? '', fullName: player.fullName ?? p.fullName ?? p.name, displayName: player.displayName ?? p.displayName ?? p.name }
          }),
        }))
      },
      addMatch: (match) => {
        const id = match.id ?? crypto.randomUUID()
        const saved = { ...match, id }
        update((prev) => prev.matches.some(item => item.id === id) ? prev : ({ ...prev, matches: [...prev.matches, { ...saved }] }))
        return id
      },
      updateMatch: (id, match) => {
        update((prev) => ({ ...prev, matches: prev.matches.map((item) => item.id === id ? { ...match, id } : item) }))
      },
      saveDraftMatch,
      clearDraftMatch,
      deleteMatch: (id) => {
        update((prev) => ({ ...prev, matches: prev.matches.filter((m) => m.id !== id) }))
      },
    }),
    [state, update, saveDraftMatch, clearDraftMatch],
  )

  if (!isLoaded) return null // Or a loading spinner

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
