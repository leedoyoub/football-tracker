import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppState, CompetitionState, Match, Player, Team } from './types'
import { LocalRepository, prepareImportData, preservePreImportBackup, type DurableSaveResult } from './lib/repository'
import { STATIC_TEAMS, withStaticTeams } from './data/teams'
import { assertRosterCapacity, currentTeamIds } from './lib/roster'
import { applySquadImport, type SquadImportItem } from './lib/squadImport'
import { registerSyncStoreAdapter, SyncManager } from './lib/sync'
import { useAuth } from './lib/auth'
import { BootstrapShell, StartupRecovery } from './components/StartupBoundary'
import { reconcileCompetitionRevisions, reviseChangedMatch, sameRawFootballValue, sameRawMatch, type CompetitionRevisions } from './engine/competitionRevision'
import { clearGlobalRankingCache } from './engine/stats'
import { competitionMutationSafety, leagueSlotConflict, reconcileChampionsPairingIds, reconcileSeasonCompletionMarkers } from './engine/competition'
import { preserveRecordedAt, recordNewMatch } from './engine/matchRecording'
import { createStoreTransactions } from './lib/storeTransactions'
import { sanitizeDraftLifecycle } from './lib/draftLifecycle'
import { measureInDevelopment } from './lib/developmentMeasurement'
import { performAtomicImport } from './lib/importTransaction'
import { assertValidStateTransition, StateValidationError } from './lib/validation'

type StoreSnapshot = { data: AppState; competitionRevisions: CompetitionRevisions; teamCatalogRevision: number }

interface StoreValue extends AppState {
  competitionRevisions: CompetitionRevisions
  competitionCacheOwner: object
  teamCatalogRevision: number
  addTeam: (team: Omit<Team, 'id'> & { id?: string }) => Promise<string>
  updateTeam: (id: string, team: Partial<Team>) => Promise<void>
  addPlayer: (player: Omit<Player, 'id'> & { id?: string }) => Promise<string>
  updatePlayer: (id: string, player: Partial<Player>) => Promise<void>
  importPlayers: (players: SquadImportItem[]) => Promise<void>
  addMatch: (match: Omit<Match, 'id'> & { id?: string }) => Promise<string>
  saveMatchDurably: (match: Match) => Promise<DurableSaveResult>
  updateMatch: (id: string, match: Match) => Promise<void>
  saveDraftMatch: (match: Match, options?: { flush?: boolean }) => Promise<void>
  clearDraftMatch: () => Promise<void>
  importAppState: (json: string) => Promise<void>
  deleteMatch: (id: string) => Promise<void>
  deleteAllMatches: () => Promise<void>
  setChampionsDraw: (season: string, teamIds: string[]) => Promise<void>
  completeSeason: (season: string) => Promise<void>
  retryLocalSave: () => Promise<DurableSaveResult>
}

const StoreContext = createContext<StoreValue | null>(null)

function reconcileTeamCatalog(snapshot: AppState): AppState {
  const teams = withStaticTeams(snapshot.teams)
  return teams === snapshot.teams ? snapshot : { ...snapshot, teams }
}

function reconcilePersistedState(snapshot: AppState): AppState {
  const matches = reconcileChampionsPairingIds(snapshot.matches, snapshot.competitionStates)
  return matches === snapshot.matches ? snapshot : { ...snapshot, matches }
}

function sameTeamCatalog(left: Team[], right: Team[]): boolean {
  return left.length === right.length && left.every((team, index) => team.id === right[index]?.id)
}

function reconcileRepositorySnapshot(current: StoreSnapshot, incoming: AppState): StoreSnapshot {
  incoming = sanitizeDraftLifecycle(incoming)
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
  const snapshotRef = useRef(snapshot)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const draftEpoch = useRef(0)
  /** Finalised IDs reject any late editor-effect checkpoint for that draft. */
  const finalizingDraftIds = useRef(new Set<string>())
  const publishSnapshot = useCallback((value: StoreSnapshot) => {
    snapshotRef.current = value
    setSnapshot(value)
  }, [])
  const [transactions] = useState(() => createStoreTransactions<StoreSnapshot, DurableSaveResult>(
      snapshot,
      value => LocalRepository.saveAppState(value.data),
      publishSnapshot,
    ))
  const persistLocal = useCallback((valid?: () => boolean) => {
    return transactions.persistCurrent(valid)
  }, [transactions])

  useEffect(() => {
    const retry = () => { void transactions.retryLatest().catch(error => console.error('[Football Tracker storage] Retry failed; current memory snapshot is retained.', error)) }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [transactions])

  useEffect(() => {
    let active = true
    const load = async () => {
      setHydration('loading')
      try {
        const saved = await LocalRepository.getAppState()
        if (active && saved) {
          const reconciled = sanitizeDraftLifecycle(reconcilePersistedState(reconcileTeamCatalog(saved)))
          const before = transactions.read().snapshot
          const hydrated = transactions.commit(current => reconcileRepositorySnapshot(current, reconciled), { persist: false })
          if (reconciled !== saved && hydrated.snapshot !== before) void persistLocal().then(() => SyncManager.queueStateChange(saved, transactions.read().snapshot.data)).then(() => SyncManager.syncNow()).catch(() => console.error('[Football Tracker storage] Catalog update deferred.'))
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
  }, [attempt, persistLocal, transactions])

  useEffect(() => registerSyncStoreAdapter({
    read: () => {
      const current = transactions.read()
      return { revision: current.revision, snapshot: current.snapshot.data }
    },
    apply: async (expectedRevision, incoming) => {
      const current = transactions.read()
      if (current.revision !== expectedRevision) return false
      const draftId = current.snapshot.data.draftMatch?.id
      if (draftId && incoming.matches.some(match => match.id === draftId)) {
        if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = undefined }
        draftEpoch.current++
        finalizingDraftIds.current.add(draftId)
      }
      const remote = { ...incoming, draftMatch: current.snapshot.data.draftMatch }
      const committed = transactions.commit(value => reconcileRepositorySnapshot(value, remote))
      if (committed.snapshot === current.snapshot) {
        await transactions.persistCurrent()
        return true
      }
      try { await committed.persisted }
      catch (error) {
        try { await transactions.retryLatest() } catch { /* Online/manual retry remains available for the latest in-memory snapshot. */ }
        throw error
      }
      return true
    },
  }), [transactions])

  useEffect(() => {
    if (hydration !== 'ready' || !user) return
    const sync = async () => {
      try {
        await SyncManager.syncNow()
      } catch {
        // Cloud backup is non-critical to local startup.
        console.error('[Football Tracker sync] Post-auth sync deferred.')
      }
    }
    void sync()
    const onOnline = () => { void sync() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [hydration, user])

  const update = useCallback((fn: (prev: AppState) => AppState, revise?: (current: StoreSnapshot, prev: AppState, next: AppState) => Pick<StoreSnapshot, 'competitionRevisions' | 'teamCatalogRevision'>) => {
    const before = snapshotRef.current
    let previous = before.data
    let next = previous
    let committed
    try {
      committed = transactions.commit(current => {
        previous = current.data
        next = fn(previous)
        if (next === previous) return current
        assertValidStateTransition(previous, next)
        const revisions = revise?.(current, previous, next) ?? { competitionRevisions: current.competitionRevisions, teamCatalogRevision: current.teamCatalogRevision }
        return { data: next, ...revisions }
      })
    } catch (error) {
      return Promise.reject(error)
    }
    return committed.persisted.then(async () => {
      if (next === previous && !transactions.isReplacing()) return
      try { await SyncManager.queueStateChange(previous, transactions.read().snapshot.data); await SyncManager.syncNow() }
      catch { console.error('[Football Tracker sync] Cloud update remains pending after local save.') }
    })
  }, [transactions])

  const saveMatchDurably = useCallback((match: Match) => measureInDevelopment('saveMatchDurably', async () => {
    const before = snapshotRef.current.data
    const existing = before.matches.find(item => item.id === match.id)
    if (existing) {
      const candidate = preserveRecordedAt(existing, match)
      const safety = competitionMutationSafety(before.matches, existing, candidate, before.teams, before.players, before.competitionStates?.find(state => state.kind === 'champions-draw' && state.season === existing.season))
      if (!safety.safe) throw new Error(safety.message)
    }
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = undefined }
    draftEpoch.current++
    finalizingDraftIds.current.add(match.id)
    let prior = before
    let next = before
    let saved = match
    // The final Match and removal of its matching checkpoint share one
    // authoritative primary write. An unrelated draft is intentionally kept.
    let committed
    try {
      committed = transactions.commit(current => {
        prior = current.data
        const currentPrevious = prior.matches.find(item => item.id === match.id)
        saved = currentPrevious ? preserveRecordedAt(currentPrevious, match) : recordNewMatch(match)
        const duplicateLeagueSlot = leagueSlotConflict(prior.matches, saved, saved.id)
        if (duplicateLeagueSlot) throw new Error(`A League match already exists for this team's MatchDay ${saved.matchDay}. Edit the saved match or choose another day.`)
        if (currentPrevious) {
          const safety = competitionMutationSafety(prior.matches, currentPrevious, saved, prior.teams, prior.players, prior.competitionStates?.find(state => state.kind === 'champions-draw' && state.season === currentPrevious.season))
          if (!safety.safe) throw new Error(safety.message)
        }
        const nextWithoutMarkers: AppState = currentPrevious
          ? { ...prior, matches: prior.matches.map(item => item.id === match.id ? saved : item) }
          : { ...prior, matches: [...prior.matches, saved] }
        next = sanitizeDraftLifecycle({ ...nextWithoutMarkers, competitionStates: reconcileSeasonCompletionMarkers(nextWithoutMarkers.competitionStates ?? [], nextWithoutMarkers.teams, nextWithoutMarkers.matches, nextWithoutMarkers.players) })
        const currentData = sanitizeDraftLifecycle(currentPrevious
          ? { ...prior, matches: prior.matches.map(item => item.id === match.id ? saved : item), competitionStates: next.competitionStates }
          : { ...prior, matches: [...prior.matches, saved], competitionStates: next.competitionStates })
        assertValidStateTransition(prior, currentData)
        return { data: currentData, competitionRevisions: reviseChangedMatch(current.competitionRevisions, currentPrevious, saved), teamCatalogRevision: current.teamCatalogRevision }
      })
    } catch (error) {
      finalizingDraftIds.current.delete(match.id)
      throw error
    }
    let durability: DurableSaveResult
    try {
      durability = await committed.persisted as DurableSaveResult
    } catch (error) {
      const currentMatch = transactions.read().snapshot.data.matches.find(item => item.id === match.id)
      if (!currentMatch || !sameRawMatch(currentMatch, saved)) finalizingDraftIds.current.delete(match.id)
      throw error
    }
    // Upload remains optional; a queue/cloud failure cannot negate durable
    // primary success or the navigation that follows it.
    void SyncManager.queueStateChange(prior, next).then(() => SyncManager.syncNow()).catch(() => console.error('[Football Tracker sync] Cloud sync pending after verified local save.'))
    return durability
  }), [transactions])
  const saveDraftMatch = useCallback((match: Match, options?: { flush?: boolean }) => {
    if (finalizingDraftIds.current.has(match.id)) return Promise.resolve()
    if (draftTimer.current) clearTimeout(draftTimer.current)
    const epoch = ++draftEpoch.current
    const valid = () => draftEpoch.current === epoch && !finalizingDraftIds.current.has(match.id)
    let committed
    try {
      committed = transactions.commit(current => {
        if (finalizingDraftIds.current.has(match.id)) return current
        const nextData = { ...current.data, draftMatch: match }
        assertValidStateTransition(current.data, nextData)
        return { ...current, data: nextData }
      }, { persist: Boolean(options?.flush), valid })
    } catch (error) {
      return Promise.reject(error)
    }
    if (options?.flush) return committed.persisted.then(() => undefined)
    draftTimer.current = setTimeout(() => {
      draftTimer.current = undefined
      void transactions.persistCurrent(valid).catch(error => console.error('[Football Tracker storage] Draft checkpoint remains in memory and was not saved.', error))
    }, 450)
    return Promise.resolve()
  }, [transactions])
  const clearDraftMatch = useCallback(() => {
    return update((prev) => ({ ...prev, draftMatch: undefined }))
  }, [update])
  const importAppState = useCallback(async (json: string) => {
    await performAtomicImport(json, {
      prepare: value => reconcilePersistedState(reconcileTeamCatalog(prepareImportData(value))),
      preserveBackup: preservePreImportBackup,
      prior: () => snapshotRef.current.data,
      cancelDraft: () => { if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = undefined } },
      invalidateDraft: () => { draftEpoch.current++ },
      replaceDurably: (next, fence) => transactions.replaceDurably(current => reconcileRepositorySnapshot(current, next), fence),
      invalidateDerived: clearGlobalRankingCache,
      replaceLive: () => {},
      sync: (prior, prepared) => { void SyncManager.queueStateChange(prior, prepared, { intent: 'import' }).then(() => SyncManager.syncNow()).catch(() => console.error('[Football Tracker sync] Imported state queued for sync.')) },
    })
  }, [transactions])

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      competitionRevisions: snapshot.competitionRevisions,
      competitionCacheOwner,
      teamCatalogRevision: snapshot.teamCatalogRevision,
      addTeam: (team) => {
        const id = team.id ?? crypto.randomUUID()
        return update((prev) => ({ ...prev, teams: [...prev.teams, { ...team, id }] }), current => ({ competitionRevisions: current.competitionRevisions, teamCatalogRevision: current.teamCatalogRevision + 1 })).then(() => id)
      },
      updateTeam: (id, team) => update((prev) => ({ ...prev, teams: prev.teams.map((item) => item.id === id ? { ...item, ...team, id } : item) })),
      addPlayer: (player) => {
        const id = player.id ?? crypto.randomUUID()
        const teamIds = currentTeamIds(player)
        return update((prev) => {
          assertRosterCapacity(prev.players, id, [], teamIds)
          return { ...prev, players: [...prev.players, { ...player, fullName: player.fullName ?? player.name, displayName: player.displayName ?? player.name, teamIds, teamId: teamIds[0] ?? '', id }] }
        }).then(() => id)
      },
      updatePlayer: (id, player) => {
        return update((prev) => ({
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
        return update((prev) => ({ ...prev, players: applySquadImport(prev.players, imports, () => crypto.randomUUID()) }))
      },
      addMatch: (match) => {
        const id = match.id ?? crypto.randomUUID()
        const saved = recordNewMatch({ ...match, id })
        return update((prev) => {
          if (prev.matches.some(item => item.id === id)) throw new StateValidationError({ code: 'match.duplicate_id', entityType: 'match', entityId: id, relatedIds: [id], message: `A match with ID ${id} already exists.` })
          return { ...prev, matches: [...prev.matches, { ...saved }] }
        }, current => ({ competitionRevisions: reviseChangedMatch(current.competitionRevisions, undefined, saved), teamCatalogRevision: current.teamCatalogRevision })).then(() => id)
      },
      saveMatchDurably,
      updateMatch: (id, match) => {
        const persistence = update((prev) => {
          const previous = prev.matches.find(item => item.id === id)
          const replacement = previous ? preserveRecordedAt(previous, { ...match, id }) : { ...match, id }
          if (!previous || sameRawMatch(previous, replacement)) return prev
          const safety = competitionMutationSafety(prev.matches, previous, replacement, prev.teams, prev.players, prev.competitionStates?.find(state => state.kind === 'champions-draw' && state.season === previous.season))
          if (!safety.safe) throw new Error(safety.message)
          const matches = prev.matches.map((item) => item.id === id ? replacement : item)
          return { ...prev, matches, competitionStates: reconcileSeasonCompletionMarkers(prev.competitionStates ?? [], prev.teams, matches, prev.players) }
        }, (current, prev, next) => ({ competitionRevisions: reviseChangedMatch(current.competitionRevisions, prev.matches.find(item => item.id === id), next.matches.find(item => item.id === id)), teamCatalogRevision: current.teamCatalogRevision }))
        clearGlobalRankingCache()
        return persistence
      },
      saveDraftMatch,
      clearDraftMatch,
      importAppState,
      deleteMatch: (id: string) => {
        return update((prev) => {
          const previous = prev.matches.find(match => match.id === id)
          if (!previous) return prev
          const safety = competitionMutationSafety(prev.matches, previous, undefined, prev.teams, prev.players, prev.competitionStates?.find(state => state.kind === 'champions-draw' && state.season === previous.season))
          if (!safety.safe) throw new Error(safety.message)
          const matches = prev.matches.filter(match => match.id !== id)
          return { ...prev, matches, competitionStates: reconcileSeasonCompletionMarkers(prev.competitionStates ?? [], prev.teams, matches, prev.players), ...(prev.draftMatch?.id === id ? { draftMatch: undefined } : {}) }
        }, (current, prev) => ({ competitionRevisions: reviseChangedMatch(current.competitionRevisions, prev.matches.find(item => item.id === id), undefined), teamCatalogRevision: current.teamCatalogRevision }))
      },
      deleteAllMatches: () => {
        return update((prev) => ({ ...prev, matches: [], draftMatch: undefined, competitionStates: [] }), (current, prev) => ({ competitionRevisions: reconcileCompetitionRevisions(current.competitionRevisions, prev.matches, []), teamCatalogRevision: current.teamCatalogRevision }))
      },
      setChampionsDraw: (season, teamIds) => {
        const draw: CompetitionState = { id: `champions:${season}`, season, kind: 'champions-draw', teamIds: [...teamIds] }
        return update(prev => ({ ...prev, competitionStates: [...(prev.competitionStates ?? []).filter(item => item.id !== draw.id), draw] }))
      },
      completeSeason: (season) => {
        const completion: CompetitionState = { id: `complete:${season}`, season, kind: 'season-complete', teamIds: [] }
        return update(prev => ({ ...prev, competitionStates: [...(prev.competitionStates ?? []).filter(item => item.id !== completion.id), completion] }))
      },
      retryLocalSave: () => transactions.retryLatest(),
    }),
    [state, snapshot.competitionRevisions, snapshot.teamCatalogRevision, competitionCacheOwner, update, saveDraftMatch, clearDraftMatch, saveMatchDurably, importAppState, transactions],
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
