import { useMemo, useState } from 'react'
import { BottomNav } from './components/BottomNav'
import { HomeScreen } from './screens/HomeScreen'
import { MatchDetailScreen } from './screens/MatchDetailScreen'
import { NewMatchScreen } from './screens/NewMatchScreen'
import { NewPlayerScreen } from './screens/NewPlayerScreen'
import { NewTeamScreen } from './screens/NewTeamScreen'
import { EditTeamScreen } from './screens/EditTeamScreen'
import { EditPlayerScreen } from './screens/EditPlayerScreen'
import { EditMatchScreen } from './screens/EditMatchScreen'
import { PlayerDetailScreen } from './screens/PlayerDetailScreen'
import { PlayersScreen } from './screens/PlayersScreen'
import { RankingsScreen } from './screens/RankingsScreen'
import { TeamDetailScreen } from './screens/TeamDetailScreen'
import { TeamsScreen } from './screens/TeamsScreen'
import { DataManagementScreen } from './screens/DataManagementScreen'
import { useStore } from './store'
import type { Tab, View } from './types'
import { seasonsFromMatches } from './engine/stats'

export default function App() {
  const { matches } = useStore()
  const seasons = seasonsFromMatches(matches)
  const [season, setSeason] = useState(seasons[0] ?? 'Season 1')
  const [history, setHistory] = useState<View[]>([{ name: 'home' }])
  const view = history[history.length - 1]

  const tab: Tab = useMemo(() => {
    if (view.name === 'teams' || view.name === 'team' || view.name === 'new-team' || view.name === 'edit-team' || view.name === 'new-match') {
      return 'teams'
    }
    if (view.name === 'players' || view.name === 'player' || view.name === 'new-player' || view.name === 'edit-player') {
      return 'players'
    }
    return 'home'
  }, [view])

  function onTab(next: Tab) {
    if (next === 'home') setHistory([{ name: 'home' }])
    if (next === 'teams') setHistory([{ name: 'teams' }])
    if (next === 'players') setHistory([{ name: 'players' }])
  }

  function onNavigate(next: View) {
    setHistory((prev) => [...prev, next])
  }

  function onBack() {
    setHistory((prev) => prev.slice(0, -1))
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950">
      <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-black text-white shadow-2xl">
        <div className="no-scrollbar flex-1 overflow-y-auto">
          {view.name === 'home' && (
            <HomeScreen season={season} onSeason={setSeason} onNavigate={onNavigate} />
          )}
          {view.name === 'rankings' && (
            <RankingsScreen
              onNavigate={onNavigate}
            />
          )}

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
          {view.name === 'new-team' && <NewTeamScreen onNavigate={onNavigate} />}
          {view.name === 'edit-team' && <EditTeamScreen teamId={view.id} onNavigate={onNavigate} />}
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
