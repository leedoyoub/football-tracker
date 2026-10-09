import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BottomNav } from './components/BottomNav'
const HomeScreen = lazy(() => import('./screens/HomeScreen').then(module => ({ default: module.HomeScreen })))
const MatchDetailScreen = lazy(() => import('./screens/MatchDetailScreen').then(module => ({ default: module.MatchDetailScreen })))
const NewMatchScreen = lazy(() => import('./screens/NewMatchScreen').then(module => ({ default: module.NewMatchScreen })))
const NewPlayerScreen = lazy(() => import('./screens/NewPlayerScreen').then(module => ({ default: module.NewPlayerScreen })))
const EditPlayerScreen = lazy(() => import('./screens/EditPlayerScreen').then(module => ({ default: module.EditPlayerScreen })))
const EditMatchScreen = lazy(() => import('./screens/EditMatchScreen').then(module => ({ default: module.EditMatchScreen })))
const PlayerDetailScreen = lazy(() => import('./screens/PlayerDetailScreen').then(module => ({ default: module.PlayerDetailScreen })))
const PlayersScreen = lazy(() => import('./screens/PlayersScreen').then(module => ({ default: module.PlayersScreen })))
const StandingsScreen = lazy(() => import('./screens/StandingsScreen').then(module => ({ default: module.StandingsScreen })))
const ChemistryScreen = lazy(() => import('./screens/ChemistryScreen').then(module => ({ default: module.ChemistryScreen })))
const ComparisonScreen = lazy(() => import('./screens/ComparisonScreen').then(module => ({ default: module.ComparisonScreen })))
const TeamDetailScreen = lazy(() => import('./screens/TeamDetailScreen').then(module => ({ default: module.TeamDetailScreen })))
const TeamsScreen = lazy(() => import('./screens/TeamsScreen').then(module => ({ default: module.TeamsScreen })))
const DataManagementScreen = lazy(() => import('./screens/DataManagementScreen').then(module => ({ default: module.DataManagementScreen })))
const SeasonRecapScreen = lazy(() => import('./screens/SeasonRecapScreen').then(module => ({ default: module.SeasonRecapScreen })))
const SeasonHighlightScreen = lazy(() => import('./screens/SeasonHighlightScreen').then(module => ({ default: module.SeasonHighlightScreen })))
const CompetitionScreen = lazy(() => import('./screens/CompetitionScreen').then(module => ({ default: module.CompetitionScreen })))
const RecordsScreen = lazy(() => import('./screens/RecordsScreen').then(module => ({ default: module.RecordsScreen })))
const RecordsLeaderboardScreen = lazy(() => import('./screens/RecordsLeaderboardScreen').then(module => ({ default: module.RecordsLeaderboardScreen })))
const LatestChangesScreen = lazy(() => import('./screens/LatestChangesScreen').then(module => ({ default: module.LatestChangesScreen })))
const ResultsScreen = lazy(() => import('./screens/ResultsScreen').then(module => ({ default: module.ResultsScreen })))
const GlobalRankingScreen = lazy(() => import('./screens/GlobalRankingScreen').then(module => ({ default: module.GlobalRankingScreen })))
const AwardRaceScreen = lazy(() => import('./screens/AwardRaceScreen').then(module => ({ default: module.AwardRaceScreen })))
const SquadImportScreen = lazy(() => import('./screens/SquadImportScreen').then(module => ({ default: module.SquadImportScreen })))
import { useStore } from './store'
import type { CompetitionType, NavigationEntry, ScreenState, ScreenStateByView, Tab, View } from './types'
import { seasonsFromMatches } from './engine/stats'
import { useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthEntryScreen } from './screens/AuthEntryScreen'
import { loadLastNavigationEntry, saveLastRoute } from './lib/lastRoute'
import { canUseApp, shouldRestoreLastRoute, startupScreen } from './lib/startup'
import { BootstrapShell, StartupRecovery } from './components/StartupBoundary'
import { appContentOverflowClass } from './lib/routeLayout'
import { loadLocalModePreference, saveLocalModePreference } from './lib/localMode'
import { backFromTeamDetailEntries, closeTransientWorkflow, completeTransientWorkflowToBrowse, createNavigationEntry, enterTransientWorkflow, navigateBrowseEntry, popNavigationEntry, replaceNavigationEntry, resetNavigationEntries, updateCurrentScreenState } from './lib/navigation'
import { restoreScrollWhenReachable } from './lib/scrollRestoration'
import { resetCompetitionTypeScroll } from './lib/competitionTypeScroll'
import { resolvePlayerDestination } from './lib/playerNavigation'

export default function App() {
  const { user, loading, startupError, signInWithGoogle, retryStartup } = useAuth()
  const store = useStore()
  const { matches, competitionStates = [] } = store
  const completedNextSeasons = competitionStates.filter(state => state.kind === 'season-complete').map(state => `Season ${Number(state.season.match(/\d+/)?.[0] ?? 1) + 1}`)
  const seasons = [...new Set([...seasonsFromMatches(matches), ...competitionStates.map(state => state.season), ...completedNextSeasons])].sort((a, b) => Number(b.match(/\d+/)?.[0] ?? 0) - Number(a.match(/\d+/)?.[0] ?? 0))
  const [season, setSeason] = useState(seasons[0] ?? 'Season 1')
  const [history, setHistory] = useState<NavigationEntry[]>([createNavigationEntry({ name: 'home' })])
  const [localOnly, setLocalOnly] = useState(loadLocalModePreference)
  const [routeRestored, setRouteRestored] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const restoreScroll = useRef(true)
  const entry = history[history.length - 1]
  const view = entry.view
  const startup = useMemo(
    () => ({ authLoading: loading, authError: startupError, isSupabaseConfigured, hasUser: Boolean(user), localOnly, routeRestored }),
    [loading, startupError, user, localOnly, routeRestored],
  )

  // StoreProvider only renders App after its local repository is ready. Waiting
  // for a resolved auth state prevents an old route from racing an OAuth return.
  useEffect(() => {
    if (!shouldRestoreLastRoute(startup)) return
    restoreScroll.current = true
    setHistory([loadLastNavigationEntry(store)])
    setRouteRestored(true)
  }, [startup, store])

  useEffect(() => {
    if (!routeRestored || loading || !canUseApp(startup)) return
    saveLastRoute(view, store.draftMatch, undefined, entry.screenState)
  }, [routeRestored, loading, startup, view, entry.screenState, store.draftMatch])

  // Logging out must not leave a previously authenticated in-memory route ready
  // to reappear after the next sign-in. Persistent route state is cleared by
  // AuthProvider; this clears the current React navigation stack as well.
  useEffect(() => {
    if (loading || !isSupabaseConfigured || user || localOnly || !routeRestored) return
    restoreScroll.current = true
    setHistory(resetNavigationEntries({ name: 'home' }))
    setRouteRestored(false)
  }, [loading, user, localOnly, routeRestored])

  useEffect(() => {
    const refresh = () => setLocalOnly(loadLocalModePreference())
    window.addEventListener('football-tracker-local-mode', refresh)
    return () => window.removeEventListener('football-tracker-local-mode', refresh)
  }, [])

  useLayoutEffect(() => {
    if (!restoreScroll.current) return
    const container = scrollRef.current
    if (!container) return
    restoreScroll.current = false
    return restoreScrollWhenReachable(container, entry.scrollTop)
  }, [entry, history])

  const tab: Tab = useMemo(() => {
    if (view.name === 'teams' || view.name === 'team' || view.name === 'import-squad' || view.name === 'new-match') {
      return 'teams'
    }
    if (view.name === 'players' || view.name === 'player' || view.name === 'new-player' || view.name === 'edit-player') {
      return 'players'
    }
    if (view.name === 'competition' || view.name === 'global-ranking' || view.name === 'award-race') return 'competition'
    if (view.name === 'records' || view.name === 'records-leaderboard' || view.name === 'chemistry' || view.name === 'comparison') return 'records'
    return 'home'
  }, [view])

  function onTab(next: Tab) {
    restoreScroll.current = true
    if (next === 'home') setHistory(resetNavigationEntries({ name: 'home' }))
    if (next === 'teams') setHistory(resetNavigationEntries({ name: 'teams' }))
    if (next === 'players') setHistory(resetNavigationEntries({ name: 'players' }))
    if (next === 'competition') setHistory(resetNavigationEntries({ name: 'competition' }))
    if (next === 'records') setHistory(resetNavigationEntries({ name: 'records' }))
  }

  function onNavigate(next: View) {
    restoreScroll.current = true
    setHistory((prev) => {
      const scrollTop = scrollRef.current?.scrollTop ?? 0
      if (next.name === 'new-match' || next.name === 'edit-match') return enterTransientWorkflow(prev, next, scrollTop)
      if (next.name === 'player') {
        const current = prev[prev.length - 1]
        const destination = resolvePlayerDestination(next, current.view, current.screenState, season, matches)
        return navigateBrowseEntry(prev, destination.view, scrollTop, destination.screenState)
      }
      return navigateBrowseEntry(prev, next, scrollTop)
    })
  }

  function onBack() {
    restoreScroll.current = true
    setHistory(popNavigationEntry)
  }

  function onTeamDetailBack() {
    restoreScroll.current = true
    setHistory(backFromTeamDetailEntries)
  }

  function onCloseTransientWorkflow() {
    restoreScroll.current = true
    setHistory(prev => closeTransientWorkflow(prev, { name: 'home' }))
  }

  function onCompleteTransientWorkflow(next: View) {
    restoreScroll.current = true
    setHistory(prev => closeTransientWorkflow(prev, next))
  }

  function onCompleteNewMatchWorkflow(next: View) {
    restoreScroll.current = true
    setHistory(prev => completeTransientWorkflowToBrowse(prev, next))
  }

  function onReplace(next: View) {
    restoreScroll.current = true
    setHistory(prev => replaceNavigationEntry(prev, next))
  }

  function onStateChange(next: ScreenState) {
    setHistory(prev => updateCurrentScreenState(prev, next))
  }

  function onCompetitionTypeChange(next: CompetitionType) {
    resetCompetitionTypeScroll(scrollRef.current)
    setHistory(prev => {
      const current = prev[prev.length - 1]
      if (!current || current.view.name !== 'competition') return prev
      const screenState = current.screenState as ScreenStateByView['competition']
      return updateCurrentScreenState(prev, { ...screenState, competitionType: next, cupViewAll: false })
    })
  }

  function onBackToTeam(teamId: string) {
    restoreScroll.current = true
    setHistory(prev => navigateBrowseEntry(prev, { name: 'team', id: teamId }, scrollRef.current?.scrollTop ?? 0))
  }

  function dismissPlayerEdit(playerId: string) {
    restoreScroll.current = true
    setHistory(prev => {
      const previous = prev[prev.length - 2]?.view
      return previous?.name === 'player' && previous.id === playerId
        ? popNavigationEntry(prev)
        : resetNavigationEntries({ name: 'player', id: playerId })
    })
  }

  const screen = startupScreen(startup)
  if (screen === 'loading') return <StartupLoading />
  if (screen === 'error') return <StartupError onRetry={retryStartup} />
  if (screen === 'auth-entry') return <AuthEntryScreen onSignIn={() => { void signInWithGoogle() }} onContinue={() => { saveLocalModePreference(); setLocalOnly(true) }} />

  return (
    <div className="min-h-[100dvh] bg-zinc-950">
      <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-black text-white shadow-2xl">
        <div ref={scrollRef} className={`app-content no-scrollbar min-h-0 flex-1 ${appContentOverflowClass(view)}`}>
          <Suspense fallback={<div className="flex min-h-48 items-center justify-center text-sm text-zinc-400">Loading screen…</div>}>
          {view.name === 'home' && (
            <HomeScreen season={season} screenState={entry.screenState as ScreenStateByView['home']} onStateChange={onStateChange} onSeason={setSeason} onNavigate={onNavigate} />
          )}
          {view.name === 'latest-changes' && <LatestChangesScreen season={view.season ?? season} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'competition' && <CompetitionScreen season={view.season ?? season} screenState={entry.screenState as ScreenStateByView['competition']} onStateChange={onStateChange} onCompetitionTypeChange={onCompetitionTypeChange} onSeason={(nextSeason) => { setSeason(nextSeason); setHistory(previous => previous.map((item, index) => index === previous.length - 1 && item.view.name === 'competition' ? { ...item, view: { ...item.view, season: nextSeason } } : item)) }} onNavigate={onNavigate} />}
          {view.name === 'global-ranking' && <GlobalRankingScreen season={view.season ?? season} screenState={entry.screenState as ScreenStateByView['global-ranking']} onStateChange={onStateChange} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'award-race' && <AwardRaceScreen screenState={entry.screenState as ScreenStateByView['award-race']} onStateChange={onStateChange} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'results' && <ResultsScreen onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'records' && <RecordsScreen season={season} screenState={entry.screenState as ScreenStateByView['records']} onStateChange={onStateChange} onNavigate={onNavigate} />}
          {view.name === 'records-leaderboard' && <RecordsLeaderboardScreen screenState={entry.screenState as ScreenStateByView['records-leaderboard']} onStateChange={onStateChange} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'standings' && <StandingsScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'season-recap' && <SeasonRecapScreen season={view.season} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'season-highlight' && <SeasonHighlightScreen season={view.season} kind={view.kind} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'chemistry' && <ChemistryScreen season={season} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'comparison' && <ComparisonScreen season={(entry.screenState as ScreenStateByView['comparison']).season ?? view.season ?? season} screenState={entry.screenState as ScreenStateByView['comparison']} onStateChange={onStateChange} onNavigate={onNavigate} />}

          {view.name === 'teams' && <TeamsScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'team' && <TeamDetailScreen teamId={view.id} season={season} screenState={entry.screenState as ScreenStateByView['team']} onStateChange={onStateChange} onNavigate={onNavigate} onBack={onTeamDetailBack} />}
          {view.name === 'import-squad' && <SquadImportScreen teamId={view.teamId} onBack={onBack} />}
          {view.name === 'players' && <PlayersScreen screenState={entry.screenState as ScreenStateByView['players']} onStateChange={onStateChange} onNavigate={onNavigate} />}

          {view.name === 'player' && (
            <PlayerDetailScreen playerId={view.id} season={view.season ?? season} screenState={entry.screenState as ScreenStateByView['player']} onStateChange={onStateChange} onNavigate={onNavigate} onBack={onBack} />
          )}
          {view.name === 'match' && <MatchDetailScreen matchId={view.id} screenState={entry.screenState as ScreenStateByView['match']} onStateChange={onStateChange} onNavigate={onNavigate} onBack={onBack} onBackToTeam={onBackToTeam} onReplace={onReplace} />}
          {view.name === 'edit-match' && <EditMatchScreen matchId={view.id} onReplace={onReplace} onBack={onCloseTransientWorkflow} onComplete={onCompleteTransientWorkflow} />}
          {view.name === 'new-match' && (
            <NewMatchScreen teamId={view.teamId} requestedSeason={view.season} competitionType={view.competitionType} resumeDraft={view.resumeDraft} onReplace={onReplace} onBack={onCloseTransientWorkflow} onComplete={onCompleteNewMatchWorkflow} />
          )}
          {view.name === 'new-player' && (
            <NewPlayerScreen teamId={view.teamId} onReplace={onReplace} onBack={onBack} />
          )}
          {view.name === 'edit-player' && <EditPlayerScreen playerId={view.id} onNavigate={onNavigate} onDone={dismissPlayerEdit} />}
          {view.name === 'data-management' && <DataManagementScreen onBack={onBack} />}
          {/* Removed Reset demo data button */}
          </Suspense>
        </div>
        <BottomNav tab={tab} onChange={onTab} />
      </div>
    </div>
  )
}

function StartupLoading() {
  return <BootstrapShell />
}

function StartupError({ onRetry }: { onRetry: () => void }) {
  return <StartupRecovery onRetry={onRetry} />
}
