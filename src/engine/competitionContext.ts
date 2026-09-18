import type { CompetitionAssignmentSnapshot, CompetitionStage, CompetitionType, Match } from '../types'

const championsStageLabel: Record<string, string> = {
  roundOf16: 'Round of 16', quarterFinal: 'Quarter-final', semiFinal: 'Semi-final', final: 'Final', finalReplay: 'Final Replay',
}

export function freezeCompetitionAssignment(input: { competitionType: CompetitionType; season: string; teamId: string; stage: CompetitionStage; pairingId?: string; seriesGame?: number; opponentTeamId?: string; matchDay: number }): CompetitionAssignmentSnapshot {
  return { competitionType: input.competitionType, season: input.season, teamId: input.teamId, stage: input.stage, ...(input.pairingId ? { pairingId: input.pairingId } : {}), ...(input.seriesGame ? { seriesGame: input.seriesGame } : {}), ...(input.opponentTeamId ? { opponentTeamId: input.opponentTeamId } : {}), matchDay: input.matchDay }
}

/** Saved snapshots are authoritative; old records retain their established top-level identity. */
export function assignmentSnapshotForMatch(match: Match): CompetitionAssignmentSnapshot {
  if (match.competitionAssignment) return match.competitionAssignment
  return freezeCompetitionAssignment({ competitionType: match.competitionType ?? 'league', season: match.season, teamId: match.teamId ?? match.homeTeamId, stage: match.competitionStage ?? 'regular', pairingId: match.competitionPairingId, seriesGame: match.competitionSeriesGame, opponentTeamId: match.awayTeamId, matchDay: match.matchDay })
}

function cupLabel(stage: CompetitionStage): string {
  if (stage === 'final') return 'Final'
  if (stage === 'finalReplay') return 'Final Replay'
  return `Stage ${String(stage).replace('stage', '')}`
}

function championsRequiredGames(stage: CompetitionStage): number {
  return stage === 'final' ? 2 : 3
}

export function formatCompetitionContext(snapshot: CompetitionAssignmentSnapshot): string {
  if (snapshot.competitionType === 'league') return `${snapshot.season} · League · MD ${snapshot.matchDay}`
  if (snapshot.competitionType === 'cup') return `${snapshot.season} · Cup · ${cupLabel(snapshot.stage)}`
  const game = snapshot.seriesGame ? ` · Game ${snapshot.seriesGame}/${championsRequiredGames(snapshot.stage)}` : ''
  return `${snapshot.season} · Champions · ${championsStageLabel[snapshot.stage] ?? 'Round'}${game}`
}

/** Shared display parts keep compact headers from reconstructing tournament wording. */
export function competitionContextParts(snapshot: CompetitionAssignmentSnapshot): { primary: string; secondary: string } {
  if (snapshot.competitionType === 'league') return { primary: `${snapshot.season} · League`, secondary: `MD ${snapshot.matchDay}` }
  if (snapshot.competitionType === 'cup') return { primary: `${snapshot.season} · Cup`, secondary: cupLabel(snapshot.stage) }
  const game = snapshot.seriesGame ? ` · Game ${snapshot.seriesGame}/${championsRequiredGames(snapshot.stage)}` : ''
  return { primary: `${snapshot.season} · Champions`, secondary: `${championsStageLabel[snapshot.stage] ?? 'Round'}${game}` }
}

export function formatCompactCompetitionContext(snapshot: CompetitionAssignmentSnapshot): string {
  if (snapshot.competitionType === 'league') return `MD${snapshot.matchDay}`
  if (snapshot.competitionType === 'cup') return snapshot.stage === 'finalReplay' ? 'Final Replay' : snapshot.stage === 'final' ? 'Final' : `S${String(snapshot.stage).replace('stage', '')}`
  const stage = ({ roundOf16: 'R16', quarterFinal: 'QF', semiFinal: 'SF', final: 'Final', finalReplay: 'Final Replay' } as Record<string, string>)[snapshot.stage] ?? 'Champions'
  return snapshot.seriesGame ? `${stage} · G${snapshot.seriesGame}/${championsRequiredGames(snapshot.stage)}` : stage
}
