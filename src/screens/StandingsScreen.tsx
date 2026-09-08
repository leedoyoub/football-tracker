import { StandingsTable } from '../components/StandingsTable'
import { seasonStandings } from '../engine/standings'
import { useStore } from '../store'
import type { View } from '../types'

export function StandingsScreen({ season, onNavigate }: { season: string; onNavigate: (view: View) => void }) {
  const { teams, matches } = useStore()
  const standings = seasonStandings(teams, matches, season)
  return <div className="px-4 pb-8 pt-6"><button type="button" onClick={() => onNavigate({ name: 'home' })} className="mb-3 text-xs font-semibold text-emerald-400">← Home</button><h1 className="text-2xl font-semibold">Standings</h1><p className="mb-4 text-xs text-zinc-400">{season}</p>{standings.length ? <StandingsTable standings={standings} teams={teams} compact onTeamNavigate={(id) => onNavigate({ name: 'team', id })} /> : <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">No teams available.</p>}</div>
}
