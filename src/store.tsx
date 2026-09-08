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
  const [state, setState] = useState<AppState>({ teams: [], players: [], matches: [] })
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    LocalRepository.getAppState().then((saved) => {
      if (saved) setState(saved)
      setIsLoaded(true)
    })
  }, [])

  const update = useCallback((fn: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = fn(prev)
      LocalRepository.saveAppState(next)
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
        update((prev) => ({ ...prev, players: [...prev.players, { ...player, fullName: player.fullName ?? player.name, displayName: player.displayName ?? player.name, teamIds: player.teamIds ?? (player.teamId ? [player.teamId] : []), id }] }))
        return id
      },
      updatePlayer: (id, player) => {
        update((prev) => ({
          ...prev,
          players: prev.players.map((p) => (p.id === id ? { ...p, ...player, fullName: player.fullName ?? p.fullName ?? p.name, displayName: player.displayName ?? p.displayName ?? p.name } : p)),
        }))
      },
      addMatch: (match) => {
        const id = match.id ?? crypto.randomUUID()
        const saved = { ...match, id }
        update((prev) => ({ ...prev, matches: [...prev.matches, { ...saved }] }))
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
