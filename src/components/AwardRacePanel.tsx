import { useState } from 'react'
import { RankingRow } from './RankingRow'
import { awardRaceCandidates } from '../engine/awardRacePresentation'
import type { AwardCandidate } from '../engine/awardRules'
import type { CompetitionType, Player, Team, View } from '../types'

export function AwardRacePanel({ candidates: rawCandidates, title, previewCount, expandable = false, season, type, players, teams, onNavigate }: {
  candidates: AwardCandidate[]
  title: string
  previewCount: number
  expandable?: boolean
  season: string
  type: CompetitionType | 'all'
  players: Player[]
  teams: Team[]
  onNavigate: (view: View) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const candidates = awardRaceCandidates(rawCandidates)
  const visible = showAll && expandable ? candidates : candidates.slice(0, previewCount)
  const byPlayer = new Map(players.map(player => [player.id, player]))
  const byTeam = new Map(teams.map(team => [team.id, team]))
  return <section className="mt-7"><h2 className="text-lg font-semibold">{title}</h2><p className="mb-3 text-xs text-zinc-500">Avg Rating shown · ranked by Award Score · official 40% eligibility</p>{visible.length ? <><div className="overflow-hidden rounded-xl bg-zinc-900">{visible.map((candidate, index) => <div key={candidate.playerId} className="border-b border-white/5 last:border-0"><RankingRow rank={index + 1} compact player={byPlayer.get(candidate.playerId)} team={byTeam.get(candidate.teamId)} positionLabel={candidate.family} value={candidate.average.toFixed(2)} onPlayerNavigate={id => onNavigate({ name: 'player', id, season, competitionType: type })} onTeamNavigate={id => onNavigate({ name: 'team', id })} /></div>)}</div>{expandable && candidates.length > previewCount && <button type="button" onClick={() => setShowAll(value => !value)} className="secondary-view-all mt-3 w-full">{showAll ? `Show Top ${previewCount}` : 'View All'}</button>}</> : <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">Race begins after more matches are played.</p>}</section>
}
