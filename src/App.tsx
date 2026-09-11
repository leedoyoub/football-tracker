import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomNav } from './components/BottomNav'
import { HomeScreen } from './screens/HomeScreen'
import { MatchDetailScreen } from './screens/MatchDetailScreen'
import { NewMatchScreen } from './screens/NewMatchScreen'
import { NewPlayerScreen } from './screens/NewPlayerScreen'
import { EditPlayerScreen } from './screens/EditPlayerScreen'
import { EditMatchScreen } from './screens/EditMatchScreen'
import { PlayerDetailScreen } from './screens/PlayerDetailScreen'
import { PlayersScreen } from './screens/PlayersScreen'
import { StandingsScreen } from './screens/StandingsScreen'
import { ChemistryScreen } from './screens/ChemistryScreen'
import { ComparisonScreen } from './screens/ComparisonScreen'
import { TeamDetailScreen } from './screens/TeamDetailScreen'
import { TeamsScreen } from './screens/TeamsScreen'
import { DataManagementScreen } from './screens/DataManagementScreen'
import { SeasonRecapScreen } from './screens/SeasonRecapScreen'
import { CompetitionScreen } from './screens/CompetitionScreen'
import { RecordsScreen } from './screens/RecordsScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { SquadImportScreen } from './screens/SquadImportScreen'
import { PlayStyleDetailScreen } from './screens/PlayStyleDetailScreen'
import { useStore } from './store'
import type { Tab, View } from './types'
import { seasonsFromMatches } from './engine/stats'
import { useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthEntryScreen } from './screens/AuthEntryScreen'
import { loadLastRoute, saveLastRoute } from './lib/lastRoute'
import { canUseApp, shouldRestoreLastRoute, startupScreen } from './lib/startup'
import { BootstrapShell, StartupRecovery } from './components/StartupBoundary'
import { emptyFilters, type RankingFilters } from './screens/RankingFilters'
import { popPlayerEditHistory } from './lib/playerNavigation'

export default function App() {
  const { user, loading, startupError, signInWithGoogle, retryStartup } = useAuth()
  const store = useStore()
  const { matches, competitionStates = [] } = store
  const completedNextSeasons = competitionStates.filter(state => state.kind === 'season-complete').map(state => `Season ${Number(state.season.match(/\d+/)?.[0] ?? 1) + 1}`)
  const seasons = [...new Set([...seasonsFromMatches(matches), ...competitionStates.map(state => state.season), ...completedNextSeasons])].sort((a, b) => Number(b.match(/\d+/)?.[0] ?? 0) - Number(a.match(/\d+/)?.[0] ?? 0))
  const [season, setSeason] = useState(seasons[0] ?? 'Season 1')
  const [history, setHistory] = useState<View[]>([{ name: 'home' }])
  const [playerFilters, setPlayerFilters] = useState<RankingFilters>(emptyFilters)
  const [localOnly, setLocalOnly] = useState(false)
  const [routeRestored, setRouteRestored] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef<Record<number, number>>({})
  const navigation = useRef<'forward' | 'back' | 'tab'>('forward')
  const view = history[history.length - 1]
  const startup = useMemo(
    () => ({ authLoading: loading, authError: startupError, isSupabaseConfigured, hasUser: Boolean(user), localOnly, routeRestored }),
    [loading, startupError, user, localOnly, routeRestored],
  )

  // StoreProvider only renders App after its local repository is ready. Waiting
  // for a resolved auth state prevents an old route from racing an OAuth return.
  useEffect(() => {
    if (!shouldRestoreLastRoute(startup)) return
    setHistory([loadLastRoute(store)])
    setRouteRestored(true)
  }, [startup, store])

  useEffect(() => {
    if (!routeRestored || loading || !canUseApp(startup)) return
    saveLastRoute(view, store.draftMatch)
  }, [routeRestored, loading, startup, view, store.draftMatch])

  // Logging out must not leave a previously authenticated in-memory route ready
  // to reappear after the next sign-in. Persistent route state is cleared by
  // AuthProvider; this clears the current React navigation stack as well.
  useEffect(() => {
    if (loading || !isSupabaseConfigured || user || localOnly || !routeRestored) return
    setHistory([{ name: 'home' }])
    setRouteRestored(false)
  }, [loading, user, localOnly, routeRestored])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const index = history.length - 1
    container.scrollTop = navigation.current === 'back' ? (scrollPositions.current[index] ?? 0) : 0
  }, [view, history.length])

  const tab: Tab = useMemo(() => {
    if (view.name === 'teams' || view.name === 'team' || view.name === 'import-squad' || view.name === 'new-match') {
      return 'teams'
    }
    if (view.name === 'players' || view.name === 'player' || view.name === 'new-player' || view.name === 'edit-player') {
      return 'players'
    }
    if (view.name === 'competition') return 'competition'
    if (view.name === 'records' || view.name === 'chemistry' || view.name === 'comparison') return 'records'
    return 'home'
  }, [view])

  function onTab(next: Tab) {
    navigation.current = 'tab'
    if (next === 'home') setHistory([{ name: 'home' }])
    if (next === 'teams') setHistory([{ name: 'teams' }])
    if (next === 'players') setHistory([{ name: 'players' }])
    if (next === 'competition') setHistory([{ name: 'competition' }])
    if (next === 'records') setHistory([{ name: 'records' }])
  }

  function onNavigate(next: View) {
    scrollPositions.current[history.length - 1] = scrollRef.current?.scrollTop ?? 0
    navigation.current = 'forward'
    setHistory((prev) => [...prev, next])
  }

  function onBack() {
    navigation.current = 'back'
    setHistory((prev) => prev.length > 1 ? prev.slice(0, -1) : [{ name: 'home' }])
  }

  function dismissPlayerEdit(playerId: string) {
    navigation.current = 'back'
    setHistory(prev => popPlayerEditHistory(prev, playerId))
  }

  const screen = startupScreen(startup)
  if (screen === 'loading') return <StartupLoading />
  if (screen === 'error') return <StartupError onRetry={retryStartup} />
  if (screen === 'auth-entry') return <AuthEntryScreen onSignIn={() => { void signInWithGoogle() }} onContinue={() => setLocalOnly(true)} />

  return (
    <div className="min-h-[100dvh] bg-zinc-950">
      <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-black text-white shadow-2xl">
        <div ref={scrollRef} className="app-content no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {view.name === 'home' && (
            <HomeScreen season={season} onSeason={setSeason} onNavigate={onNavigate} />
          )}
          {view.name === 'competition' && <CompetitionScreen season={view.season ?? season} initialType={view.competitionType ?? 'league'} onSeason={(nextSeason) => { setSeason(nextSeason); setHistory(previous => previous.map((item, index) => index === previous.length - 1 && item.name === 'competition' ? { ...item, season: nextSeason } : item)) }} onNavigate={onNavigate} />}
          {view.name === 'results' && <ResultsScreen onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'play-style' && <PlayStyleDetailScreen style={view.style} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'records' && <RecordsScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'standings' && <StandingsScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'season-recap' && <SeasonRecapScreen season={view.season} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'chemistry' && <ChemistryScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'comparison' && <ComparisonScreen season={season} onNavigate={onNavigate} />}

          {view.name === 'teams' && <TeamsScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'team' && <TeamDetailScreen teamId={view.id} season={season} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'import-squad' && <SquadImportScreen teamId={view.teamId} onBack={onBack} />}
          {view.name === 'players' && <PlayersScreen onNavigate={onNavigate} appliedFilters={playerFilters} onFiltersChange={setPlayerFilters} />}

          {view.name === 'player' && (
            <PlayerDetailScreen playerId={view.id} season={season} onNavigate={onNavigate} onBack={onBack} />
          )}
          {view.name === 'match' && <MatchDetailScreen matchId={view.id} onNavigate={onNavigate} />}
          {view.name === 'edit-match' && <EditMatchScreen matchId={view.id} onNavigate={onNavigate} />}
          {view.name === 'new-match' && (
            <NewMatchScreen teamId={view.teamId} requestedSeason={view.season} onNavigate={onNavigate} />
          )}
          {view.name === 'new-player' && (
            <NewPlayerScreen teamId={view.teamId} onNavigate={onNavigate} />
          )}
          {view.name === 'edit-player' && <EditPlayerScreen playerId={view.id} onNavigate={onNavigate} onDone={dismissPlayerEdit} />}
          {view.name === 'data-management' && <DataManagementScreen onNavigate={onNavigate} />}
          {/* Removed Reset demo data button */}
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
