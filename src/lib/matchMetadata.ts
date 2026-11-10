import type { AppState, CompetitionAssignmentSnapshot, CompetitionStage, CompetitionType, Match } from '../types'
import { canonicalScheduleOrdinal, competitionIdentityForMatch, freezeCompetitionAssignment, matchesCompetitionAssignmentExactly } from '../engine/competitionContext'
import { championsCompetition, competitionAssignment, cupCompetition, type CompetitionMutationSafety } from '../engine/competition'
import { isRecordedForTeam, recordedOpponentId, recordedTeamId, teamsCreditedWithResult } from '../engine/matchPerspective'
import { firstMissingLeagueSlot, leagueSlotCounts } from '../engine/leagueSlots'
import { sameRawFootballValue } from '../engine/competitionRevision'
import { currentStaticTeams } from '../data/teams'

export type MatchMetadataProposal = {
  assignment: CompetitionAssignmentSnapshot
  date: string
  opponentName?: string
  homeAway?: 'home' | 'away'
}
type MetadataState = Pick<AppState, 'matches' | 'teams' | 'players' | 'competitionStates'>
const cupStages: CompetitionStage[] = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'final', 'finalReplay']
const championsStages: CompetitionStage[] = ['roundOf16', 'quarterFinal', 'semiFinal', 'final', 'finalReplay']
const fail = (message: string): CompetitionMutationSafety => ({ safe: false, message })

function sameSlot(left: Match, right: Match): boolean {
  return sameRawFootballValue(competitionIdentityForMatch(left), competitionIdentityForMatch(right))
}

const representations = (match: Match) => ({ season: match.season, competitionType: match.competitionType, competitionStage: match.competitionStage, competitionPairingId: match.competitionPairingId, competitionSeriesGame: match.competitionSeriesGame, competitionAssignment: match.competitionAssignment, matchDay: match.matchDay })

/** A slot is checked using only its prerequisites. Later rows must never make
 * a historical insertion look available by advancing the current tournament. */
function slotError(data: MetadataState, match: Match): string | undefined {
  const identity = competitionIdentityForMatch(match)
  const { competitionType: type, stage, season, teamId, matchDay, pairingId, seriesGame } = identity
  const others = data.matches.filter(row => row.id !== match.id)
  const scope = others.filter(row => row.season === season && competitionIdentityForMatch(row).competitionType === type)
  const registered = new Set(data.teams.map(team => team.id))
  const credited = teamsCreditedWithResult(match).filter(id => id === teamId || registered.has(id))
  const overlapsCreditedTeam = (row: Match) => teamsCreditedWithResult(row).some(id => credited.includes(id))
  if (type === 'league') {
    if (stage !== 'regular' || !Number.isInteger(matchDay) || matchDay < 1 || matchDay > 30 || pairingId || seriesGame) return 'League slot must be MD 1–30 without tournament fields.'
    if (scope.some(row => overlapsCreditedTeam(row) && competitionIdentityForMatch(row).matchDay === matchDay)) return 'That League matchday is already occupied for a credited team (duplicate slot).'
    return
  }
  const stages = type === 'cup' ? cupStages : championsStages
  const order = stages.indexOf(stage)
  if (order < 0 || canonicalScheduleOrdinal(type, stage, seriesGame) !== matchDay) return 'The target stage, series game or schedule slot is invalid.'
  const prior = scope.filter(row => stages.indexOf(competitionIdentityForMatch(row).stage) < order)
  if (type === 'cup') {
    if (pairingId || seriesGame) return 'Cup slots cannot contain Champions pairing or series fields.'
    if (scope.some(row => competitionIdentityForMatch(row).stage === stage && overlapsCreditedTeam(row))) return 'That Cup stage is already occupied for a credited team (duplicate slot).'
    const cup = cupCompetition(currentStaticTeams(data.teams), prior, season, data.players)
    if (cup.stage !== stage || !cup.activeTeamIds.includes(teamId) || credited.some(id => !cup.activeTeamIds.includes(id)) || cup.championId) return 'The Cup stage is unavailable: prior stages or participant progression do not permit this slot.'
    if ((stage === 'final' || stage === 'finalReplay') && recordedOpponentId(match) !== cup.activeTeamIds.find(id => id !== teamId)) return 'This Cup Final slot requires a different fixture opponent. Fixture IDs cannot change without rewriting historical ownership.'
    return
  }
  const draw = data.competitionStates?.find(row => row.kind === 'champions-draw' && row.season === season)
  if (!draw || draw.teamIds.length !== 16 || new Set(draw.teamIds).size !== 16 || !draw.teamIds.includes(teamId)) return 'A complete Champions draw containing the recorded team is required for this season.'
  const champions = championsCompetition(draw, prior, season, data.players)
  // Legacy replay slots only exist for a tied legacy Final. Do not invent a
  // modern comparison-series replay or silently reinterpret its identity.
  if (stage === 'finalReplay') {
    const final = champions.rounds.final.find(row => row.id === pairingId)
    if (!final?.tied || !final.teamIds.includes(teamId) || seriesGame !== undefined) return 'No valid Champions Final Replay slot is available.'
    if (scope.some(row => competitionIdentityForMatch(row).stage === stage && recordedTeamId(row) === teamId)) return 'That Champions replay slot is already occupied.'
    return
  }
  const pairing = champions.rounds[stage as 'roundOf16' | 'quarterFinal' | 'semiFinal' | 'final']?.find(row => row.id === pairingId)
  if (!pairing?.teamIds.includes(teamId)) return 'The Champions pairing or round is unavailable for this team; check prior rounds and draw membership.'
  const required = stage === 'final' ? 2 : 3
  if (!Number.isInteger(seriesGame) || seriesGame! < 1 || seriesGame! > required) return 'The Champions series game is out of range.'
  const games = scope.filter(row => competitionIdentityForMatch(row).stage === stage && recordedTeamId(row) === teamId)
  if (games.some(row => competitionIdentityForMatch(row).pairingId !== pairingId)) return 'Existing Champions series pairing identities conflict.'
  const numbers = games.map(row => competitionIdentityForMatch(row).seriesGame)
  if (numbers.includes(seriesGame)) return 'That Champions series game is already occupied (duplicate slot).'
  if (numbers.some(number => !Number.isInteger(number) || number! < 1 || number! > required) || new Set(numbers).size !== numbers.length) return 'Existing Champions series identities are invalid or duplicated.'
  const all = new Set([...numbers, seriesGame])
  for (let game = 1; game <= all.size; game++) if (!all.has(game)) return 'This change leaves a gap in an already-recorded Champions series game sequence.'
}

/** Localized edit validation: unchanged legacy histories keep their existing
 * compatibility, while a moved slot and newly-invalid downstream rows fail closed. */
export function validateMatchMetadataMutation(data: MetadataState, previous: Match, replacement: Match): CompetitionMutationSafety {
  if (replacement.id !== previous.id) return fail('A metadata edit must preserve the original match ID.')
  if (recordedTeamId(previous) !== recordedTeamId(replacement) || previous.homeTeamId !== replacement.homeTeamId || previous.awayTeamId !== replacement.awayTeamId) return fail('Recorded team and fixture IDs cannot change: that would rewrite historical event and appearance ownership. Edit the opponent display name or home/away label instead.')
  // Missing raw ownership is meaningful in legacy League/Cup history: both
  // fixture teams can own it even though the canonical snapshot names home.
  if (!previous.teamId && teamsCreditedWithResult(previous).some(teamId => isRecordedForTeam(previous, teamId) && !isRecordedForTeam(replacement, teamId))) return fail('This legacy match is recorded for both fixture teams. This change would narrow historical ownership and hide the other team’s saved history. The original ownership must remain unchanged.')
  const exact = replacement.competitionAssignment && matchesCompetitionAssignmentExactly(replacement, replacement.competitionAssignment)
  if (!sameRawFootballValue(representations(previous), representations(replacement)) && !exact) return fail('Target competition fields must agree with the canonical assignment and season.')
  if (sameSlot(previous, replacement)) return { safe: true }
  if (!replacement.season.trim() || !exact) return fail('Target competition fields must agree with the canonical assignment and season.')
  const next = { ...data, matches: data.matches.map(row => row.id === previous.id ? replacement : row) }
  const targetError = slotError(next, replacement)
  if (targetError) return fail(targetError)
  const affected = [competitionIdentityForMatch(previous), competitionIdentityForMatch(replacement)]
  for (const row of next.matches) {
    if (row.id === previous.id || !affected.some(scope => scope.season === row.season && scope.competitionType === competitionIdentityForMatch(row).competitionType)) continue
    const error = slotError(next, row)
    // A pre-existing legacy issue is not a reason to forbid an otherwise
    // unrelated edit. Newly invalid rows, including same-round G2, are blocked.
    if (error && error !== slotError(data, row)) return fail(`This change affects already-recorded match ${row.id}: ${error}`)
  }
  return { safe: true }
}

/** Replace metadata only; raw arrays and permanent IDs remain source-owned. */
export function applyMatchMetadata(source: Match, proposal: MatchMetadataProposal, data: MetadataState): Match {
  const input = proposal.assignment
  if (input.teamId !== recordedTeamId(source) || input.opponentTeamId !== undefined && input.opponentTeamId !== recordedOpponentId(source)) throw new Error('Recorded team and fixture IDs cannot change without rewriting historical ownership.')
  if (!['league', 'cup', 'champions'].includes(input.competitionType) || !input.season.trim()) throw new Error('Choose a valid competition and season.')
  if (proposal.date !== source.date && (!/^\d{4}-\d{2}-\d{2}$/.test(proposal.date) || !Number.isFinite(Date.parse(proposal.date)) || new Date(proposal.date).toISOString().slice(0, 10) !== proposal.date)) throw new Error('Enter a valid match date.')
  const assignment = freezeCompetitionAssignment({ ...input, ...(input.competitionType === 'champions' ? {} : { pairingId: undefined, seriesGame: undefined }), opponentTeamId: recordedOpponentId(source) })
  const { competitionPairingId: _pairing, competitionSeriesGame: _series, ...base } = source
  const result: Match = { ...base, teamId: assignment.teamId, season: assignment.season, competitionType: assignment.competitionType, competitionStage: assignment.stage, matchDay: assignment.matchDay, competitionAssignment: assignment, ...(assignment.pairingId ? { competitionPairingId: assignment.pairingId } : {}), ...(assignment.seriesGame ? { competitionSeriesGame: assignment.seriesGame } : {}), date: proposal.date, ...(proposal.opponentName !== undefined ? { opponentName: proposal.opponentName.trim() } : {}), ...('homeAway' in proposal ? { homeAway: proposal.homeAway } : {}) }
  const safety = validateMatchMetadataMutation(data, source, result)
  if (!safety.safe) throw new Error(safety.message)
  return result
}

/** Canonical next-slot suggestion; manual historical choices still pass the
 * same explicit validator when the dialog accepts and when the queue writes. */
export function suggestMatchMetadataAssignment(source: Match, type: CompetitionType, season: string, data: MetadataState): CompetitionAssignmentSnapshot {
  const matches = data.matches.filter(row => row.id !== source.id)
  const teamId = recordedTeamId(source)
  const draw = data.competitionStates?.find(row => row.kind === 'champions-draw' && row.season === season)
  const proposal = competitionAssignment(type, season, teamId, type === 'cup' ? currentStaticTeams(data.teams) : data.teams, matches, draw, data.players)
  if (!proposal.available) throw new Error(proposal.message ?? 'No safe competition slot is available.')
  if (proposal.opponentTeamId && proposal.opponentTeamId !== recordedOpponentId(source)) throw new Error('This slot requires a different fixture opponent. Fixture IDs cannot change without rewriting historical ownership.')
  const matchDay = type === 'league' ? firstMissingLeagueSlot(leagueSlotCounts(matches, season).get(teamId)) : canonicalScheduleOrdinal(type, proposal.stage, proposal.seriesGame)
  if (!matchDay) throw new Error('No safe schedule slot is available.')
  return freezeCompetitionAssignment({ competitionType: type, season, teamId, stage: proposal.stage, pairingId: proposal.pairingId, seriesGame: proposal.seriesGame, opponentTeamId: recordedOpponentId(source), matchDay })
}
