import { useMemo } from 'react'
import { ResultCard } from '../components/ResultCard'
import { TeamIcon } from '../components/TeamIcon'
import { formatPlayStyleAverage, formatPlayStylePercentage, trackedStyleMatches, trackedStyleTeams, trackedTeamId, trackedTeamPlayStylePerformance, trackedTeamResult } from '../engine/playStyleStats'
import { recentMatches } from './recentMatches'
import { derivedResults } from '../lib/results'
import { useStore } from '../store'
import type { TeamPlayStyle, View } from '../types'

const labels: Record<TeamPlayStyle, string> = { possession: 'Possession', 'short-pass-counter': 'Short-Pass Counter', 'long-pass-counter': 'Long-Pass Counter' }

export function PlayStyleDetailScreen({ style, onNavigate, onBack }: { style: TeamPlayStyle; onNavigate: (view: View) => void; onBack: () => void }) {
  const { matches, teams } = useStore()
  const summary = useMemo(() => trackedTeamPlayStylePerformance(matches, teams).find(row => row.style === style)!, [matches, teams, style])
  const teamRows = useMemo(() => trackedStyleTeams(teams, style).map(team => {
    const games = trackedStyleMatches(matches, teams, style).filter(match => trackedTeamId(match, teams) === team.id)
    const totals = games.reduce((value, match) => { value[trackedTeamResult(match, team.id).outcome]++; return value }, { W: 0, D: 0, L: 0 })
    return { team, games: games.length, ...totals }
  }).filter(row => row.games).sort((a, b) => b.games - a.games || b.W - a.W || a.team.name.localeCompare(b.team.name)), [matches, teams, style])
  const recent = useMemo(() => recentMatches(trackedStyleMatches(matches, teams, style)).slice(0, 10), [matches, teams, style])
  const results = useMemo(() => derivedResults(recent, teams), [recent, teams])
  return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button><h1 className="text-2xl font-semibold">{labels[style]}</h1><p className="mt-1 text-xs text-zinc-400">Performance by recorded team play style</p><section className="mt-5 rounded-2xl bg-zinc-900 p-3 text-xs"><div className="grid grid-cols-3 gap-2 text-center"><b className="text-emerald-400">W {formatPlayStylePercentage(summary.winPercentage)}</b><b className="text-yellow-300">D {formatPlayStylePercentage(summary.drawPercentage)}</b><b className="text-red-400">L {formatPlayStylePercentage(summary.lossPercentage)}</b></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-center"><span>GF <b>{formatPlayStyleAverage(summary.averageGoalsFor)}</b></span><span>GA <b>{formatPlayStyleAverage(summary.averageGoalsAgainst)}</b></span></div></section><section className="mt-5"><h2 className="mb-2 text-sm font-semibold">Team W-D-L</h2>{teamRows.length ? <div className="space-y-2">{teamRows.map(row => <div key={row.team.id} className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3 text-xs"><TeamIcon team={row.team} className="h-8 w-8 text-[8px]" /><b className="min-w-0 flex-1 truncate">{row.team.name}</b><span className="text-emerald-400">W {row.W}</span><span className="text-yellow-300">D {row.D}</span><span className="text-red-400">L {row.L}</span></div>)}</div> : <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No recorded matches yet.</p>}</section><section className="mt-5"><h2 className="mb-2 text-sm font-semibold">Recent Matches</h2>{results.length ? <div className="space-y-2">{results.map(result => <ResultCard key={result.match.id} result={result} teams={teams} showCompetition onClick={() => onNavigate({ name: 'match', id: result.match.id })} />)}</div> : <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No recorded matches yet.</p>}</section></div>
}
