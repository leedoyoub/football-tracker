import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { currentStaticTeams } from '../data/teams'
import { awardsForCompetition, finalPlayerAward, performanceAwardResult, seasonAwards, type AwardWinner, type CompetitionAwards } from './awards'
import { competitionMatches, competitionSeasonStatus, type ChampionsCompetition } from './competition'
import { matchesForAwardPeriod } from './awardScopes'
import { monthlyAwardForBlock } from './seasonAnalytics'
import { hasPitchAppearance } from './timeline'
import { newestMatches } from './matchChronology'
import { scopedPositionFamilyByPlayer, type PositionFamily } from './positionScope'
import { competitionIdentityForMatch } from './competitionContext'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { AWARD_POLICY_REVISION } from './awardPolicy'

export { AWARD_POLICY_REVISION } from './awardPolicy'
export const ROUND_AWARD_STAGES = ['roundOf16', 'quarterFinal', 'semiFinal'] as const
export const ROUND_AWARD_LABELS = { roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals' } as const
export type OfficialAwardEvent = {
  id: string; kind: string; label: string; playerId: string; teamId: string; season: string
  competition: CompetitionType | 'all'; category: 'individual' | 'championship' | 'runner-up'
  period?: number | typeof ROUND_AWARD_STAGES[number]; position?: PositionFamily; finalized: true
}
export type TeamSeasonResult = {
  season: string; competition: CompetitionType; teamId: string; champion: boolean; runnerUp: boolean
  finalAppearance: boolean; finish: number; finishLabel: string; points?: number; wins?: number; goalDifference?: number
}
export type OfficialSeasonModel = { readonly status: ReturnType<typeof competitionSeasonStatus>; events: OfficialAwardEvent[]; teamResults: TeamSeasonResult[]; competitionAwards: Record<CompetitionType, CompetitionAwards> }
const cache = new WeakMap<Team[], WeakMap<Player[], WeakMap<Match[], WeakMap<CompetitionState[], Map<string, OfficialSeasonModel>>>>>()

/** A pairing winner alone is insufficient if other required series are missing. */
export function isChampionsRoundFinalized(model: ChampionsCompetition, stage: typeof ROUND_AWARD_STAGES[number]): boolean {
  const pairs = model.rounds[stage]
  const expected = stage === 'roundOf16' ? 8 : stage === 'quarterFinal' ? 4 : 2
  return pairs.length === expected && pairs.every(pair => !pair.integrityError && Boolean(pair.winnerId))
}

export function officialSeasonModel(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], season: string): OfficialSeasonModel {
  let byPlayers = cache.get(teams); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(teams, byPlayers) }
  let byMatches = byPlayers.get(players); if (!byMatches) { byMatches = new WeakMap(); byPlayers.set(players, byMatches) }
  let byStates = byMatches.get(matches); if (!byStates) { byStates = new WeakMap(); byMatches.set(matches, byStates) }
  let bySeason = byStates.get(states); if (!bySeason) { bySeason = new Map(); byStates.set(states, bySeason) }
  const key = `${AWARD_POLICY_REVISION}:${RATING_ENGINE_REVISION}:${season}`
  const cached = bySeason.get(key); if (cached) return cached
  const tournamentTeams = currentStaticTeams(teams)
  const status = competitionSeasonStatus(tournamentTeams, matches, season, players, states.find(state => state.kind === 'champions-draw' && state.season === season))
  const teamResults: TeamSeasonResult[] = []
  const competitionAwards = {} as Record<CompetitionType, CompetitionAwards>
  const games = matches.filter(match => match.season === season)
  for (const row of status.league.complete ? status.league.standings : []) teamResults.push({ season, competition: 'league', teamId: row.teamId, champion: row.rank === 1, runnerUp: row.rank === 2, finalAppearance: false, finish: row.rank, finishLabel: `#${row.rank}`, points: row.points, wins: row.wins, goalDifference: row.goalDifference })
  const historicalTeamIds = new Set([...tournamentTeams.map(team => team.id), ...teams.map(team => team.id), ...(states.find(state => state.kind === 'champions-draw' && state.season === season)?.teamIds ?? [])])
  for (const teamId of historicalTeamIds) {
    const cup = status.cup
    const champion = cup.championId === teamId, runnerUp = cup.runnerUpId === teamId
    const finalAppearance = (cup.stage === 'final' || cup.stage === 'finalReplay') && cup.activeTeamIds.includes(teamId)
    const eliminated = cup.eliminatedAtByTeam[teamId]
    if (champion || runnerUp || finalAppearance || eliminated) teamResults.push({ season, competition: 'cup', teamId: teamId, champion, runnerUp, finalAppearance, finish: champion ? 0 : finalAppearance ? 1 : 9 - eliminated, finishLabel: champion ? 'Champion' : finalAppearance ? 'Final' : `Stage ${eliminated}` })
    const champions = status.champions
    const stages = ['roundOf16', 'quarterFinal', 'semiFinal', 'final'] as const
    const reached = stages.filter(stage => champions.rounds[stage].some(pair => pair.teamIds.includes(teamId)))
    const stage = reached[reached.length - 1]
    if (stage) teamResults.push({ season, competition: 'champions', teamId: teamId, champion: champions.championId === teamId, runnerUp: champions.runnerUpId === teamId, finalAppearance: stage === 'final', finish: champions.championId === teamId ? 0 : 4 - stages.indexOf(stage), finishLabel: champions.championId === teamId ? 'Champion' : stage === 'final' ? 'Final' : ROUND_AWARD_LABELS[stage] })
  }
  let publishedEvents: OfficialAwardEvent[] | undefined
  const buildEvents = () => {
    if (publishedEvents) return publishedEvents
    const events = new Map<string, OfficialAwardEvent>()
    const positions = new WeakMap<Match[], Map<string, Map<string, PositionFamily>>>()
    const add = (kind: string, label: string, playerId: string | undefined, competition: CompetitionType | 'all', scope: Match[], teamId?: string, period?: OfficialAwardEvent['period'], category: OfficialAwardEvent['category'] = 'individual') => {
      if (!playerId) return
      const historicalTeam = teamId ?? newestMatches(scope).find(match => match.appearances.some(a => a.playerId === playerId && hasPitchAppearance(match, a)))?.appearances.find(a => a.playerId === playerId)?.teamId
      if (!historicalTeam) return
      let byTeam = positions.get(scope); if (!byTeam) { byTeam = new Map(); positions.set(scope, byTeam) }
      let families = byTeam.get(historicalTeam)
      if (!families) { families = scopedPositionFamilyByPlayer(players, scope, { teams: [historicalTeam], fallback: 'none' }); byTeam.set(historicalTeam, families) }
      const position = families.get(playerId)
      const id = JSON.stringify([season, competition, kind, period ?? '', playerId, category === 'individual' ? '' : historicalTeam])
      events.set(id, { id, kind, label, playerId, teamId: historicalTeam, season, competition, period, category, position, finalized: true })
    }
    for (let block = 1; block <= 10; block++) {
      const award = monthlyAwardForBlock(tournamentTeams, players, matches, season, block)
      if (!award?.finalized) continue
      const scope = competitionMatches(matches, season, 'league').filter(match => { const day = competitionIdentityForMatch(match).matchDay; return day >= (block - 1) * 3 + 1 && day <= block * 3 })
      add('monthly-player', 'Player of the Month', award.playerOfMonth?.playerId, 'league', scope, award.playerOfMonth?.teamId, block)
      for (const slot of award.bestXI) add('monthly-xi', 'Team of the Month', slot.playerId ?? undefined, 'league', scope, slot.teamId, block)
    }
    for (const competition of ['league', 'cup', 'champions'] as const) {
      const scope = competitionMatches(matches, season, competition)
      const award = awardsForCompetition(competition, season, tournamentTeams, players, matches, states, status)
      competitionAwards[competition] = award
      if (award.complete) {
        const title = competition === 'league' ? 'League' : competition === 'cup' ? 'Cup' : 'Champions'
        const publish = (kind: string, label: string, winner?: AwardWinner) => add(`${competition}-${kind}`, label, winner?.playerId, competition, scope, winner?.teamId)
        publish('mvp', competition === 'league' ? 'Player of the League' : competition === 'cup' ? 'Player of the Cup' : 'Player of the Tournament', award.mvp)
        for (const winner of award.scorers) publish('scorer', `${title} Top Scorer`, winner)
        for (const winner of award.assistLeaders) publish('assists', `${title} Assist King`, winner)
        for (const winner of award.goalkeepers) publish('gk', winner.label, winner)
        for (const slot of award.bestXI ?? []) add(`${competition}-xi`, `${title} Best XI`, slot.playerId ?? undefined, competition, scope, slot.teamId)
      }
      if (competition !== 'league' && award.complete) {
        const finals = matchesForAwardPeriod(matches, season, competition, 'final')
        add(`${competition}-final`, `${competition === 'cup' ? 'Cup' : 'Champions'} Player of the Final`, finalPlayerAward(players, finals)?.playerId, competition, finals)
      }
    }
    for (const stage of ROUND_AWARD_STAGES) {
      if (!isChampionsRoundFinalized(status.champions, stage)) continue
      const scope = matchesForAwardPeriod(matches, season, 'champions', stage)
      const award = performanceAwardResult(players, scope)
      add('champions-round-player', 'Champions Player of the Round', award.bestPlayerId, 'champions', scope, award.candidates[0]?.teamId, stage)
      for (const slot of award.bestXI) add('champions-round-xi', 'Champions Team of the Round', slot.playerId ?? undefined, 'champions', scope, slot.teamId, stage)
    }
    if (status.complete) {
      const award = seasonAwards(season, tournamentTeams, players, matches, states, status)
      for (const [kind, label, winners] of [['mvp', 'Player of the Season', award.ballon ? [award.ballon] : []], ['scorer', 'Season Top Scorer', award.goldenBootWinners], ['assists', 'Season Assist King', award.assistLeaderWinners], ['gk', 'Goalkeeper of the Season', award.goalkeeper ? [award.goalkeeper] : []]] as const) {
        for (const winner of winners) add(`season-${kind}`, label, winner.playerId, 'all', games, winner.teamId)
      }
      for (const slot of award.bestXI) add('season-xi', 'Season Best XI', slot.playerId ?? undefined, 'all', games, slot.teamId)
    }
    for (const result of teamResults) {
      if (!result.champion && !result.runnerUp) continue
      const scope = competitionMatches(matches, season, result.competition)
      const ids = new Set(scope.flatMap(match => match.appearances.filter(a => a.teamId === result.teamId && hasPitchAppearance(match, a)).map(a => a.playerId)))
      const title = result.competition === 'league' ? 'League' : result.competition === 'cup' ? 'Cup' : 'Champions'
      for (const id of ids) add(result.champion ? 'championship' : 'runner-up', `${title} ${result.champion ? 'Champion' : 'Runner-up'}`, id, result.competition, scope, result.teamId, undefined, result.champion ? 'championship' : 'runner-up')
    }
    publishedEvents = [...events.values()]
    return publishedEvents
  }
  const value = { status, get events() { return buildEvents() }, teamResults, get competitionAwards() { buildEvents(); return competitionAwards } }
  bySeason.set(key, value)
  return value
}

export function officialAwardsForSeason(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], season: string) { return officialSeasonModel(teams, players, matches, states, season).events }
export function officialAwardSeasons(matches: Match[], states: CompetitionState[]): string[] { return [...new Set([...matches.map(m => m.season), ...states.map(s => s.season)])].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) }
export function careerAwardEvents(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], playerId: string) { return officialAwardSeasons(matches, states).flatMap(season => officialAwardsForSeason(teams, players, matches, states, season)).filter(e => e.playerId === playerId).sort((a, b) => b.season.localeCompare(a.season, undefined, { numeric: true }) || periodOrder(b) - periodOrder(a)) }
function periodOrder(event: OfficialAwardEvent) { return typeof event.period === 'number' ? event.period : event.period ? ROUND_AWARD_STAGES.indexOf(event.period) + 1 : 20 }
export function awardEventDetail(event: OfficialAwardEvent, teams: Team[]): string {
  const season = `Season ${event.season.match(/\d+/)?.[0] ?? event.season}`
  return event.kind === 'cup-final' || event.kind === 'champions-final' ? `${season} · Final` : typeof event.period === 'number' ? `${season}-${event.period}` : event.period ? `${season} · ${ROUND_AWARD_LABELS[event.period]}` : `${season} · ${teams.find(team => team.id === event.teamId)?.name ?? event.teamId}`
}
