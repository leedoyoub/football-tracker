import { useMemo, useState } from 'react'
import { TeamIcon } from '../components/TeamIcon'
import { compactTeamCompetitionProgressMap, competitionSeasonStatus } from '../engine/competition'
import { selectChampionsCompetition, selectCupCompetition, selectLeagueCompetition } from '../engine/competitionSelectors'
import { competitionRevision } from '../engine/competitionRevision'
import { currentStaticTeams } from '../data/teams'
import { drawRandomTeam } from '../lib/randomDraw'
import { useStore } from '../store'
import type { CompactTeamProgress } from '../engine/competition'
import type { Team, View } from '../types'

function TeamGridCard({ team, progress, showProgress, onNavigate }: { team: Team; progress?: CompactTeamProgress; showProgress: boolean; onNavigate: () => void }) {
  return <button type="button" onClick={onNavigate} aria-label={`Open ${team.name} team details`} className="flex min-w-0 aspect-[0.82] w-full flex-col items-center justify-center rounded-xl border border-white/10 bg-zinc-900 p-1.5 text-center transition-colors duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
    {showProgress && progress ? <div className="w-full">
      <div className="text-center text-[11px] font-black tracking-wide text-emerald-300 sm:text-xs">{team.abbreviation}</div>
      <dl className="mt-1 space-y-1 border-t border-white/10 pt-1 text-[9px] leading-tight sm:text-[10px]">
        <div className="flex items-center justify-between gap-1"><dt className="text-zinc-400">League</dt><dd className="min-w-0 text-right font-bold text-zinc-100">{progress.league}</dd></div>
        <div className="flex items-center justify-between gap-1"><dt className="text-zinc-400">Cup</dt><dd className="min-w-0 text-right font-bold text-zinc-100">{progress.cup}</dd></div>
        <div className="flex items-center justify-between gap-1"><dt className="text-zinc-400">UCL</dt><dd className="min-w-0 text-right font-bold text-zinc-100">{progress.champions}</dd></div>
      </dl>
    </div> : <>
      <TeamIcon team={team} className="mb-1 h-8 w-8 text-[8px] sm:h-10 sm:w-10" />
      <span className="line-clamp-2 max-w-full text-[10px] font-bold leading-tight text-zinc-100 sm:text-[11px]">{team.name}</span>
    </>}
  </button>
}

export function TeamsScreen({ season, onNavigate }: { season: string; onNavigate: (view: View) => void }) {
  const { teams, players, matches, competitionStates = [], competitionCacheOwner, competitionRevisions = {}, teamCatalogRevision = 0 } = useStore()
  const [drawn, setDrawn] = useState<Team | null>(null)
  const [showProgress, setShowProgress] = useState(false)
  // Catalog order is display-only; currentStaticTeams preserves every matched saved record.
  const catalogTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const draw = competitionStates.find(state => state.id === `champions:${season}`)
  const leagueRevision = competitionRevision(competitionRevisions, season, 'league')
  const cupRevision = competitionRevision(competitionRevisions, season, 'cup')
  const championsRevision = competitionRevision(competitionRevisions, season, 'champions')
  const status = useMemo(() => {
    if (!showProgress) return undefined
    if (!competitionCacheOwner) return competitionSeasonStatus(catalogTeams, matches, season, players, draw)
    const league = selectLeagueCompetition(competitionCacheOwner, catalogTeams, matches, season, leagueRevision, teamCatalogRevision, undefined, players, 'tournament')
    const cup = selectCupCompetition(competitionCacheOwner, catalogTeams, matches, season, cupRevision, teamCatalogRevision, players, undefined, 'tournament')
    const champions = selectChampionsCompetition(competitionCacheOwner, draw, matches, season, championsRevision, players)
    return { league, cup, champions, complete: league.complete && Boolean(cup.championId) && Boolean(champions.championId) }
  }, [showProgress, catalogTeams, matches, season, players, draw, competitionCacheOwner, leagueRevision, cupRevision, championsRevision, teamCatalogRevision])
  const progressByTeamId = useMemo(() => status ? compactTeamCompetitionProgressMap(catalogTeams.map(team => team.id), status) : undefined, [catalogTeams, status])

  return <div className="px-4 pb-8 pt-6">
    <div className="mb-4"><h1 className="text-2xl font-semibold">Teams</h1><p className="mt-1 text-xs text-zinc-500">Current progress · {season}</p></div>
    <section aria-label="Random Team controls" className="mb-4 rounded-xl border border-white/10 bg-zinc-900 p-2.5">
      <div className="flex items-center gap-2"><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Random Team</h2>{drawn && <div aria-live="polite" className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-emerald-300"><TeamIcon team={drawn} className="h-5 w-5 text-[7px]" /> <span className="truncate">{drawn.name}</span></div>}</div><button type="button" disabled={!catalogTeams.length} onClick={() => setDrawn(drawRandomTeam(catalogTeams))} className="min-h-11 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-black disabled:opacity-40">Draw</button><button type="button" aria-pressed={showProgress} aria-label={showProgress ? 'Show team logos and names' : 'Show competition progress'} onClick={() => setShowProgress(current => !current)} className="min-h-11 rounded-lg border border-white/15 bg-zinc-800 px-3 text-xs font-bold text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">{showProgress ? 'Teams' : 'Progress'}</button></div>
    </section>
    <section aria-label={showProgress ? 'Team competition progress' : 'Teams'} className="grid grid-cols-4 gap-2">
      {catalogTeams.map(team => {
        const progress = progressByTeamId?.get(team.id)
        return <TeamGridCard key={team.id} team={team} progress={progress} showProgress={showProgress} onNavigate={() => onNavigate({ name: 'team', id: team.id })} />
      })}
    </section>
  </div>
}
