import { useMemo } from 'react'
import { RankingRow } from './RankingRow'
import { awardRacePresentationRows, awardTeamPerformanceLabel, type AwardRacePresentationRow } from '../engine/awardRacePresentation'
import { competitionSeasonStatus, type CompetitionSeasonStatus } from '../engine/competition'
import type { AwardCandidate } from '../engine/awardRules'
import type { CompetitionState, CompetitionType, Match, Player, Team, View } from '../types'

export function AwardRaceRows({ rows, season, type, players, teams, status, onNavigate }: {
  rows: AwardRacePresentationRow[]
  season: string
  type: CompetitionType | 'all'
  players: Player[]
  teams: Team[]
  status?: CompetitionSeasonStatus | null
  onNavigate: (view: View) => void
}) {
  const byPlayer = new Map(players.map(player => [player.id, player]))
  const byTeam = new Map(teams.map(team => [team.id, team]))
  return <div className="overflow-hidden rounded-xl bg-zinc-900">{rows.map(({ candidate, rank, position }) => <div key={candidate.playerId} className="border-b border-white/5 last:border-0"><RankingRow rank={rank} rankPrefix="#" compact player={byPlayer.get(candidate.playerId)} team={byTeam.get(candidate.teamId)} positionLabel={position} detail={status ? awardTeamPerformanceLabel(status, candidate.teamId, type) : undefined} value={candidate.average.toFixed(2)} onPlayerNavigate={id => onNavigate({ name: 'player', id, season, competitionType: type })} onTeamNavigate={id => onNavigate({ name: 'team', id })} /></div>)}</div>
}

export function AwardRacePanel({ candidates, title, previewCount, season, type, players, teams, matches = [], competitionStates = [], onNavigate }: {
  candidates: AwardCandidate[]
  title: string
  previewCount: number
  season: string
  type: CompetitionType | 'all'
  players: Player[]
  teams: Team[]
  matches?: Match[]
  competitionStates?: CompetitionState[]
  onNavigate: (view: View) => void
}) {
  const rows = useMemo(() => awardRacePresentationRows(candidates, players, matches, season, type), [candidates, players, matches, season, type])
  const status = useMemo(() => matches.length ? competitionSeasonStatus(teams, matches, season, players, competitionStates.find(state => state.kind === 'champions-draw' && state.season === season)) : null, [teams, matches, season, players, competitionStates])
  const visible = rows.slice(0, previewCount)
  return <section className="mt-7"><h2 className="text-lg font-semibold">{title}</h2><p className="mb-3 text-xs text-zinc-500">Avg Rating shown · ranked by Award Score · official 40% eligibility</p>{visible.length ? <><AwardRaceRows rows={visible} season={season} type={type} players={players} teams={teams} status={status} onNavigate={onNavigate} />{rows.length > previewCount && <button type="button" onClick={() => onNavigate({ name: 'award-race', season, competitionType: type })} className="secondary-view-all mt-3 w-full">View All</button>}</> : <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">Race begins after more matches are played.</p>}</section>
}
