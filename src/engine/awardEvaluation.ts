import type { Appearance, CompetitionType, Match, Player } from '../types'
import { buildGlobalRankingData, type GlobalLeaderboardRow } from './stats'
import { rankAwardCandidates, type AwardCandidate } from './awardRules'
import { scopedAwardFamilyByPlayer } from './positionScope'
import { creditedMinutesPlayed } from './timeline'
import { oldestMatches } from './matchChronology'
import { isRecordedForTeam } from './matchPerspective'
import { competitionIdentityForMatch } from './competitionContext'
import { arrayItemRevision } from './arrayItemRevision'
import { AWARD_POLICY_REVISION } from './awardPolicy'
import { RATING_ENGINE_REVISION } from './ratingRevision'

type Participation = { minutes: number; availableMinutes: number; teamMinutes: Map<string, number> }
const competitions = ['league', 'cup', 'champions'] as const
type SeasonParticipationRow = { match: Match; identity: ReturnType<typeof competitionIdentityForMatch>; teamIds: string[]; appearances: Map<string, Appearance>; minutes: Map<string, number> }
type SeasonParticipation = { revision: string; ordered: SeasonParticipationRow[]; evidence: Map<string, { index: number; teamId: string }[]> }
const seasonParticipationCache = new WeakMap<Match[], SeasonParticipation>()

/** Every award scope uses the same recorded season registration history. Keep
 * this roster-independent input once; opportunities remain scope-specific. */
function seasonParticipation(seasonGames: Match[]): SeasonParticipation {
  const revision = `${AWARD_POLICY_REVISION}:${RATING_ENGINE_REVISION}:${arrayItemRevision(seasonGames)}`
  const cached = seasonParticipationCache.get(seasonGames)
  if (cached?.revision === revision) return cached
  const ordered = oldestMatches(seasonGames).map(match => {
    const identity = competitionIdentityForMatch(match)
    const teamIds = [...new Set([match.teamId ?? match.homeTeamId, match.awayTeamId])].filter(teamId => isRecordedForTeam(match, teamId))
    const appearances = new Map(match.appearances.filter(a => teamIds.includes(a.teamId)).map(a => [a.playerId, a]))
    return { match, identity, teamIds, appearances, minutes: new Map([...appearances].map(([id, appearance]) => [id, Math.min(90, creditedMinutesPlayed(match, appearance))])) }
  })
  const evidence = new Map<string, { index: number; teamId: string }[]>()
  ordered.forEach(({ appearances }, index) => {
    for (const appearance of appearances.values()) {
      const rows = evidence.get(appearance.playerId) ?? []
      rows.push({ index, teamId: appearance.teamId }); evidence.set(appearance.playerId, rows)
    }
  })
  const result = { revision, ordered, evidence }
  seasonParticipationCache.set(seasonGames, result)
  return result
}

/** A transfer date is not stored. Recorded registrations delimit the evidenced
 * stints; the last known team owns uncertain gaps. Before the first record the
 * first evidenced team owns the opportunities. No current-roster inference. */
function scopeParticipation(players: Player[], games: Match[], seasonGames: Match[]) {
  const { ordered, evidence } = seasonParticipation(seasonGames)
  const selected = new Set(games)
  // Team-local repeated slots remain distinct records. Across transferred teams
  // the same League round / tournament game is one opportunity, not two.
  const ordinalByTeam = new Map<string, number>()
  const slots = new Map<Match, Map<string, string>>()
  const selectedByTeam = new Map<string, { index: number; row: typeof ordered[number] }[]>()
  const seenGames = new Set<string>()
  for (const [index, row] of ordered.entries()) {
    const { match, identity, teamIds } = row
    if (!selected.has(match)) continue
    const base = `${match.season}:${match.date?.trim() || match.id}:${identity.competitionType}:${identity.stage}:${identity.seriesGame ?? identity.matchDay}`
    const byTeam = new Map<string, string>()
    for (const teamId of teamIds) {
      const key = `${base}:${teamId}`
      const ordinal = ordinalByTeam.get(key) ?? 0
      ordinalByTeam.set(key, ordinal + 1); byTeam.set(teamId, `${base}:${ordinal}`)
    }
    slots.set(match, byTeam)
    // Deduplication was identical for every player. Keep assigning ordinals to
    // all saved rows above, but visit only the first selected ID in each stint.
    if (seenGames.has(match.id)) continue
    seenGames.add(match.id)
    for (const teamId of teamIds) {
      const rows = selectedByTeam.get(teamId) ?? []
      rows.push({ index, row }); selectedByTeam.set(teamId, rows)
    }
  }
  const result = new Map<string, Record<CompetitionType, Participation>>()
  for (const player of players) {
    const history = evidence.get(player.id)
    if (!history?.length) continue
    const facts = Object.fromEntries(competitions.map(type => [type, { minutes: 0, availableMinutes: 0, teamMinutes: new Map<string, number>() }])) as Record<CompetitionType, Participation>
    const opportunities = new Map<string, { type: CompetitionType; recorded: boolean }>()
    let teamId = history[0].teamId, start = 0
    for (let stint = 1; stint <= history.length; stint++) {
      if (stint < history.length && history[stint].teamId === teamId) continue
      const end = stint < history.length ? history[stint].index : ordered.length
      const rows = selectedByTeam.get(teamId) ?? []
      // Registrations delimit chronological ownership. A team's records outside
      // that window cannot contribute minutes or an opportunity for this player.
      let low = 0, high = rows.length
      while (low < high) {
        const middle = (low + high) >>> 1
        if (rows[middle].index < start) low = middle + 1
        else high = middle
      }
      for (let cursor = low; cursor < rows.length && rows[cursor].index < end; cursor++) {
        const { match, identity, appearances, minutes: playedMinutes } = rows[cursor].row
        const type = identity.competitionType
        const appearance = appearances.get(player.id)
        const key = slots.get(match)!.get(teamId)!
        const previous = opportunities.get(key)
        if (!previous || appearance && !previous.recorded) opportunities.set(key, { type, recorded: Boolean(appearance) })
        if (!appearance) continue
        const minutes = playedMinutes.get(player.id) ?? 0
        facts[type].minutes += minutes
        facts[type].teamMinutes.set(appearance.teamId, (facts[type].teamMinutes.get(appearance.teamId) ?? 0) + minutes)
      }
      if (stint < history.length) { teamId = history[stint].teamId; start = end }
    }
    for (const opportunity of opportunities.values()) facts[opportunity.type].availableMinutes += 90
    result.set(player.id, facts)
  }
  return result
}

/** Shared individual facts are derived by stats/timeline, never by position-
 * specific averages. One player, one rank and one main award family per scope. */
type ScopeFacts = { rows: GlobalLeaderboardRow[]; families: ReturnType<typeof scopedAwardFamilyByPlayer>; participation: ReturnType<typeof scopeParticipation>; evaluated: Map<string, AwardCandidate[]>; revision: string }
const factsCache = new WeakMap<Player[], WeakMap<Match[], WeakMap<Match[], ScopeFacts>>>()

export function evaluateOfficialCandidates(players: Player[], games: Match[], seasonGames: Match[], bonusFor: (type: CompetitionType, teamId: string) => number, weights: Partial<Record<CompetitionType, number>>, scopeRows?: GlobalLeaderboardRow[]): AwardCandidate[] {
  let byGames = factsCache.get(players); if (!byGames) { byGames = new WeakMap(); factsCache.set(players, byGames) }
  let bySeason = byGames.get(games); if (!bySeason) { bySeason = new WeakMap(); byGames.set(games, bySeason) }
  const revision = `${AWARD_POLICY_REVISION}:${RATING_ENGINE_REVISION}:${arrayItemRevision(players)}:${arrayItemRevision(games)}:${arrayItemRevision(seasonGames)}`
  let facts = bySeason.get(seasonGames)
  if (!facts || facts.revision !== revision) {
    facts = { rows: scopeRows ?? buildGlobalRankingData(players, games, { seasons: [], teams: [], positions: [] }, 'rating'), families: scopedAwardFamilyByPlayer(players, games, {}), participation: scopeParticipation(players, games, seasonGames), evaluated: new Map(), revision }
    bySeason.set(seasonGames, facts)
  }
  const { rows, families, participation, evaluated } = facts
  const teamIds = [...new Set(games.flatMap(match => match.appearances.map(a => a.teamId)))].sort()
  const scoreKey = JSON.stringify(competitions.map(type => [weights[type] ?? 0, ...teamIds.map(teamId => bonusFor(type, teamId))]))
  const cached = evaluated.get(scoreKey); if (cached) return cached
  const seen = new Set<string>()
  const candidates = rankAwardCandidates(rows.flatMap(row => {
    if (seen.has(row.playerId)) return []
    seen.add(row.playerId)
    const ratedMatches = new Set<string>()
    const ratings = row.ratings.filter(rating => {
      if (rating.minutes <= 0 || ratedMatches.has(rating.matchId)) return false
      ratedMatches.add(rating.matchId)
      return true
    })
    const minutes = ratings.reduce((sum, rating) => sum + Math.min(90, rating.minutes), 0)
    const facts = participation.get(row.playerId)
    const availableMinutes = facts ? competitions.reduce((sum, type) => sum + facts[type].availableMinutes, 0) : 0
    const family = families.get(row.playerId)
    if (!family || !ratings.length || !availableMinutes || minutes < .5 * availableMinutes) return []
    const average = ratings.reduce((sum, rating) => sum + rating.raw, 0) / ratings.length
    const teamPerformanceBonus = competitions.reduce((sum, type) => {
      const part = facts![type]
      if (!part.minutes || !part.availableMinutes) return sum
      const weightedBase = [...part.teamMinutes].reduce((total, [teamId, played]) => total + bonusFor(type, teamId) * played, 0) / part.minutes
      return sum + (weights[type] ?? 0) * weightedBase * Math.min(1, part.minutes / part.availableMinutes)
    }, 0)
    return [{ playerId: row.playerId, teamId: row.historicalTeamId ?? row.teamId, family, average, appearances: ratings.length, mom: row.mom, minutes, latestRating: ratings[ratings.length - 1]?.raw ?? 0, goals: row.goals, assists: row.assists, selectionScore: average + teamPerformanceBonus, availableMinutes, teamPerformanceBonus }]
  }), 'cumulative')
  if (evaluated.size >= 16) evaluated.delete(evaluated.keys().next().value!)
  evaluated.set(scoreKey, candidates)
  return candidates
}
