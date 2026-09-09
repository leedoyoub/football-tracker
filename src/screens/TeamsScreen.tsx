import { useMemo, useState } from 'react'
import { TeamIcon } from '../components/TeamIcon'
import { competitionHistory, competitionSeasonStatus, type ChampionsPairing } from '../engine/competition'
import { currentStaticTeams } from '../data/teams'
import { drawRandomTeam } from '../lib/randomDraw'
import { useStore } from '../store'
import type { ChampionsStage, Team, View } from '../types'

export function TeamsScreen({ season, onNavigate }: { season: string; onNavigate: (view: View) => void }) {
  const { teams, players, matches, competitionStates = [] } = useStore()
  const [drawn, setDrawn] = useState<Team | null>(null)
  const catalogTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const draw = competitionStates.find(state => state.id === `champions:${season}`)
  const status = useMemo(() => competitionSeasonStatus(catalogTeams, matches, season, players, draw), [catalogTeams, matches, season, players, draw])
  const history = useMemo(() => competitionHistory(catalogTeams, matches, players, competitionStates), [catalogTeams, matches, players, competitionStates])
  const titleCounts = useMemo(() => {
    const result = new Map<string, { league: number; cup: number; champions: number }>()
    for (const entry of history) for (const type of ['league', 'cup', 'champions'] as const) if (entry[type]) {
      const row = result.get(entry[type]!) ?? { league: 0, cup: 0, champions: 0 }; row[type]++; result.set(entry[type]!, row)
    }
    return result
  }, [history])
  const labels: Record<string, string> = { roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals', final: 'Final', finalReplay: 'Final Replay' }
  const progressFor = (teamId: string) => {
    const leaguePlayed = status.league.standings.find(row => row.teamId === teamId)?.played ?? 0
    const cup = status.cup
    const cupLabel = cup.championId === teamId ? 'Winner' : cup.eliminatedAtByTeam[teamId] ? `Eliminated S${cup.eliminatedAtByTeam[teamId]}` : cup.stage === 'final' || cup.stage === 'finalReplay' ? labels[cup.stage] : cup.stageMatches.length || cup.eliminatedTeamIds.length ? `Stage ${cup.stage.replace('stage', '')}` : 'Not Started'
    const champions = status.champions
    let championsLabel = 'Not Started'
    if (champions.drawn) {
      if (champions.championId === teamId) championsLabel = 'Winner'
      else {
        const loss = (Object.entries(champions.rounds) as [Exclude<ChampionsStage, 'finalReplay'>, ChampionsPairing[]][]).find(([, pairs]) => pairs.some(pair => pair.teamIds.includes(teamId) && pair.winnerId && pair.winnerId !== teamId))
        const short: Record<string, string> = { roundOf16: 'R16', quarterFinal: 'QF', semiFinal: 'SF', final: 'Final' }
        championsLabel = loss ? `Eliminated ${short[loss[0]]}` : labels[champions.currentStage]
      }
    }
    return { league: `${leaguePlayed} / 38`, cup: cupLabel, champions: championsLabel }
  }
  const badges = (teamId: string) => { const count = titleCounts.get(teamId); if (!count) return null; return <span aria-label={`${count.league} League titles, ${count.cup} Cup titles, ${count.champions} Champions titles`} className="ml-1 inline-flex gap-1 text-[11px]">{count.league > 0 && <span>👑{count.league > 1 ? `×${count.league}` : ''}</span>}{count.cup > 0 && <span>🥇{count.cup > 1 ? `×${count.cup}` : ''}</span>}{count.champions > 0 && <span>🏆{count.champions > 1 ? `×${count.champions}` : ''}</span>}</span> }

  return <div className="px-4 pb-8 pt-6">
    <div className="mb-5"><h1 className="text-2xl font-semibold">Teams</h1><p className="mt-1 text-xs text-zinc-500">Current progress · {season}</p></div>
    <section className="mb-5 rounded-xl border border-white/10 bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Random Team</h2><div className="mt-2"><button type="button" disabled={!catalogTeams.length} onClick={() => setDrawn(drawRandomTeam(catalogTeams))} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black disabled:opacity-40">Draw</button></div>{drawn && <div aria-live="polite" className="mt-3 flex items-center gap-3 rounded-lg bg-black/50 p-3"><TeamIcon team={drawn} className="h-16 w-16 text-lg font-black" /><span className="text-sm font-bold text-emerald-300">{drawn.name}</span></div>}</section>
    <div className="space-y-3">{teams.map(team => { const squad = players.filter(player => (player.teamIds ?? [player.teamId]).includes(team.id)).length; const progress = progressFor(team.id); return <button key={team.id} type="button" onClick={() => onNavigate({ name: 'team', id: team.id })} className="flex w-full items-center gap-3 rounded-2xl bg-zinc-900 p-3 text-left"><TeamIcon team={team} className="h-12 w-12 text-sm font-black" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{team.name}{badges(team.id)}</span><span className="mt-0.5 block text-[10px] text-zinc-400">{squad} players</span><span className="mt-1 block text-[9px] leading-relaxed text-zinc-500">League {progress.league}<br />Cup · {progress.cup}<br />Champions · {progress.champions}</span></span><span className="text-zinc-500">›</span></button>})}</div>
  </div>
}
