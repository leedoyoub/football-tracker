import { useEffect, useMemo } from 'react'
import { CompactFilterMenu } from './CompactFilterMenu'
import { ResultCard } from './ResultCard'
import { currentStaticTeams } from '../data/teams'
import { competitionResultIndex, competitionResults, type MatchFilters } from '../lib/competitionResults'
import { CHAMPIONS_MATCH_ROUNDS, CUP_TABLE_STAGES } from '../lib/competitionScreenState'
import { cupStageLabel } from '../lib/cupTable'
import { competitionIdentityForMatch } from '../engine/competitionContext'
import type { CompetitionType, CupStage, Match, Team, View } from '../types'

const roundLabels: Record<string, string> = { roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals', final: 'Final', finalReplay: 'Final Replay' }

export function CompetitionMatches({ matches, teams, season, type, filters, onFiltersChange, onNavigate }: { matches: Match[]; teams: Team[]; season: string; type: CompetitionType; filters: MatchFilters; onFiltersChange: (filters: MatchFilters) => void; onNavigate: (view: View) => void }) {
  const index = useMemo(() => competitionResultIndex(matches, teams, season, type), [matches, teams, season, type])
  const availableTeams = useMemo(() => {
    const ids = new Set(index.map(result => result.teamId))
    const catalog = currentStaticTeams(teams)
    const ordered = [...catalog, ...teams.filter(team => !catalog.some(item => item.id === team.id))]
    return ordered.filter(team => ids.has(team.id))
  }, [index, teams])
  const periods = useMemo(() => {
    if (type === 'league') return Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: `MD ${i + 1}` }))
    const replay = index.some(result => competitionIdentityForMatch(result.match).stage === 'finalReplay')
    return (type === 'cup' ? CUP_TABLE_STAGES : CHAMPIONS_MATCH_ROUNDS).filter(stage => stage !== 'finalReplay' || replay).map(stage => ({ value: stage as string, label: type === 'cup' ? cupStageLabel(stage as CupStage) : roundLabels[stage] }))
  }, [type, index])
  const teamId = filters.teamId && availableTeams.some(team => team.id === filters.teamId) ? filters.teamId : null
  const period = filters.period && periods.some(item => item.value === filters.period) ? filters.period : null
  useEffect(() => { if (teamId !== filters.teamId || period !== filters.period) onFiltersChange({ teamId, period }) }, [teamId, period, filters.teamId, filters.period, onFiltersChange])
  const rows = useMemo(() => competitionResults(matches, teams, season, type, { teamId, period }), [matches, teams, season, type, teamId, period])
  const allPeriods = type === 'league' ? 'All Matchdays' : type === 'cup' ? 'All Stages' : 'All Rounds'
  return <section className="mt-3" aria-label={`${type} recorded matches`}>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <CompactFilterMenu value={teamId ?? 'all'} label="Matches team" allValue="all" allLabel="All Teams" popupAlign="start" options={[{ value: 'all', label: 'All Teams' }, ...availableTeams.map(team => ({ value: team.id, label: team.name }))]} onChange={value => onFiltersChange({ teamId: value === 'all' ? null : value, period })} />
      <CompactFilterMenu value={period ?? 'all'} label={type === 'league' ? 'Matches matchday' : type === 'cup' ? 'Matches stage' : 'Matches round'} allValue="all" allLabel={allPeriods} options={[{ value: 'all', label: allPeriods }, ...periods]} onChange={value => onFiltersChange({ teamId, period: value === 'all' ? null : value })} />
    </div>
    <p className="mb-3 text-[10px] text-zinc-500">{season} · {rows.length} recorded {rows.length === 1 ? 'match' : 'matches'} · newest first</p>
    <div className="space-y-2">{rows.length ? rows.map(result => <ResultCard key={result.match.id} result={result} teams={teams} showCompetition onMatchNavigate={() => onNavigate({ name: 'match', id: result.match.id })} onTeamNavigate={id => onNavigate({ name: 'team', id })} />) : <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-500">No match results for these filters.</p>}</div>
  </section>
}
