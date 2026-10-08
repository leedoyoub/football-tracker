import { useMemo } from 'react'
import { CompetitionScopeSelector } from '../components/CompetitionScopeSelector'
import { CompactFilterMenu } from '../components/CompactFilterMenu'
import { PositionFilter } from '../components/PositionFilter'
import { TeamFilter } from '../components/TeamFilter'
import { FloatingScrollToTop } from '../components/FloatingScrollToTop'
import { AwardRaceRows } from '../components/AwardRacePanel'
import { awardRacePresentationRows } from '../engine/awardRacePresentation'
import { awardsForCompetition, seasonAwards } from '../engine/awards'
import { competitionSeasonStatus } from '../engine/competition'
import { seasonsFromMatches } from '../engine/stats'
import { currentStaticTeams } from '../data/teams'
import { useStore } from '../store'
import type { CompetitionType, ScreenStateByView, View } from '../types'

export function AwardRaceScreen({ screenState, onStateChange, onNavigate, onBack }: {
  screenState: ScreenStateByView['award-race']
  onStateChange: (state: ScreenStateByView['award-race']) => void
  onNavigate: (view: View) => void
  onBack: () => void
}) {
  const { players, teams, matches, competitionStates = [] } = useStore()
  const seasons = useMemo(() => [...new Set([...seasonsFromMatches(matches), ...competitionStates.map(state => state.season)])].sort((a, b) => Number(b.match(/\d+/)?.[0] ?? 0) - Number(a.match(/\d+/)?.[0] ?? 0)), [matches, competitionStates])
  const season = screenState.season && seasons.includes(screenState.season) ? screenState.season : seasons[0] ?? 'Season 1'
  const scope = screenState.scope
  const tournamentTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const awardTeams = scope === 'cup' || scope === 'champions' ? tournamentTeams : teams
  const candidates = useMemo(() => scope === 'all' ? seasonAwards(season, teams, players, matches, competitionStates).candidates ?? [] : awardsForCompetition(scope, season, awardTeams, players, matches, competitionStates).candidates ?? [], [scope, season, teams, awardTeams, players, matches, competitionStates])
  const rows = useMemo(() => awardRacePresentationRows(candidates, players, matches, season, scope, screenState.positionFilter, screenState.teamId), [candidates, players, matches, season, scope, screenState.positionFilter, screenState.teamId])
  const status = useMemo(() => competitionSeasonStatus(awardTeams, matches, season, players, competitionStates.find(state => state.kind === 'champions-draw' && state.season === season)), [awardTeams, matches, season, players, competitionStates])
  const patch = (next: Partial<ScreenStateByView['award-race']>) => onStateChange({ ...screenState, ...next })
  const sectionId = 'award-race-leaderboard'
  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 min-h-9 px-1 text-xs font-semibold text-emerald-400">← Back</button>
    <div id={sectionId} className="mb-3 flex items-center justify-between gap-2"><div><h1 className="text-2xl font-semibold">Award Race</h1><p className="text-[10px] text-zinc-500">{season}</p></div><CompetitionScopeSelector value={scope} onChange={value => patch({ scope: value as CompetitionType | 'all' })} /></div>
    <div className="mb-3 flex flex-wrap justify-end gap-2"><CompactFilterMenu value={season} options={seasons.map(value => ({ value, label: value }))} onChange={value => patch({ season: value })} label="Award Race season" popupAlign="start" /><PositionFilter value={screenState.positionFilter} onChange={positionFilter => patch({ positionFilter })} label="Award Race position" allLabel="Position" allAccessibilityLabel="All positions" /><TeamFilter value={screenState.teamId} teams={teams} onChange={teamId => patch({ teamId })} label="Award Race team" /></div>
    <p className="mb-3 text-xs text-zinc-500">Avg Rating shown · ranked by Award Score · official 40% eligibility</p>
    {rows.length > 10 && <FloatingScrollToTop sectionId={sectionId} />}
    {rows.length ? <AwardRaceRows rows={rows} season={season} type={scope} players={players} teams={teams} status={status} onNavigate={onNavigate} /> : <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">Race begins after more matches are played.</p>}
  </div>
}
