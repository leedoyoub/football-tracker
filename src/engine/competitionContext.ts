import type { CompetitionAssignmentSnapshot, CompetitionStage, CompetitionType, Match } from '../types'

export type CompetitionIdentity = CompetitionAssignmentSnapshot

const cupStages = new Set<CompetitionStage>(['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'final', 'finalReplay'])
const championsStages = new Set<CompetitionStage>(['roundOf16', 'quarterFinal', 'semiFinal', 'final', 'finalReplay'])

const cupOrdinal = (stage: CompetitionStage) => {
  const match = /^stage([1-7])$/.exec(stage)
  if (match) return Number(match[1])
  if (stage === 'final') return 8
  if (stage === 'finalReplay') return 9
}

const championsOrdinal = (stage: CompetitionStage, seriesGame?: number) => {
  // Champions uses one cumulative per-team schedule. The legacy Final Replay
  // is a single extra fixture and intentionally has no seriesGame metadata.
  if (stage === 'finalReplay') return 12
  const format = stage === 'roundOf16' ? { offset: 0, required: 3 }
    : stage === 'quarterFinal' ? { offset: 3, required: 3 }
      : stage === 'semiFinal' ? { offset: 6, required: 3 }
        : stage === 'final' ? { offset: 9, required: 2 }
          : undefined
  return format && Number.isInteger(seriesGame) && seriesGame! >= 1 && seriesGame! <= format.required
    ? format.offset + seriesGame!
    : undefined
}

/** Competition-scoped schedule ordinal derived from the fixed format, never from chronology. */
export function canonicalScheduleOrdinal(type: CompetitionType, stage: CompetitionStage, seriesGame?: number): number | undefined {
  if (type === 'league') return undefined
  if (type === 'cup') return cupStages.has(stage) ? cupOrdinal(stage) : undefined
  return championsStages.has(stage) ? championsOrdinal(stage, seriesGame) : undefined
}

const championsStageLabel: Record<string, string> = {
  roundOf16: 'Round of 16', quarterFinal: 'Quarter-final', semiFinal: 'Semi-final', final: 'Final', finalReplay: 'Final Replay',
}

export function freezeCompetitionAssignment(input: { competitionType: CompetitionType; season: string; teamId: string; stage: CompetitionStage; pairingId?: string; seriesGame?: number; opponentTeamId?: string; matchDay: number }): CompetitionAssignmentSnapshot {
  return { competitionType: input.competitionType, season: input.season, teamId: input.teamId, stage: input.stage, ...(input.pairingId ? { pairingId: input.pairingId } : {}), ...(input.seriesGame ? { seriesGame: input.seriesGame } : {}), ...(input.opponentTeamId ? { opponentTeamId: input.opponentTeamId } : {}), matchDay: input.matchDay }
}

function validAssignment(snapshot: CompetitionAssignmentSnapshot, match: Match): boolean {
  if (!['league', 'cup', 'champions'].includes(snapshot.competitionType) || typeof snapshot.season !== 'string' || typeof snapshot.teamId !== 'string' || snapshot.season !== match.season || snapshot.teamId !== (match.teamId ?? match.homeTeamId) || !Number.isInteger(snapshot.matchDay) || snapshot.matchDay < 1) return false
  if (snapshot.competitionType === 'league') return snapshot.stage === 'regular' && snapshot.matchDay <= 30 && snapshot.pairingId === undefined && snapshot.seriesGame === undefined
  if (snapshot.competitionType === 'cup') return snapshot.seriesGame === undefined && snapshot.pairingId === undefined && cupStages.has(snapshot.stage) && canonicalScheduleOrdinal('cup', snapshot.stage) === snapshot.matchDay
  if (!championsStages.has(snapshot.stage) || !snapshot.pairingId) return false
  const ordinal = canonicalScheduleOrdinal(snapshot.competitionType, snapshot.stage, snapshot.seriesGame)
  return ordinal !== undefined && ordinal === snapshot.matchDay
}

function legacyIdentity(match: Match): CompetitionIdentity {
  const competitionType = match.competitionType ?? 'league'
  const stage = match.competitionStage ?? 'regular'
  const derived = canonicalScheduleOrdinal(competitionType, stage, match.competitionSeriesGame)
  // Pair and series fields are not generic Match metadata: carrying them
  // from a previous tournament into a League identity recreates split-brain
  // data after an otherwise safe normalization.
  return freezeCompetitionAssignment({ competitionType, season: match.season, teamId: match.teamId ?? match.homeTeamId, stage, ...(competitionType === 'champions' ? { pairingId: match.competitionPairingId, seriesGame: match.competitionSeriesGame } : {}), opponentTeamId: match.awayTeamId, matchDay: derived ?? match.matchDay })
}

/** Prefer a snapshot only when it matches the fixed competition format. */
export function competitionIdentityForMatch(match: Match): CompetitionIdentity {
  return match.competitionAssignment && validAssignment(match.competitionAssignment, match) ? match.competitionAssignment : legacyIdentity(match)
}

export function matchCompetitionType(match: Match): CompetitionType {
  return competitionIdentityForMatch(match).competitionType
}

export function matchCompetitionStage(match: Match): CompetitionStage {
  return competitionIdentityForMatch(match).stage
}

/**
 * Save-time guard: the persisted record must agree with the active assignment
 * both in legacy top-level fields and in the frozen snapshot. Do not use the
 * canonical reader here: a valid snapshot may otherwise conceal split-brain
 * top-level metadata.
 */
export function matchesCompetitionAssignmentExactly(match: Match, assignment: CompetitionIdentity): boolean {
  const snapshot = match.competitionAssignment
  const sameSnapshot = Boolean(snapshot)
    && snapshot!.competitionType === assignment.competitionType
    && snapshot!.season === assignment.season
    && snapshot!.teamId === assignment.teamId
    && snapshot!.stage === assignment.stage
    && snapshot!.matchDay === assignment.matchDay
    && snapshot!.pairingId === assignment.pairingId
    && snapshot!.seriesGame === assignment.seriesGame
    && snapshot!.opponentTeamId === assignment.opponentTeamId
  return sameSnapshot
    && match.competitionType === assignment.competitionType
    && match.season === assignment.season
    && match.teamId === assignment.teamId
    && match.competitionStage === assignment.stage
    && match.matchDay === assignment.matchDay
    && match.competitionPairingId === assignment.pairingId
    && match.competitionSeriesGame === assignment.seriesGame
    && (assignment.opponentTeamId === undefined || match.awayTeamId === assignment.opponentTeamId)
}

/** Metadata-only, idempotent synchronization for unambiguous identities. */
export function normalizeMatchCompetitionIdentity(match: Match): Match {
  const identity = competitionIdentityForMatch(match)
  const sameTopLevel = match.competitionType === identity.competitionType && match.competitionStage === identity.stage && match.competitionPairingId === identity.pairingId && match.competitionSeriesGame === identity.seriesGame && match.matchDay === identity.matchDay && match.awayTeamId === (identity.opponentTeamId ?? match.awayTeamId)
  const sameSnapshot = match.competitionAssignment && JSON.stringify(match.competitionAssignment) === JSON.stringify(identity)
  if (sameTopLevel && sameSnapshot) return match
  // Omit stale optional tournament fields rather than allowing a previous
  // competition selection to survive beside the canonical identity.
  const { competitionPairingId: _pairing, competitionSeriesGame: _seriesGame, ...base } = match
  return { ...base, competitionType: identity.competitionType, competitionStage: identity.stage, ...(identity.pairingId ? { competitionPairingId: identity.pairingId } : {}), ...(identity.seriesGame ? { competitionSeriesGame: identity.seriesGame } : {}), matchDay: identity.matchDay, ...(identity.opponentTeamId ? { awayTeamId: identity.opponentTeamId } : {}), competitionAssignment: identity }
}

/** Compatibility name for consumers that need the normalized read snapshot. */
export function assignmentSnapshotForMatch(match: Match): CompetitionAssignmentSnapshot {
  return competitionIdentityForMatch(match)
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
