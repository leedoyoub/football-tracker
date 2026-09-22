import { matchScore, rateMatch } from './rating'
import { compareStandings, sameStandingMetrics, seasonStandings, type Standing, type StandingTieMetrics } from './standings'
import { LEAGUE_MATCHES_PER_TEAM } from './leagueFormat'
import type { ChampionsStage, CompetitionStage, CompetitionState, CompetitionType, CupStage, Match, Player, Team } from '../types'

export const CUP_STAGES: CupStage[] = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7']
export const CHAMPIONS_ROUNDS: Exclude<ChampionsStage, 'finalReplay'>[] = ['roundOf16', 'quarterFinal', 'semiFinal', 'final']

export function matchCompetitionType(match: Match): CompetitionType {
  return match.competitionType ?? 'league'
}

const scopedCompetitionMatches = new WeakMap<Match[], Map<string, { length: number; rows: Match[] }>>()
/** The initial selection is indexed by source-array identity and scope. This
 * makes a return to an unchanged competition an O(1) lookup. */
export function competitionMatches(matches: Match[], season: string, type: CompetitionType): Match[] {
  let index = scopedCompetitionMatches.get(matches)
  if (!index) { index = new Map(); scopedCompetitionMatches.set(matches, index) }
  const key = `${season}:${type}`; const cached = index.get(key)
  if (cached && cached.length === matches.length) return cached.rows
  const selected = matches.filter(match => match.season === season && matchCompetitionType(match) === type)
  index.set(key, { length: matches.length, rows: selected })
  return selected
}

export function competitionStageMatches(matches: Match[], season: string, type: CompetitionType, stage: string): Match[] {
  return competitionMatches(matches, season, type).filter(match => match.competitionStage === stage)
}

function hasPlayed(match: Match, teamId: string): boolean {
  return match.homeTeamId === teamId || match.awayTeamId === teamId || match.teamId === teamId
}

function sameStanding(a?: Standing, b?: Standing): boolean {
  return Boolean(a && b && sameStandingMetrics(a, b))
}

/**
 * Persist only pairing repairs that are mechanically unique from the fixed
 * R16 draw. Later-round identities are resolved against the live bracket in
 * `makeRound`, where a frozen assignment must agree with that bracket first.
 */
export function reconcileChampionsPairingIds(matches: Match[], states: CompetitionState[] = []): Match[] {
  let changed = false
  const repaired = matches.map(match => {
    if (matchCompetitionType(match) !== 'champions' || match.competitionStage !== 'roundOf16') return match
    const draw = states.find(state => state.kind === 'champions-draw' && state.season === match.season)
    const teamId = match.teamId ?? match.homeTeamId
    const index = draw?.teamIds.indexOf(teamId) ?? -1
    if (index < 0) return match
    const pairingId = `roundOf16:${Math.floor(index / 2)}`
    if (match.competitionPairingId === pairingId) return match
    changed = true
    return { ...match, competitionPairingId: pairingId }
  })
  return changed ? repaired : matches
}

export function leagueCompetition(teams: Team[], matches: Match[], season: string, players: Player[] = []) {
  const games = competitionMatches(matches, season, 'league')
  const standings = stageRanking(teams.map(team => team.id), games, season, players, `${season}:league`)
  const minimumTeamMatches = standings.length ? Math.min(...standings.map(row => row.played)) : 0
  const matchdayProgress = Math.min(minimumTeamMatches + 1, LEAGUE_MATCHES_PER_TEAM)
  const complete = standings.length > 0 && minimumTeamMatches >= LEAGUE_MATCHES_PER_TEAM
  return { standings, matches: games, matchdayProgress, complete, championId: complete ? standings[0]?.teamId : undefined }
}

type StageMetric = Standing & { averageRating: number; opponentShotsOnTarget: number }
export type CupTableRow = Standing & {
  stageRank?: number
  state: 'surviving' | 'at-risk' | 'eliminated'
  eliminatedStage?: number
}

export type CupCompetition = {
  stage: CupStage
  activeTeamIds: string[]
  eliminatedTeamIds: string[]
  eliminatedAtByTeam: Record<string, number>
  standings: Standing[]
  cumulativeStandings: Standing[]
  rows: CupTableRow[]
  stageMatches: Match[]
  stageComplete: boolean
  atRiskTeamIds: string[]
  eliminationDrawTeamIds: string[]
  lastEliminationDrawTeamIds: string[]
  championId?: string
  runnerUpId?: string
}

function averageTeamRating(teamId: string, games: Match[], players: Player[]): number {
  const values = games.flatMap(match => rateMatch(match, players)
    .filter(row => match.appearances.some(appearance => appearance.playerId === row.playerId && appearance.teamId === teamId))
    .map(row => row.raw))
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

/** Goals conceded + goalkeeper saves is the available raw-data representation of opponent SOT. */
function allowedShots(teamId: string, games: Match[]): number {
  return games.reduce((total, match) => {
    if (!hasPlayed(match, teamId)) return total
    const score = matchScore(match)
    const conceded = match.homeTeamId === teamId ? score.away : score.home
    const saves = match.events.reduce((sum, event) => sum + (event.type === 'save' && event.teamId === teamId ? event.count ?? 1 : 0), 0)
    return total + conceded + saves
  }, 0)
}

function metricTie(a: StageMetric, b: StageMetric): boolean {
  return sameStandingMetrics(a, b, new Map([[a.teamId, a], [b.teamId, b]]))
}

function stableDrawValue(seed: string, id: string): number {
  return [...`${seed}|${id}`].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0
}

function stageRanking(teamIds: string[], games: Match[], season: string, players: Player[], drawSeed: string): StageMetric[] {
  const basic = seasonStandings(teamIds.map(id => ({ id } as Team)), games, season)
  const metrics = new Map<string, StandingTieMetrics>(basic.map(row => [row.teamId, { averageRating: averageTeamRating(row.teamId, games, players), opponentShotsOnTarget: allowedShots(row.teamId, games) }]))
  return basic.map(row => ({ ...row, ...(metrics.get(row.teamId) ?? { averageRating: 0, opponentShotsOnTarget: 0 }) }))
    .sort((a, b) => compareStandings(a, b, metrics) || stableDrawValue(drawSeed, a.teamId) - stableDrawValue(drawSeed, b.teamId))
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

function boundaryTieIds(rows: StageMetric[]): string[] {
  if (rows.length < 3) return []
  const boundary = rows[rows.length - 2]
  const tied = rows.filter(row => metricTie(row, boundary)).map(row => row.teamId)
  const positions = rows.map((row, index) => tied.includes(row.teamId) ? index : -1).filter(index => index >= 0)
  return positions.some(index => index < rows.length - 2) && positions.some(index => index >= rows.length - 2) ? tied : []
}

function emptyStanding(teamId: string): Standing {
  return { rank: 0, teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }
}

function cupRows(teamIds: string[], current: Standing[], eliminatedSnapshots: Record<string, Standing>, eliminatedAt: Record<string, number>, eliminatedOrder: Record<string, number>, atRisk: string[], championId?: string, runnerUpId?: string): CupTableRow[] {
  const currentById = new Map(current.map(row => [row.teamId, row]))
  const currentRank = new Map(current.map((row, index) => [row.teamId, index + 1]))
  return teamIds.map(teamId => {
    const eliminatedStage = eliminatedAt[teamId]
    let rank = currentRank.get(teamId) ?? 0
    if (eliminatedStage) rank = 17 - eliminatedStage * 2 + (eliminatedOrder[teamId] ?? 0)
    if (teamId === championId) rank = 1
    if (teamId === runnerUpId) rank = 2
    const state: CupTableRow['state'] = eliminatedStage ? 'eliminated' : atRisk.includes(teamId) ? 'at-risk' : 'surviving'
    const totals = eliminatedStage ? eliminatedSnapshots[teamId] : currentById.get(teamId)
    return { ...(totals ?? emptyStanding(teamId)), rank, stageRank: currentRank.get(teamId), state, ...(eliminatedStage ? { eliminatedStage } : {}) }
  }).sort((a, b) => a.rank - b.rank || a.teamId.localeCompare(b.teamId))
}

export function cupCompetition(teams: Team[], matches: Match[], season: string, players: Player[] = []): CupCompetition {
  const teamIds = teams.slice(0, 16).map(team => team.id)
  let activeTeamIds = [...teamIds]
  const eliminatedTeamIds: string[] = []
  const eliminatedAtByTeam: Record<string, number> = {}
  const eliminatedOrder: Record<string, number> = {}
  const eliminatedSnapshots: Record<string, Standing> = {}
  const processedStageMatches: Match[] = []
  let lastEliminationDrawTeamIds: string[] = []
  const cumulativeStandings = seasonStandings(teams.filter(team => teamIds.includes(team.id)), competitionMatches(matches, season, 'cup'), season)

  const result = (stage: CupStage, standings: Standing[], games: Match[], stageComplete: boolean, atRiskTeamIds: string[], eliminationDrawTeamIds: string[], championId?: string, runnerUpId?: string): CupCompetition => ({
    stage, activeTeamIds, eliminatedTeamIds, eliminatedAtByTeam, standings, cumulativeStandings,
    rows: cupRows(teamIds, standings, eliminatedSnapshots, eliminatedAtByTeam, eliminatedOrder, atRiskTeamIds, championId, runnerUpId),
    stageMatches: games, stageComplete, atRiskTeamIds, eliminationDrawTeamIds, lastEliminationDrawTeamIds, championId, runnerUpId,
  })

  for (let stageIndex = 0; stageIndex < CUP_STAGES.length; stageIndex++) {
    const stage = CUP_STAGES[stageIndex]
    const games = competitionStageMatches(matches, season, 'cup', stage)
    const standings = stageRanking(activeTeamIds, games, season, players, `${season}:${stage}`)
    const complete = activeTeamIds.length > 0 && activeTeamIds.every(teamId => games.some(match => hasPlayed(match, teamId)))
    const atRisk = standings.slice(-2).map(row => row.teamId)
    const drawIds = boundaryTieIds(standings)
    if (!complete) return result(stage, standings, games, false, atRisk, drawIds)
    processedStageMatches.push(...games)
    const cumulativeAtStage = new Map(seasonStandings(teams.filter(team => teamIds.includes(team.id)), processedStageMatches, season).map(row => [row.teamId, row]))
    if (drawIds.length) lastEliminationDrawTeamIds = drawIds
    const eliminated = standings.slice(-2)
    eliminated.forEach((row, order) => {
      eliminatedTeamIds.push(row.teamId)
      eliminatedAtByTeam[row.teamId] = stageIndex + 1
      eliminatedOrder[row.teamId] = order
      eliminatedSnapshots[row.teamId] = cumulativeAtStage.get(row.teamId) ?? emptyStanding(row.teamId)
    })
    activeTeamIds = standings.slice(0, -2).map(row => row.teamId)
  }

  const finalGames = competitionStageMatches(matches, season, 'cup', 'final')
  const finalStandings = stageRanking(activeTeamIds, finalGames, season, players, `${season}:final`)
  const finalComplete = activeTeamIds.length === 2 && activeTeamIds.every(teamId => finalGames.some(match => hasPlayed(match, teamId)))
  if (!finalComplete) return result('final', finalStandings, finalGames, false, [], [])
  if (!sameStanding(finalStandings[0], finalStandings[1])) return result('final', finalStandings, finalGames, true, [], [], finalStandings[0]?.teamId, finalStandings[1]?.teamId)

  const replayGames = competitionStageMatches(matches, season, 'cup', 'finalReplay')
  const replayStandings = stageRanking(activeTeamIds, replayGames, season, players, `${season}:finalReplay`)
  const replayComplete = activeTeamIds.every(teamId => replayGames.some(match => hasPlayed(match, teamId)))
  if (!replayComplete) return result('finalReplay', replayStandings, replayGames, false, [], [])
  const winner = replayStandings[0]?.teamId
  return result('finalReplay', replayStandings, replayGames, true, [], [], winner, activeTeamIds.find(id => id !== winner))
}

export function createChampionsDraw(teams: readonly Team[], random: () => number = Math.random): string[] {
  if (teams.length < 16) throw new Error('Champions requires 16 teams.')
  const ids = [...new Set(teams.slice(0, 16).map(team => team.id))]
  if (ids.length !== 16) throw new Error('Champions draw requires 16 unique teams.')
  for (let index = ids.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1))
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
  }
  return ids
}

export function drawNextChampionsTeam(teams: readonly Team[], drawnIds: readonly string[], random: () => number = Math.random): string[] {
  const eligible = teams.slice(0, 16).map(team => team.id).filter(id => !drawnIds.includes(id))
  if (!eligible.length) return [...drawnIds]
  return [...drawnIds, eligible[Math.floor(random() * eligible.length)]]
}

export type ChampionsPairing = {
  id: string
  stage: ChampionsStage
  teamIds: [string, string]
  matches: Match[]
  replayMatches?: Match[]
  winnerId?: string
  tied: boolean
  requiredMatches: number
  /** New comparison-series data: each side's own independently recorded matches. */
  teamGames?: Record<string, Match[]>
  rowWinners?: (string | undefined)[]
  integrityError?: string
}

export type ChampionsCompetition = {
  drawn: boolean
  drawCount: number
  currentStage: ChampionsStage
  rounds: Record<Exclude<ChampionsStage, 'finalReplay'>, ChampionsPairing[]>
  championId?: string
  runnerUpId?: string
}

function comparePair(teamIds: [string, string], games: Match[], players: Player[], extended: boolean, forceWinner = false): string | undefined {
  const rows = stageRanking(teamIds, games, games[0]?.season ?? '', players, games.map(game => game.id).sort().join('|'))
  const [first, second] = rows
  const tied = extended ? metricTie(first, second) : sameStanding(first, second)
  if (!tied) return first?.teamId
  return forceWinner ? first?.teamId : undefined
}

function scoreForTeam(match: Match, teamId: string) {
  const score = matchScore(match)
  const home = match.homeTeamId === teamId || (match.teamId === teamId && match.homeTeamId !== teamId)
  const goalsFor = home ? score.home : score.away
  const goalsAgainst = home ? score.away : score.home
  return { goalsFor, goalsAgainst, result: goalsFor > goalsAgainst ? 2 : goalsFor === goalsAgainst ? 1 : 0 }
}

/** Canonical per-row Champions comparison. Pairings compare independent team matches, never a direct fixture. */
export function compareChampionsSeriesRow(firstId: string, first: Match, secondId: string, second: Match, players: Player[]): string {
  const left = scoreForTeam(first, firstId), right = scoreForTeam(second, secondId)
  const rating = (match: Match, teamId: string) => averageTeamRating(teamId, [match], players)
  const order = [
    left.result - right.result,
    (left.goalsFor - left.goalsAgainst) - (right.goalsFor - right.goalsAgainst),
    left.goalsFor - right.goalsFor,
    rating(first, firstId) - rating(second, secondId),
    allowedShots(secondId, [second]) - allowedShots(firstId, [first]),
  ]
  for (const value of order) if (value) return value > 0 ? firstId : secondId
  return firstId.localeCompare(secondId) <= 0 ? firstId : secondId
}

export function championsSeriesIntegrity(games: Match[], requiredMatches: number): { valid: true; nextGame?: number } | { valid: false; message: string } {
  const numbers = games.map(match => match.competitionSeriesGame)
  if (numbers.some(number => !Number.isInteger(number))) return { valid: false, message: 'Champions data-integrity warning: series game identity is missing.' }
  if (numbers.some(number => !number || number < 1 || number > requiredMatches)) return { valid: false, message: 'Champions data-integrity warning: series game is out of range.' }
  const unique = new Set(numbers)
  if (unique.size !== numbers.length) return { valid: false, message: 'Champions data-integrity warning: duplicate series game identity.' }
  for (let number = 1; number <= numbers.length; number++) if (!unique.has(number)) return { valid: false, message: 'Champions data-integrity warning: series game sequence has a gap.' }
  return { valid: true, ...(numbers.length < requiredMatches ? { nextGame: numbers.length + 1 } : {}) }
}

function makeSeriesRound(stage: Exclude<ChampionsStage, 'finalReplay'>, pair: [string, string], games: Match[], players: Player[]) {
  const requiredMatches = stage === 'final' ? 2 : 3
  const ordered = (teamId: string) => games.filter(match => match.teamId === teamId || (!match.teamId && hasPlayed(match, teamId)))
    .sort((a, b) => (a.competitionSeriesGame ?? Number.MAX_SAFE_INTEGER) - (b.competitionSeriesGame ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
  const [firstId, secondId] = pair; const first = ordered(firstId), second = ordered(secondId)
  const firstIntegrity = championsSeriesIntegrity(first, requiredMatches)
  const secondIntegrity = championsSeriesIntegrity(second, requiredMatches)
  if (!firstIntegrity.valid) return { requiredMatches, teamGames: { [firstId]: first, [secondId]: second }, rowWinners: [] as (string | undefined)[], integrityError: firstIntegrity.message }
  if (!secondIntegrity.valid) return { requiredMatches, teamGames: { [firstId]: first, [secondId]: second }, rowWinners: [] as (string | undefined)[], integrityError: secondIntegrity.message }
  if (first.length !== requiredMatches || second.length !== requiredMatches) return { requiredMatches, teamGames: { [firstId]: first, [secondId]: second }, rowWinners: [] as (string | undefined)[] }
  const rowWinners = Array.from({ length: requiredMatches }, (_, index) => compareChampionsSeriesRow(firstId, first[index], secondId, second[index], players))
  const wins = (teamId: string) => rowWinners.filter(id => id === teamId).length
  let winnerId: string | undefined
  if (wins(firstId) !== wins(secondId)) winnerId = wins(firstId) > wins(secondId) ? firstId : secondId
  else {
    // Each aggregate describes only that team's independently logged matches.
    const left = stageRanking([firstId], first, first[0]?.season ?? '', players, `${stage}:${firstId}`)[0]
    const right = stageRanking([secondId], second, second[0]?.season ?? '', players, `${stage}:${secondId}`)[0]
    const values = [left.goalDifference - right.goalDifference, left.goalsFor - right.goalsFor, left.averageRating - right.averageRating, right.opponentShotsOnTarget - left.opponentShotsOnTarget]
    winnerId = values.find(value => value !== 0)! > 0 ? firstId : values.every(value => value === 0) ? (firstId.localeCompare(secondId) <= 0 ? firstId : secondId) : secondId
  }
  return { requiredMatches, teamGames: { [firstId]: first, [secondId]: second }, rowWinners, winnerId }
}

function repairChampionsPairing(match: Match, stage: Exclude<ChampionsStage, 'finalReplay'>, pair: [string, string], pairingId: string, draw: CompetitionState): Match | undefined {
  if (match.competitionPairingId === pairingId) return match
  const teamId = match.teamId ?? match.homeTeamId
  if (!pair.includes(teamId) || match.competitionStage !== stage) return undefined
  const frozen = match.competitionAssignment
  const frozenAgrees = frozen?.competitionType === 'champions' && frozen.season === match.season && frozen.teamId === teamId && frozen.stage === stage && frozen.pairingId === pairingId
  // R16 has a fixed draw slot, so it can be inferred safely even for records
  // from before frozen assignments existed. Later rounds additionally require
  // a frozen snapshot that agrees with the bracket derived above.
  const drawnAgrees = stage === 'roundOf16' && draw.teamIds.includes(teamId) && Math.floor(draw.teamIds.indexOf(teamId) / 2) === Number(pairingId.split(':')[1])
  return frozenAgrees || drawnAgrees ? { ...match, competitionPairingId: pairingId } : undefined
}

function makeRound(stage: Exclude<ChampionsStage, 'finalReplay'>, teamIds: string[], matches: Match[], season: string, players: Player[], draw: CompetitionState): ChampionsPairing[] {
  const requiredMatches = stage === 'final' ? 1 : 2
  return Array.from({ length: teamIds.length / 2 }, (_, index) => {
    const pair = [teamIds[index * 2], teamIds[index * 2 + 1]] as [string, string]
    const id = `${stage}:${index}`
    const stageGames = competitionStageMatches(matches, season, 'champions', stage)
    const resolved = stageGames.map(match => repairChampionsPairing(match, stage, pair, id, draw) ?? match)
    const games = resolved.filter(match => match.competitionPairingId === id)
    // Never silently ignore a same-team record from this stage. Without a
    // unique repair it is ambiguous whether it belongs to this pairing, so
    // reopening Game 1 would risk duplicating an already-recorded slot.
    const unresolved = stageGames.some(match => {
      if (!hasPlayed(match, pair[0]) && !hasPlayed(match, pair[1])) return false
      return match.competitionPairingId !== id && !repairChampionsPairing(match, stage, pair, id, draw)
    })
    if (unresolved) return { id, stage, teamIds: pair, matches: [], tied: false, requiredMatches: stage === 'final' ? 2 : 3, integrityError: 'Champions data-integrity warning: pairing identity is missing or ambiguous.' }
    const seriesMode = games.length === 0 || games.some(match => Number.isInteger(match.competitionSeriesGame))
    if (seriesMode) {
      const series = makeSeriesRound(stage, pair, games, players)
      return { id, stage, teamIds: pair, matches: games, winnerId: series.winnerId, tied: false, requiredMatches: series.requiredMatches, teamGames: series.teamGames, rowWinners: series.rowWinners, ...(series.integrityError ? { integrityError: series.integrityError } : {}) }
    }
    let winnerId = games.length >= requiredMatches ? comparePair(pair, games, players, stage !== 'final', stage !== 'final') : undefined
    let tied = games.length >= requiredMatches && !winnerId
    const replayMatches = stage === 'final' ? competitionStageMatches(matches, season, 'champions', 'finalReplay').filter(match => match.competitionPairingId === id) : []
    if (stage === 'final' && tied && replayMatches.length) {
      winnerId = comparePair(pair, replayMatches, players, true, true)
      tied = !winnerId
    }
    return { id, stage, teamIds: pair, matches: games, ...(replayMatches.length ? { replayMatches } : {}), winnerId, tied, requiredMatches }
  })
}

export function championsCompetition(draw: CompetitionState | undefined, matches: Match[], season: string, players: Player[] = []): ChampionsCompetition {
  const empty = { roundOf16: [], quarterFinal: [], semiFinal: [], final: [] } as ChampionsCompetition['rounds']
  const drawCount = draw?.kind === 'champions-draw' ? new Set(draw.teamIds).size : 0
  if (!draw || draw.kind !== 'champions-draw' || draw.teamIds.length !== 16 || drawCount !== 16) return { drawn: false, drawCount, currentStage: 'roundOf16', rounds: empty }
  const rounds = { ...empty }
  rounds.roundOf16 = makeRound('roundOf16', draw.teamIds, matches, season, players, draw)
  let currentStage: ChampionsStage = 'roundOf16'
  for (const stage of CHAMPIONS_ROUNDS.slice(1) as Exclude<ChampionsStage, 'finalReplay'>[]) {
    const previousStage = CHAMPIONS_ROUNDS[CHAMPIONS_ROUNDS.indexOf(stage) - 1] as Exclude<ChampionsStage, 'finalReplay'>
    const winners = rounds[previousStage].map(pairing => pairing.winnerId).filter((id): id is string => Boolean(id))
    if (winners.length !== rounds[previousStage].length) break
    rounds[stage] = makeRound(stage, winners, matches, season, players, draw)
    currentStage = stage
  }
  const final = rounds.final[0]
  if (final?.tied) currentStage = 'finalReplay'
  const unresolved = (Object.keys(rounds) as Exclude<ChampionsStage, 'finalReplay'>[]).find(stage => rounds[stage].length && rounds[stage].some(pairing => !pairing.winnerId))
  if (unresolved && currentStage !== 'finalReplay') currentStage = unresolved
  return { drawn: true, drawCount, currentStage, rounds, championId: final?.winnerId, runnerUpId: final?.winnerId ? final.teamIds.find(id => id !== final.winnerId) : undefined }
}

export type CompetitionAssignment = { available: boolean; stage: CompetitionStage; pairingId?: string; seriesGame?: number; opponentTeamId?: string; message?: string }

function assignmentCupStageLabel(stage: CupStage): string {
  return stage === 'finalReplay' ? 'Final Replay' : stage === 'final' ? 'Final' : `Stage ${Number(stage.replace('stage', ''))}`
}

function championsStageLabel(stage: ChampionsStage): string {
  return ({ roundOf16: 'Round of 16', quarterFinal: 'Quarter-final', semiFinal: 'Semi-final', final: 'Final', finalReplay: 'Final Replay' } as Record<ChampionsStage, string>)[stage]
}

export function competitionAssignment(type: CompetitionType, season: string, teamId: string, teams: Team[], matches: Match[], draw?: CompetitionState, players: Player[] = []): CompetitionAssignment {
  if (type === 'league') {
    const played = competitionMatches(matches, season, 'league').filter(match => hasPlayed(match, teamId)).length
    return played >= LEAGUE_MATCHES_PER_TEAM ? { available: false, stage: 'regular' as const, message: 'This team has completed its 30-match League schedule.' } : { available: true, stage: 'regular' as const }
  }
  if (type === 'cup') {
    const cup = cupCompetition(teams, matches, season, players)
    if (!cup.activeTeamIds.includes(teamId) || cup.championId) return { available: false, stage: cup.stage, message: cup.championId ? 'Cup is complete.' : 'This team has been eliminated.' }
    const opponentTeamId = cup.stage === 'final' || cup.stage === 'finalReplay' ? cup.activeTeamIds.find(id => id !== teamId) : undefined
    const played = cup.stageMatches.some(match => hasPlayed(match, teamId))
    return played
      ? { available: false, stage: cup.stage, opponentTeamId, message: `This team has already played in ${assignmentCupStageLabel(cup.stage)}.` }
      : { available: true, stage: cup.stage, opponentTeamId, message: `${assignmentCupStageLabel(cup.stage)} · Ready to play` }
  }
  const champions = championsCompetition(draw, matches, season, players)
  if (!champions.drawn) return { available: false, stage: 'roundOf16' as const, message: 'Complete the Champions draw from Competitions first.' }
  if (champions.championId) return { available: false, stage: 'final' as const, message: 'Champions is complete.' }
  const lookupStage = champions.currentStage === 'finalReplay' ? 'final' : champions.currentStage
  const pairing = champions.rounds[lookupStage].find(item => item.teamIds.includes(teamId))
  if (!pairing || pairing.winnerId) return { available: false, stage: champions.currentStage, message: 'This team is not active in the current Champions round.' }
  if (pairing.integrityError) return { available: false, stage: lookupStage, pairingId: pairing.id, message: pairing.integrityError }
  if (pairing.teamGames) {
    const games = pairing.teamGames[teamId] ?? []
    const integrity = championsSeriesIntegrity(games, pairing.requiredMatches)
    if (!integrity.valid) return { available: false, stage: lookupStage, pairingId: pairing.id, message: integrity.message }
    if (integrity.nextGame) return { available: true, stage: lookupStage, pairingId: pairing.id, seriesGame: integrity.nextGame, message: `${championsStageLabel(lookupStage)} · Game ${integrity.nextGame} of ${pairing.requiredMatches}` }
    return { available: false, stage: lookupStage, pairingId: pairing.id, message: `This team has completed its ${championsStageLabel(lookupStage)} series.` }
    /* Legacy length-only branch retained below only as patch context; it is unreachable.
      ? { available: true, stage: lookupStage, pairingId: pairing.id, seriesGame: games.length + 1, message: `${lookupStage === 'final' ? 'Final' : lookupStage.replace(/([A-Z])/g, ' $1')} · Game ${games.length + 1} of ${pairing.requiredMatches}` }
      : { available: false, stage: lookupStage, pairingId: pairing.id, message: 'This team has completed its Champions comparison series.' }
  }
  */
  }
  const replayGames = champions.currentStage === 'finalReplay' ? pairing.replayMatches ?? [] : pairing.matches
  const gamesNeeded = champions.currentStage === 'finalReplay' ? 1 : pairing.requiredMatches
  return { available: replayGames.length < gamesNeeded, stage: champions.currentStage, pairingId: pairing.id, opponentTeamId: pairing.teamIds.find(id => id !== teamId), message: 'This tie already has all required matches.' }
}

export type CompetitionMutationSafety = { safe: boolean; message?: string }
const cupStageOrder = new Map<string, number>([...CUP_STAGES, 'final', 'finalReplay'].map((stage, index) => [stage, index]))
const championsStageOrder = new Map<ChampionsStage, number>([['roundOf16', 0], ['quarterFinal', 1], ['semiFinal', 2], ['final', 3], ['finalReplay', 4]])

function matchesWithReplacement(matches: Match[], previous: Match, replacement?: Match): Match[] {
  return replacement ? matches.map(match => match.id === previous.id ? replacement : match) : matches.filter(match => match.id !== previous.id)
}

/** Refuse only mutations that make an already-recorded later tournament slot impossible. */
export function competitionMutationSafety(matches: Match[], previous: Match, replacement: Match | undefined, teams: Team[], players: Player[], draw?: CompetitionState): CompetitionMutationSafety {
  const type = matchCompetitionType(previous)
  if (type === 'league') return { safe: true }
  const order = type === 'cup' ? cupStageOrder : championsStageOrder
  const stageOrder = order.get(previous.competitionStage as never)
  if (stageOrder === undefined) return { safe: false, message: 'This match has an invalid competition stage and cannot be changed safely.' }
  const later = matches.filter(match => match.season === previous.season && matchCompetitionType(match) === type && (order.get(match.competitionStage as never) ?? -1) > stageOrder)
  if (!later.length) return { safe: true }
  const next = matchesWithReplacement(matches, previous, replacement)
  for (const downstream of later) {
    const downstreamOrder = order.get(downstream.competitionStage as never)
    if (downstreamOrder === undefined) return { safe: false, message: 'A later tournament record has an invalid stage.' }
    const prior = next.filter(match => match.season === previous.season && matchCompetitionType(match) === type && (order.get(match.competitionStage as never) ?? -1) < downstreamOrder)
    const teamId = downstream.teamId ?? downstream.homeTeamId
    if (type === 'cup') {
      const derived = cupCompetition(teams, prior, previous.season, players)
      if ((cupStageOrder.get(derived.stage) ?? -1) < downstreamOrder || !derived.activeTeamIds.includes(teamId)) return { safe: false, message: `This result affects already-recorded ${assignmentCupStageLabel(downstream.competitionStage as CupStage)} matches. Reset the later round before changing this match.` }
    } else {
      const pairing = championsCompetition(draw, prior, previous.season, players).rounds[downstream.competitionStage as Exclude<ChampionsStage, 'finalReplay'>]?.find(item => item.id === downstream.competitionPairingId)
      if (!pairing?.teamIds.includes(teamId)) return { safe: false, message: `This result affects already-recorded ${championsStageLabel(downstream.competitionStage as ChampionsStage)} matches. Reset the later round before changing this match.` }
    }
  }
  return { safe: true }
}

/** A historical completion marker survives only while the derived season remains complete. */
export function reconcileSeasonCompletionMarkers(states: CompetitionState[], teams: Team[], matches: Match[], players: Player[]): CompetitionState[] {
  return states.filter(state => state.kind !== 'season-complete' || isCompetitionSeasonComplete(teams, matches, state.season, players, states.find(item => item.kind === 'champions-draw' && item.season === state.season)))
}

export type CompetitionSeasonStatus = {
  league: ReturnType<typeof leagueCompetition>
  cup: CupCompetition
  champions: ChampionsCompetition
  complete: boolean
}

/** Derive each competition once, then let read-model consumers format it for their surface. */
export function competitionSeasonStatus(teams: Team[], matches: Match[], season: string, players: Player[], draw?: CompetitionState): CompetitionSeasonStatus {
  const league = leagueCompetition(teams, matches, season, players)
  const cup = cupCompetition(teams, matches, season, players)
  const champions = championsCompetition(draw, matches, season, players)
  return { league, cup, champions, complete: league.complete && Boolean(cup.championId) && Boolean(champions.championId) }
}

/** Completion-only fast path. Most seasons are not at the League limit, so do not derive
 * tournament rating tie-breakers merely to prove the answer is false. */
export function isCompetitionSeasonComplete(teams: Team[], matches: Match[], season: string, players: Player[], draw?: CompetitionState): boolean {
  if (!leagueCompetition(teams, matches, season, players).complete) return false
  if (!cupCompetition(teams, matches, season, players).championId) return false
  return Boolean(championsCompetition(draw, matches, season, players).championId)
}

export type SeasonChampions = { season: string; league?: string; cup?: string; champions?: string }
export function competitionHistory(teams: Team[], matches: Match[], players: Player[], states: CompetitionState[]): SeasonChampions[] {
  const seasons = [...new Set([...matches.map(match => match.season), ...states.map(state => state.season)])]
  return seasons.sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0)).map(season => {
    const draw = states.find(state => state.kind === 'champions-draw' && state.season === season)
    const status = competitionSeasonStatus(teams, matches, season, players, draw)
    return { season, league: status.league.championId, cup: status.cup.championId, champions: status.champions.championId }
  })
}

export function teamCompetitionProgress(teamId: string, teams: Team[], matches: Match[], season: string, players: Player[], draw?: CompetitionState) {
  const league = leagueCompetition(teams, matches, season, players)
  const cup = cupCompetition(teams, matches, season, players)
  const champions = championsCompetition(draw, matches, season, players)
  const leaguePlayed = league.standings.find(row => row.teamId === teamId)?.played ?? 0
  const cupLabel = cup.championId === teamId ? 'Winner' : cup.eliminatedAtByTeam[teamId] ? `Eliminated S${cup.eliminatedAtByTeam[teamId]}` : cup.stage === 'finalReplay' ? 'Final Replay' : cup.stage === 'final' ? 'Final' : cup.stageMatches.length || cup.eliminatedTeamIds.length ? `Stage ${Number(cup.stage.replace('stage', ''))}` : 'Not Started'
  let championsLabel = 'Not Started'
  if (champions.drawn) {
    if (champions.championId === teamId) championsLabel = 'Winner'
    else {
      const loss = (Object.entries(champions.rounds) as [Exclude<ChampionsStage, 'finalReplay'>, ChampionsPairing[]][]).find(([, pairs]) => pairs.some(pair => pair.teamIds.includes(teamId) && pair.winnerId && pair.winnerId !== teamId))
      const labels: Record<string, string> = { roundOf16: 'R16', quarterFinal: 'QF', semiFinal: 'SF', final: 'Final' }
      championsLabel = loss ? `Eliminated ${labels[loss[0]]}` : ({ roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals', final: 'Final', finalReplay: 'Final Replay' } as Record<string, string>)[champions.currentStage]
    }
  }
  return { league: `${leaguePlayed} / ${LEAGUE_MATCHES_PER_TEAM}`, cup: cupLabel, champions: championsLabel }
}

export type CompactTeamProgress = { league: string; cup: string; champions: string }

const compactChampionsStage = (stage: Exclude<ChampionsStage, 'finalReplay'>) => ({ roundOf16: 'R16', quarterFinal: 'QF', semiFinal: 'SF', final: 'F' } as const)[stage]

/**
 * Presentation-only status for the compact Teams cards. It intentionally accepts
 * an already-derived season status so a grid never recreates competition engines
 * for every team.
 */
export function compactTeamCompetitionProgress(teamId: string, status: CompetitionSeasonStatus): CompactTeamProgress {
  const leaguePlayed = status.league.standings.find(row => row.teamId === teamId)?.played ?? 0
  const cup = status.cup
  const cupLabel = cup.championId === teamId ? 'Champ'
    : cup.runnerUpId === teamId ? 'Out F'
      : cup.eliminatedAtByTeam[teamId] ? `Out S${cup.eliminatedAtByTeam[teamId]}`
        : !cup.stageMatches.length && !cup.eliminatedTeamIds.length ? 'NS'
          : cup.stage === 'finalReplay' ? 'FR'
            : cup.stage === 'final' ? 'F'
              : `S${cup.stage.replace('stage', '')}`

  const champions = status.champions
  const isDrawnTeam = champions.rounds.roundOf16.some(pairing => pairing.teamIds.includes(teamId))
  let championsLabel = 'NS'
  if (champions.drawn && isDrawnTeam) {
    if (champions.championId === teamId) championsLabel = 'Champ'
    else {
      const loss = (Object.entries(champions.rounds) as [Exclude<ChampionsStage, 'finalReplay'>, ChampionsPairing[]][])
        .find(([, pairings]) => pairings.some(pairing => pairing.teamIds.includes(teamId) && pairing.winnerId && pairing.winnerId !== teamId))
      if (loss) championsLabel = `Out ${compactChampionsStage(loss[0])}`
      else {
        const stage = champions.currentStage === 'finalReplay' ? 'final' : champions.currentStage
        const pairing = champions.rounds[stage].find(item => item.teamIds.includes(teamId))
        if (pairing) {
          const ownGames = pairing.teamGames?.[teamId] ?? pairing.matches.filter(match => match.teamId === teamId || (!match.teamId && hasPlayed(match, teamId)))
          const completed = Math.min(ownGames.length, pairing.requiredMatches)
          const gameNumber = completed >= pairing.requiredMatches ? pairing.requiredMatches : completed + 1
          championsLabel = `${compactChampionsStage(stage)} ${gameNumber}/${pairing.requiredMatches}`
        }
      }
    }
  }
  return { league: `${leaguePlayed}/${LEAGUE_MATCHES_PER_TEAM}`, cup: cupLabel, champions: championsLabel }
}

/** O(1) read model for TeamsScreen cards after deriving the season state once. */
export function compactTeamCompetitionProgressMap(teamIds: Iterable<string>, status: CompetitionSeasonStatus): Map<string, CompactTeamProgress> {
  return new Map([...teamIds].map(teamId => [teamId, compactTeamCompetitionProgress(teamId, status)]))
}

export type TeamCompetitionOverview = {
  league: Standing
  champions: { status: string; goalsFor: number; goalsAgainst: number }
  cup: { status: string; goalsFor: number; goalsAgainst: number }
}

const championsRoundLabel = (stage: ChampionsStage) => ({ roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals', final: 'Final', finalReplay: 'Final Replay' } as Record<ChampionsStage, string>)[stage]
const cupStageLabel = (stage: CupStage) => stage === 'final' ? 'Final' : stage === 'finalReplay' ? 'Final Replay' : `Stage ${stage.replace('stage', '')}`

/** Actual recorded competition scores from the tracked team's perspective.
 * Champions comparison opponents are never used as a score source. */
export function teamCompetitionGoals(teamId: string, matches: Match[], season: string, type: CompetitionType) {
  return competitionMatches(matches, season, type).reduce((total, match) => {
    if (!hasPlayed(match, teamId)) return total
    const score = matchScore(match)
    const home = match.homeTeamId === teamId || (match.teamId === teamId && match.homeTeamId !== teamId)
    return { goalsFor: total.goalsFor + (home ? score.home : score.away), goalsAgainst: total.goalsAgainst + (home ? score.away : score.home) }
  }, { goalsFor: 0, goalsAgainst: 0 })
}

/** Canonical compact competition data shared by Team Detail consumers. */
export function teamCompetitionOverview(teamId: string, teams: Team[], matches: Match[], season: string, players: Player[], states: CompetitionState[] = []): TeamCompetitionOverview {
  const draw = states.find(state => state.id === `champions:${season}` && state.kind === 'champions-draw')
  const league = leagueCompetition(teams, matches, season, players).standings.find(row => row.teamId === teamId) ?? emptyStanding(teamId)
  const cup = cupCompetition(teams, matches, season, players)
  const cupGoals = teamCompetitionGoals(teamId, matches, season, 'cup')
  const cupPlayed = competitionMatches(matches, season, 'cup').some(match => hasPlayed(match, teamId))
  const cupStatus = cup.championId === teamId ? 'Champion'
    : cup.eliminatedAtByTeam[teamId] ? `Eliminated · Stage ${cup.eliminatedAtByTeam[teamId]}`
      : cupPlayed ? cupStageLabel(cup.stage) : 'Not Started'

  const champions = championsCompetition(draw, matches, season, players)
  const championsGoals = teamCompetitionGoals(teamId, matches, season, 'champions')
  let championsStatus = 'Not Started'
  if (draw?.teamIds.includes(teamId)) {
    if (champions.championId === teamId) championsStatus = 'Champion'
    else {
      const loss = (Object.entries(champions.rounds) as [Exclude<ChampionsStage, 'finalReplay'>, ChampionsPairing[]][])
        .find(([, pairings]) => pairings.some(pairing => pairing.teamIds.includes(teamId) && pairing.winnerId && pairing.winnerId !== teamId))
      if (loss) championsStatus = `Eliminated · ${championsRoundLabel(loss[0])}`
      else {
        const stage = champions.currentStage === 'finalReplay' ? 'final' : champions.currentStage
        const pairing = champions.rounds[stage].find(item => item.teamIds.includes(teamId))
        if (pairing) {
          const ownGames = pairing.teamGames?.[teamId] ?? pairing.matches.filter(match => match.teamId === teamId || (!match.teamId && hasPlayed(match, teamId)))
          const required = pairing.requiredMatches
          championsStatus = ownGames.length >= required
            ? `${championsRoundLabel(stage)} · ${required}/${required} Played`
            : `${championsRoundLabel(stage)} · Game ${ownGames.length + 1}/${required}`
        }
      }
    }
  }
  return { league, champions: { status: championsStatus, ...championsGoals }, cup: { status: cupStatus, ...cupGoals } }
}
