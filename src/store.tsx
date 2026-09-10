import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppState, CompetitionState, Match, Player, Team } from './types'
import { LocalRepository } from './lib/repository'
import { STATIC_TEAMS, withStaticTeams } from './data/teams'
import { assertRosterCapacity, currentTeamIds } from './lib/roster'
import { applySquadImport, type SquadImportItem } from './lib/squadImport'
import { SyncManager } from './lib/sync'
import { useAuth } from './lib/auth'
import { BootstrapShell, StartupRecovery } from './components/StartupBoundary'
import { reconcileCompetitionRevisions, reviseChangedMatch, sameRawFootballValue, sameRawMatch, type CompetitionRevisions } from './engine/competitionRevision'

type StoreSnapshot = { data: AppState; competitionRevisions: CompetitionRevisions; teamCatalogRevision: number }

interface StoreValue extends AppState {
  competitionRevisions: CompetitionRevisions
  competitionCacheOwner: object
  teamCatalogRevision: number
  addTeam: (team: Omit<Team, 'id'> & { id?: string }) => string
  updateTeam: (id: string, team: Partial<Team>) => void
  addPlayer: (player: Omit<Player, 'id'> & { id?: string }) => string
  updatePlayer: (id: string, player: Partial<Player>) => void
  importPlayers: (players: SquadImportItem[]) => void
  addMatch: (match: Omit<Match, 'id'> & { id?: string }) => string
  updateMatch: (id: string, match: Match) => void
  saveDraftMatch: (match: Match) => void
  clearDraftMatch: () => void
  deleteMatch: (id: string) => void
  setChampionsDraw: (season: string, teamIds: string[]) => void
  completeSeason: (season: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

function reconcileTeamCatalog(snapshot: AppState): AppState {
  const teams = withStaticTeams(snapshot.teams)
  return teams === snapshot.teams ? snapshot : { ...snapshot, teams }
}

function sameTeamCatalog(left: Team[], right: Team[]): boolean {
  return left.length === right.length && left.every((team, index) => team.id === right[index]?.id)
}

function reconcileRepositorySnapshot(current: StoreSnapshot, incoming: AppState): StoreSnapshot {
  const competitionRevisions = reconcileCompetitionRevisions(current.competitionRevisions, current.data.matches, incoming.matches)
  const data: AppState = {
    ...incoming,
    teams: sameRawFootballValue(current.data.teams, incoming.teams) ? current.data.teams : incoming.teams,
    players: sameRawFootballValue(current.data.players, incoming.players) ? current.data.players : incoming.players,
    matches: competitionRevisions === current.competitionRevisions ? current.data.matches : incoming.matches,
    competitionStates: sameRawFootballValue(current.data.competitionStates ?? [], incoming.competitionStates ?? []) ? current.data.competitionStates : incoming.competitionStates,
  }
  if (sameRawFootballValue(current.data, data)) return current
  return { data, competitionRevisions, teamCatalogRevision: sameTeamCatalog(current.data.teams, incoming.teams) ? current.teamCatalogRevision : current.teamCatalogRevision + 1 }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const competitionCacheOwner = useMemo(() => ({}), [])
  const [snapshot, setSnapshot] = useState<StoreSnapshot>({ data: { teams: STATIC_TEAMS, players: [], matches: [], competitionStates: [] }, competitionRevisions: {}, teamCatalogRevision: 0 })
  const state = snapshot.data
  const [hydration, setHydration] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      setHydration('loading')
      try {
        const saved = await LocalRepository.getAppState()
        if (active && saved) {
          const reconciled = reconcileTeamCatalog(saved)
          setSnapshot(current => reconcileRepositorySnapshot(current, reconciled))
          if (reconciled !== saved) void LocalRepository.saveAppState(reconciled).then(() => SyncManager.queueStateChange(saved, reconciled)).then(() => SyncManager.syncNow()).catch(() => console.error('[Football Tracker storage] Catalog update deferred.'))
        }
      } catch {
        // Do not replace potentially recoverable durable data with an empty
        // snapshot after a browser storage/privacy failure.
        if (active) setHydration('error')
        console.error('[Football Tracker storage] Local hydration failed.')
        return
      } finally {
        if (active) setHydration(current => current === 'loading' ? 'ready' : current)
      }
    }
    void load()
    return () => { active = false }
  }, [attempt])

  useEffect(() => {
    if (hydration !== 'ready' || !user) return
    const sync = async () => {
      try {
        await SyncManager.syncNow()
        const restored = await LocalRepository.getAppState()
        if (restored) {
          const reconciled = reconcileTeamCatalog(restored)
          setSnapshot(current => reconcileRepositorySnapshot(current, reconciled))
          if (reconciled !== restored) void LocalRepository.saveAppState(reconciled).then(() => SyncManager.queueStateChange(restored, reconciled)).then(() => SyncManager.syncNow()).catch(() => console.error('[Football Tracker sync] Catalog update deferred.'))
        }
      } catch {
        // Cloud backup is non-critical to local startup.
        console.error('[Football Tracker sync] Post-auth sync deferred.')
      }
    }
    void sync()
    const onOnline = () => { void sync() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [hydration, user?.id])

  const update = useCallback((fn: (prev: AppState) => AppState, revise?: (current: StoreSnapshot, prev: AppState, next: AppState) => Pick<StoreSnapshot, 'competitionRevisions' | 'teamCatalogRevision'>) => {
    setSnapshot((current) => {
      const prev = current.data
      const next = fn(prev)
      if (next === prev) return current
      // Local persistence is always first. Cloud queueing is deliberately
      // detached so offline/auth/network failures never affect match recording.
      void LocalRepository.saveAppState(next).then(() => SyncManager.queueStateChange(prev, next)).then(() => SyncManager.syncNow()).catch(() => console.error('[Football Tracker storage] Local save deferred.'))
      return { data: next, ...(revise?.(current, prev, next) ?? { competitionRevisions: current.competitionRevisions, teamCatalogRevision: current.teamCatalogRevision }) }
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
      competitionRevisions: snapshot.competitionRevisions,
      competitionCacheOwner,
      teamCatalogRevision: snapshot.teamCatalogRevision,
      addTeam: (team) => {
        const id = team.id ?? crypto.randomUUID()
        update((prev) => ({ ...prev, teams: [...prev.teams, { ...team, id }] }), current => ({ competitionRevisions: current.competitionRevisions, teamCatalogRevision: current.teamCatalogRevision + 1 }))
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
      importPlayers: (imports) => {
        const nextPlayers = applySquadImport(state.players, imports, () => crypto.randomUUID())
        update(() => ({ ...state, players: nextPlayers }))
      },
      addMatch: (match) => {
        const id = match.id ?? crypto.randomUUID()
        const saved = { ...match, id }
        update((prev) => prev.matches.some(item => item.id === id) ? prev : ({ ...prev, matches: [...prev.matches, { ...saved }] }), current => ({ competitionRevisions: reviseChangedMatch(current.competitionRevisions, undefined, saved), teamCatalogRevision: current.teamCatalogRevision }))
        return id
      },
      updateMatch: (id, match) => {
        update((prev) => {
          const previous = prev.matches.find(item => item.id === id)
          const replacement = { ...match, id }
          if (!previous || sameRawMatch(previous, replacement)) return prev
          return { ...prev, matches: prev.matches.map((item) => item.id === id ? replacement : item) }
        }, (current, prev, next) => ({ competitionRevisions: reviseChangedMatch(current.competitionRevisions, prev.matches.find(item => item.id === id), next.matches.find(item => item.id === id)), teamCatalogRevision: current.teamCatalogRevision }))
      },
      saveDraftMatch,
      clearDraftMatch,
      deleteMatch: (id) => {
        update((prev) => prev.matches.some(match => match.id === id) ? ({ ...prev, matches: prev.matches.filter((m) => m.id !== id) }) : prev, (current, prev) => ({ competitionRevisions: reviseChangedMatch(current.competitionRevisions, prev.matches.find(item => item.id === id), undefined), teamCatalogRevision: current.teamCatalogRevision }))
      },
      setChampionsDraw: (season, teamIds) => {
        const draw: CompetitionState = { id: `champions:${season}`, season, kind: 'champions-draw', teamIds: [...teamIds] }
        update(prev => ({ ...prev, competitionStates: [...(prev.competitionStates ?? []).filter(item => item.id !== draw.id), draw] }))
      },
      completeSeason: (season) => {
        const completion: CompetitionState = { id: `complete:${season}`, season, kind: 'season-complete', teamIds: [] }
        update(prev => ({ ...prev, competitionStates: [...(prev.competitionStates ?? []).filter(item => item.id !== completion.id), completion] }))
      },
    }),
    [state, snapshot.competitionRevisions, snapshot.teamCatalogRevision, competitionCacheOwner, update, saveDraftMatch, clearDraftMatch],
  )

  if (hydration === 'loading') return <BootstrapShell />
  if (hydration === 'error') return <StartupRecovery onRetry={() => setAttempt(value => value + 1)} />

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
