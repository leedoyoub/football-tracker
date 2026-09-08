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
import { RankingsScreen } from './screens/RankingsScreen'
import { StandingsScreen } from './screens/StandingsScreen'
import { ChemistryScreen } from './screens/ChemistryScreen'
import { ComparisonScreen } from './screens/ComparisonScreen'
import { TeamDetailScreen } from './screens/TeamDetailScreen'
import { TeamsScreen } from './screens/TeamsScreen'
import { DataManagementScreen } from './screens/DataManagementScreen'
import { SeasonRecapScreen } from './screens/SeasonRecapScreen'
import { NewsScreen } from './screens/NewsScreen'
import { RecordsScreen } from './screens/RecordsScreen'
import { useStore } from './store'
import type { Tab, View } from './types'
import { seasonsFromMatches } from './engine/stats'
import { useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthEntryScreen } from './screens/AuthEntryScreen'

export default function App() {
  const { user, loading, signInWithGoogle } = useAuth()
  const { matches } = useStore()
  const seasons = seasonsFromMatches(matches)
  const [season, setSeason] = useState(seasons[0] ?? 'Season 1')
  const [history, setHistory] = useState<View[]>([{ name: 'home' }])
  const [localOnly, setLocalOnly] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef<Record<number, number>>({})
  const navigation = useRef<'forward' | 'back' | 'tab'>('forward')
  const view = history[history.length - 1]

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const index = history.length - 1
    container.scrollTop = navigation.current === 'back' ? (scrollPositions.current[index] ?? 0) : 0
  }, [view, history.length])

  const tab: Tab = useMemo(() => {
    if (view.name === 'teams' || view.name === 'team' || view.name === 'new-match') {
      return 'teams'
    }
    if (view.name === 'players' || view.name === 'player' || view.name === 'new-player' || view.name === 'edit-player') {
      return 'players'
    }
    if (view.name === 'news') return 'news'
    if (view.name === 'records' || view.name === 'chemistry' || view.name === 'comparison') return 'records'
    return 'home'
  }, [view])

  function onTab(next: Tab) {
    navigation.current = 'tab'
    if (next === 'home') setHistory([{ name: 'home' }])
    if (next === 'teams') setHistory([{ name: 'teams' }])
    if (next === 'players') setHistory([{ name: 'players' }])
    if (next === 'news') setHistory([{ name: 'news' }])
    if (next === 'records') setHistory([{ name: 'records' }])
  }

  function onNavigate(next: View) {
    scrollPositions.current[history.length - 1] = scrollRef.current?.scrollTop ?? 0
    navigation.current = 'forward'
    setHistory((prev) => [...prev, next])
  }

  function onBack() {
    navigation.current = 'back'
    setHistory((prev) => prev.slice(0, -1))
  }

  if (isSupabaseConfigured && loading) return <div className="min-h-[100dvh] bg-zinc-950" />
  if (isSupabaseConfigured && !user && !localOnly) return <AuthEntryScreen onSignIn={() => { void signInWithGoogle() }} onContinue={() => setLocalOnly(true)} />

  return (
    <div className="min-h-[100dvh] bg-zinc-950">
      <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-black text-white shadow-2xl">
        <div ref={scrollRef} className="app-content no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {view.name === 'home' && (
            <HomeScreen season={season} onSeason={setSeason} onNavigate={onNavigate} />
          )}
          {view.name === 'news' && <NewsScreen season={season} kind={view.kind} onNavigate={onNavigate} />}
          {view.name === 'records' && <RecordsScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'rankings' && (
            <RankingsScreen
              onNavigate={onNavigate}
            />
          )}
          {view.name === 'standings' && <StandingsScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'season-recap' && <SeasonRecapScreen season={view.season} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'chemistry' && <ChemistryScreen season={season} onNavigate={onNavigate} />}
          {view.name === 'comparison' && <ComparisonScreen season={season} onNavigate={onNavigate} />}

          {view.name === 'teams' && <TeamsScreen onNavigate={onNavigate} />}
          {view.name === 'team' && <TeamDetailScreen teamId={view.id} season={season} onNavigate={onNavigate} onBack={onBack} />}
          {view.name === 'players' && <PlayersScreen onNavigate={onNavigate} />}

          {view.name === 'player' && (
            <PlayerDetailScreen playerId={view.id} season={season} onNavigate={onNavigate} onBack={onBack} />
          )}
          {view.name === 'match' && <MatchDetailScreen matchId={view.id} onNavigate={onNavigate} />}
          {view.name === 'edit-match' && <EditMatchScreen matchId={view.id} onNavigate={onNavigate} />}
          {view.name === 'new-match' && (
            <NewMatchScreen teamId={view.teamId} onNavigate={onNavigate} />
          )}
          {view.name === 'new-player' && (
            <NewPlayerScreen teamId={view.teamId} onNavigate={onNavigate} />
          )}
          {view.name === 'edit-player' && <EditPlayerScreen playerId={view.id} onNavigate={onNavigate} />}
          {view.name === 'data-management' && <DataManagementScreen onNavigate={onNavigate} />}
          {/* Removed Reset demo data button */}
        </div>
        <BottomNav tab={tab} onChange={onTab} />
      </div>
    </div>
  )
}
