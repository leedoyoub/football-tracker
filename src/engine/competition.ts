import { matchScore, rateMatch } from './rating'
import { seasonStandings, type Standing } from './standings'
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
  return Boolean(a && b && a.points === b.points && a.goalDifference === b.goalDifference && a.goalsFor === b.goalsFor)
}

export function leagueCompetition(teams: Team[], matches: Match[], season: string) {
  const games = competitionMatches(matches, season, 'league')
  const standings = seasonStandings(teams, games, season)
  const progress = standings.length ? Math.min(...standings.map(row => row.played)) : 0
  return { standings, matches: games, matchdayProgress: progress, complete: standings.length > 0 && progress >= 38, championId: progress >= 38 ? standings[0]?.teamId : undefined }
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
    .map(row => row.rating))
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
  return sameStanding(a, b) && a.averageRating === b.averageRating && a.opponentShotsOnTarget === b.opponentShotsOnTarget
}

function stableDrawValue(seed: string, id: string): number {
  return [...`${seed}|${id}`].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0
}

function stageRanking(teamIds: string[], games: Match[], season: string, players: Player[], drawSeed: string): StageMetric[] {
  const basic = seasonStandings(teamIds.map(id => ({ id } as Team)), games, season)
  return basic.map(row => ({ ...row, averageRating: averageTeamRating(row.teamId, games, players), opponentShotsOnTarget: allowedShots(row.teamId, games) }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || b.averageRating - a.averageRating || a.opponentShotsOnTarget - b.opponentShotsOnTarget || stableDrawValue(drawSeed, a.teamId) - stableDrawValue(drawSeed, b.teamId))
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

function cupRows(teamIds: string[], cumulative: Standing[], current: Standing[], eliminatedAt: Record<string, number>, eliminatedOrder: Record<string, number>, atRisk: string[], championId?: string, runnerUpId?: string): CupTableRow[] {
  const cumulativeById = new Map(cumulative.map(row => [row.teamId, row]))
  const currentRank = new Map(current.map((row, index) => [row.teamId, index + 1]))
  return teamIds.map(teamId => {
    const eliminatedStage = eliminatedAt[teamId]
    let rank = currentRank.get(teamId) ?? 0
    if (eliminatedStage) rank = 17 - eliminatedStage * 2 + (eliminatedOrder[teamId] ?? 0)
    if (teamId === championId) rank = 1
    if (teamId === runnerUpId) rank = 2
    const state: CupTableRow['state'] = eliminatedStage ? 'eliminated' : atRisk.includes(teamId) ? 'at-risk' : 'surviving'
    return { ...(cumulativeById.get(teamId) ?? emptyStanding(teamId)), rank, stageRank: currentRank.get(teamId), state, ...(eliminatedStage ? { eliminatedStage } : {}) }
  }).sort((a, b) => a.rank - b.rank || a.teamId.localeCompare(b.teamId))
}

export function cupCompetition(teams: Team[], matches: Match[], season: string, players: Player[] = []): CupCompetition {
  const teamIds = teams.slice(0, 16).map(team => team.id)
  let activeTeamIds = [...teamIds]
  const eliminatedTeamIds: string[] = []
  const eliminatedAtByTeam: Record<string, number> = {}
  const eliminatedOrder: Record<string, number> = {}
  let lastEliminationDrawTeamIds: string[] = []
  const cumulativeStandings = seasonStandings(teams.filter(team => teamIds.includes(team.id)), competitionMatches(matches, season, 'cup'), season)

  const result = (stage: CupStage, standings: Standing[], games: Match[], stageComplete: boolean, atRiskTeamIds: string[], eliminationDrawTeamIds: string[], championId?: string, runnerUpId?: string): CupCompetition => ({
    stage, activeTeamIds, eliminatedTeamIds, eliminatedAtByTeam, standings, cumulativeStandings,
    rows: cupRows(teamIds, cumulativeStandings, standings, eliminatedAtByTeam, eliminatedOrder, atRiskTeamIds, championId, runnerUpId),
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
    if (drawIds.length) lastEliminationDrawTeamIds = drawIds
    const eliminated = standings.slice(-2)
    eliminated.forEach((row, order) => {
      eliminatedTeamIds.push(row.teamId)
      eliminatedAtByTeam[row.teamId] = stageIndex + 1
      eliminatedOrder[row.teamId] = order
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

function makeRound(stage: Exclude<ChampionsStage, 'finalReplay'>, teamIds: string[], matches: Match[], season: string, players: Player[]): ChampionsPairing[] {
  const requiredMatches = stage === 'final' ? 1 : 2
  return Array.from({ length: teamIds.length / 2 }, (_, index) => {
    const pair = [teamIds[index * 2], teamIds[index * 2 + 1]] as [string, string]
    const id = `${stage}:${index}`
    const games = competitionStageMatches(matches, season, 'champions', stage).filter(match => match.competitionPairingId === id)
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
  rounds.roundOf16 = makeRound('roundOf16', draw.teamIds, matches, season, players)
  let currentStage: ChampionsStage = 'roundOf16'
  for (const stage of CHAMPIONS_ROUNDS.slice(1) as Exclude<ChampionsStage, 'finalReplay'>[]) {
    const previousStage = CHAMPIONS_ROUNDS[CHAMPIONS_ROUNDS.indexOf(stage) - 1] as Exclude<ChampionsStage, 'finalReplay'>
    const winners = rounds[previousStage].map(pairing => pairing.winnerId).filter((id): id is string => Boolean(id))
    if (winners.length !== rounds[previousStage].length) break
    rounds[stage] = makeRound(stage, winners, matches, season, players)
    currentStage = stage
  }
  const final = rounds.final[0]
  if (final?.tied) currentStage = 'finalReplay'
  const unresolved = (Object.keys(rounds) as Exclude<ChampionsStage, 'finalReplay'>[]).find(stage => rounds[stage].length && rounds[stage].some(pairing => !pairing.winnerId))
  if (unresolved && currentStage !== 'finalReplay') currentStage = unresolved
  return { drawn: true, drawCount, currentStage, rounds, championId: final?.winnerId, runnerUpId: final?.winnerId ? final.teamIds.find(id => id !== final.winnerId) : undefined }
}

export type CompetitionAssignment = { available: boolean; stage: CompetitionStage; pairingId?: string; opponentTeamId?: string; message?: string }

export function competitionAssignment(type: CompetitionType, season: string, teamId: string, teams: Team[], matches: Match[], draw?: CompetitionState): CompetitionAssignment {
  if (type === 'league') return { available: true, stage: 'regular' as const }
  if (type === 'cup') {
    const cup = cupCompetition(teams, matches, season)
    if (!cup.activeTeamIds.includes(teamId) || cup.championId) return { available: false, stage: cup.stage, message: cup.championId ? 'Cup is complete.' : 'This team has been eliminated.' }
    const opponentTeamId = cup.stage === 'final' || cup.stage === 'finalReplay' ? cup.activeTeamIds.find(id => id !== teamId) : undefined
    return { available: !cup.stageMatches.some(match => hasPlayed(match, teamId)), stage: cup.stage, opponentTeamId, message: 'This team has already played in the current Cup stage.' }
  }
  const champions = championsCompetition(draw, matches, season)
  if (!champions.drawn) return { available: false, stage: 'roundOf16' as const, message: 'Complete the Champions draw from Competitions first.' }
  if (champions.championId) return { available: false, stage: 'final' as const, message: 'Champions is complete.' }
  const lookupStage = champions.currentStage === 'finalReplay' ? 'final' : champions.currentStage
  const pairing = champions.rounds[lookupStage].find(item => item.teamIds.includes(teamId))
  if (!pairing || pairing.winnerId) return { available: false, stage: champions.currentStage, message: 'This team is not active in the current Champions round.' }
  const replayGames = champions.currentStage === 'finalReplay' ? pairing.replayMatches ?? [] : pairing.matches
  const gamesNeeded = champions.currentStage === 'finalReplay' ? 1 : pairing.requiredMatches
  return { available: replayGames.length < gamesNeeded, stage: champions.currentStage, pairingId: pairing.id, opponentTeamId: pairing.teamIds.find(id => id !== teamId), message: 'This tie already has all required matches.' }
}

export function competitionSeasonStatus(teams: Team[], matches: Match[], season: string, players: Player[], draw?: CompetitionState) {
  const league = leagueCompetition(teams, matches, season)
  const cup = cupCompetition(teams, matches, season, players)
  const champions = championsCompetition(draw, matches, season, players)
  return { league, cup, champions, complete: league.complete && Boolean(cup.championId) && Boolean(champions.championId) }
}

/** Completion-only fast path. Most seasons are not at MD38, so do not derive
 * tournament rating tie-breakers merely to prove the answer is false. */
export function isCompetitionSeasonComplete(teams: Team[], matches: Match[], season: string, players: Player[], draw?: CompetitionState): boolean {
  if (!leagueCompetition(teams, matches, season).complete) return false
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
  const league = leagueCompetition(teams, matches, season)
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
  return { league: `${leaguePlayed} / 38`, cup: cupLabel, champions: championsLabel }
}
