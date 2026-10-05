import { combinationStats } from '../engine/analytics'
import { matchCompetitionType } from '../engine/competition'
import { oldestMatches } from '../engine/matchChronology'
import { buildPlayerRecordLeaderboards } from '../engine/playerRecords'
import { isPlayerAssistEvent, isPlayerGoalEvent } from '../engine/playerMatchFacts'
import { matchScore } from '../engine/rating'
import { orderedEvents, scoringTeamId } from '../engine/timeline'
import { teamMetrics } from '../engine/teamMetrics'
import { buildUnitRecords, type UnitRecord } from '../engine/unitRecords'
import { playerFullName } from '../components/ui'
import { formatSignedTwoDecimals } from '../lib/signedNumber'
import type { CompetitionType, Match, Player, PositionFilterKey, Team } from '../types'

export type RecordsLeaderboardKind = 'player' | 'team' | 'combination'
export type CombinationConnector = '→' | '↔' | '&' | '+'
export type CombinationPairPresentation = { playerIds: string[]; connector: CombinationConnector; directional: boolean }
export type RecordsLeaderboardRow = { id: string; name: string; value: string; numeric: number; detail: string; rank: number; playerIds?: string[]; combinationPair?: CombinationPairPresentation }
export type RecordsLeaderboardGroup = { id: string; title: string; kind: RecordsLeaderboardKind; rows: RecordsLeaderboardRow[]; applicableFilters: { position: boolean; team: boolean } }
export type RecordsScope = { seasons: string[]; teamIds: string[]; competition: CompetitionType | 'all'; positionFilter: PositionFilterKey }

const rank = (rows: Omit<RecordsLeaderboardRow, 'rank'>[], ascending = false) => { let prior: number | undefined; let priorRank = 0; return rows.slice().sort((a, b) => (ascending ? a.numeric - b.numeric : b.numeric - a.numeric) || a.name.localeCompare(b.name)).map((row, index) => { const next = prior === row.numeric ? priorRank : index + 1; prior = row.numeric; priorRank = next; return { ...row, rank: next } }) }
const scopedMatches = (matches: Match[], scope: RecordsScope) => matches.filter(match => (!scope.seasons.length || scope.seasons.includes(match.season)) && (!scope.teamIds.length || scope.teamIds.includes(match.homeTeamId) || scope.teamIds.includes(match.awayTeamId)) && (scope.competition === 'all' || matchCompetitionType(match) === scope.competition))
const combinationKey = (ids: string[]) => ids.slice().sort().join(':')
const combinationPresentationRules: Record<string, Pick<CombinationPairPresentation, 'connector' | 'directional'>> = {
  'goal-combinations': { connector: '→', directional: true },
  'mutual-goal-combinations': { connector: '↔', directional: false },
  'both-scored': { connector: '&', directional: false },
  'both-ga': { connector: '&', directional: false },
  'duo-ga': { connector: '+', directional: false },
  'cb-suppression': { connector: '&', directional: false },
  'cb-ga': { connector: '&', directional: false },
}

/** The one Records read model for directional and partnership pair display. */
export function combinationPairPresentation(leaderboardId: string, playerIds: string[]): CombinationPairPresentation {
  const rule = combinationPresentationRules[leaderboardId]
  if (!rule) throw new Error(`Unknown combination leaderboard: ${leaderboardId}`)
  return { playerIds: [...playerIds], ...rule }
}

export function recordsLeaderboardGroups({ category, players, teams, matches, scope }: { category: RecordsLeaderboardKind; players: Player[]; teams: Team[]; matches: Match[]; scope: RecordsScope }): RecordsLeaderboardGroup[] {
  if (category === 'player') { const byId = new Map(players.map(player => [player.id, player])); return buildPlayerRecordLeaderboards(players, matches, { seasons: scope.seasons, teamIds: scope.teamIds, competition: scope.competition, positionFilter: scope.positionFilter }).map(group => ({ id: group.id, title: group.title, kind: 'player' as const, applicableFilters: { position: true, team: true }, rows: group.rows.map(row => ({ id: row.playerId, name: playerFullName(byId.get(row.playerId)), numeric: row.numeric, value: row.value, detail: row.detail, rank: row.rank })) })) }
  const scoped = scopedMatches(matches, scope)
  return category === 'team' ? teamGroups(teams.filter(team => !scope.teamIds.length || scope.teamIds.includes(team.id)), scoped) : combinationGroups(players, teams, scoped, scope.teamIds)
}

function teamGroups(teams: Team[], matches: Match[]): RecordsLeaderboardGroup[] {
  const rows = teams.map(team => {
    const summary = teamMetrics(team, matches)
    const results = oldestMatches(summary.games).map(match => {
      const score = matchScore(match)
      const ours = match.homeTeamId === team.id ? score.home : score.away
      const against = match.homeTeamId === team.id ? score.away : score.home
      const goals = orderedEvents(match).map(row => row.event).filter((event): event is Extract<Match['events'][number], { type: 'goal' }> => event.type === 'goal')
      let lead = 0; let trailed = false
      for (const event of goals) { lead += scoringTeamId(match, event) === team.id ? 1 : -1; if (lead < 0) trailed = true }
      return { ours, against, outcome: ours > against ? 'W' : ours === against ? 'D' : 'L', opening: Number(goals.length > 0 && scoringTeamId(match, goals[0]) === team.id), comeback: Number(trailed && ours > against), clean: against === 0 }
    })
    const streak = (predicate: (result: typeof results[number]) => boolean) => { let best = 0; let current = 0; for (const result of results) { current = predicate(result) ? current + 1 : 0; best = Math.max(best, current) } return best }
    const games = summary.games.length
    const draws = results.filter(row => row.outcome === 'D').length
    return { team, summary, winRate: games ? summary.wins / games * 100 : 0, ppg: games ? (summary.wins * 3 + draws) / games : 0, gfPerGame: games ? summary.goals / games : 0, gaPerGame: games ? summary.conceded / games : 0, cleanRate: games ? summary.cleanSheets / games * 100 : 0, sotPerGame: games ? summary.opponentSot / games : 0, gd: summary.goals - summary.conceded, gdPerGame: games ? (summary.goals - summary.conceded) / games : 0, opening: results.reduce((total, row) => total + row.opening, 0), comeback: results.reduce((total, row) => total + row.comeback, 0), scoring: streak(row => row.ours > 0), unbeaten: streak(row => row.outcome !== 'L'), winning: streak(row => row.outcome === 'W'), cleanStreak: streak(row => row.clean), highFor: Math.max(0, ...results.map(row => row.ours)), highAgainst: Math.max(0, ...results.map(row => row.against)), biggestWin: Math.max(0, ...results.map(row => row.ours - row.against)) }
  }).filter(row => row.summary.games.length)
  const group = (id: string, title: string, metric: (row: typeof rows[number]) => number, suffix = '', decimals = false, ascending = false, format = (numeric: number) => decimals ? numeric.toFixed(2) : String(numeric)): RecordsLeaderboardGroup => ({ id, title, kind: 'team', applicableFilters: { position: false, team: true }, rows: rank(rows.map(row => ({ id: row.team.id, name: row.team.name, numeric: metric(row), value: `${format(metric(row))}${suffix}`, detail: `${row.summary.games.length} matches · ${row.summary.goals} GF / ${row.summary.conceded} GA` })), ascending) })
  const biggestWin = group('biggest-win', 'Biggest Win', row => row.biggestWin, ' goals')
  biggestWin.rows = biggestWin.rows.filter(row => row.numeric > 0)
  return [
    group('wins', 'Most Wins', row => row.summary.wins, ' wins'), group('win-rate', 'Highest Win Percentage', row => row.winRate, '%', true), group('ppg', 'Highest Points per Match', row => row.ppg, '', true), group('comeback-wins', 'Most Comeback Wins', row => row.comeback, ' wins'), group('win-streak', 'Longest Winning Streak', row => row.winning, ' matches'), group('unbeaten-streak', 'Longest Undefeated Streak', row => row.unbeaten, ' matches'),
    group('team-goals', 'Most Goals', row => row.summary.goals, ' goals'), group('gf-rate', 'Highest GF per Match', row => row.gfPerGame, '', true), group('opening-goals', 'Most Opening Goals', row => row.opening, ' goals'), group('scoring-streak', 'Longest Scoring Streak', row => row.scoring, ' matches'), group('high-score', 'Highest Score in One Match', row => row.highFor, ' goals'), biggestWin,
    group('clean', 'Most Clean Sheets', row => row.summary.cleanSheets, ' CS'), group('clean-rate', 'Highest Clean Sheet Percentage', row => row.cleanRate, '%', true), group('clean-streak', 'Longest Clean Sheet Streak', row => row.cleanStreak, ' matches'), group('ga-rate', 'Lowest Goals Conceded per Match', row => row.gaPerGame, '', true, true), group('opponent-sot-rate', 'Lowest Opponent SOT per Match', row => row.sotPerGame, '', true, true), group('saves', 'Most Team Saves', row => row.summary.saves, ' saves'),
    group('goal-difference', 'Best Goal Difference', row => row.gd, ' GD'), group('goal-difference-per-match', 'Best Goal Difference per Match', row => row.gdPerGame, '', true, false, formatSignedTwoDecimals), group('conceded', 'Most Goals Conceded', row => row.summary.conceded, ' goals'), group('high-conceded', 'Most Conceded in One Match', row => row.highAgainst, ' goals'),
  ]
}

function combinationGroups(players: Player[], teams: Team[], matches: Match[], teamIds: string[]): RecordsLeaderboardGroup[] {
  const direct = new Map<string, { ids: string[]; value: number }>(); const mutual = new Map<string, { ids: string[]; value: number }>(); const bothScored = new Map<string, { ids: string[]; value: number }>(); const bothGA = new Map<string, { ids: string[]; value: number }>()
  for (const match of matches) for (const teamId of new Set(match.appearances.map(row => row.teamId))) {
    if (teamIds.length && !teamIds.includes(teamId)) continue
    const contributors = new Map<string, Set<'g' | 'a'>>()
    const appearanceFor = (id?: string) => match.appearances.find(row => row.playerId === id && row.teamId === teamId)
    for (const event of match.events) {
      if (event.type !== 'goal' || event.ownGoal || event.teamId !== teamId) continue
      const scorer = appearanceFor(event.playerId); const assister = appearanceFor(event.assistPlayerId)
      const validGoal = Boolean(scorer && isPlayerGoalEvent(match, scorer, event))
      const validAssist = Boolean(assister && isPlayerAssistEvent(match, assister, event))
      if (validGoal) contributors.set(event.playerId!, new Set([...(contributors.get(event.playerId!) ?? []), 'g']))
      if (validAssist) contributors.set(event.assistPlayerId!, new Set([...(contributors.get(event.assistPlayerId!) ?? []), 'a']))
      if (validGoal && validAssist) {
        const key = `${event.assistPlayerId}:${event.playerId}`
        direct.set(key, { ids: [event.assistPlayerId!, event.playerId!], value: (direct.get(key)?.value ?? 0) + 1 })
        const unordered = combinationKey([event.assistPlayerId!, event.playerId!])
        mutual.set(unordered, { ids: unordered.split(':'), value: (mutual.get(unordered)?.value ?? 0) + 1 })
      }
    }
    const ids = [...contributors.keys()]
    for (let left = 0; left < ids.length; left++) for (let right = left + 1; right < ids.length; right++) {
      const key = combinationKey([ids[left], ids[right]])
      if (contributors.get(ids[left])?.has('g') && contributors.get(ids[right])?.has('g')) bothScored.set(key, { ids: key.split(':'), value: (bothScored.get(key)?.value ?? 0) + 1 })
      bothGA.set(key, { ids: key.split(':'), value: (bothGA.get(key)?.value ?? 0) + 1 })
    }
  }
  const byId = new Map(players.map(player => [player.id, player])); const name = (pair: CombinationPairPresentation) => pair.playerIds.map(id => playerFullName(byId.get(id))).join(` ${pair.connector} `); const entries = (rows: { ids: string[]; value: number; minutes?: number }[], ascending = false) => rows.filter(row => row.value > 0 || row.minutes).sort((left, right) => (ascending ? left.value - right.value : right.value - left.value) || combinationKey(left.ids).localeCompare(combinationKey(right.ids))); const duo = combinationStats(players, matches, {}, 'duo').filter(row => !teamIds.length || teamIds.includes(row.teamId)).map(row => ({ ids: row.playerIds, value: row.combinedGA })); const cb = combinationStats(players, matches, {}, 'cb').filter(row => (!teamIds.length || teamIds.includes(row.teamId)) && row.togetherMinutes >= 180).map(row => ({ ids: row.playerIds, value: row.weightedOpponentSot / (row.togetherMinutes / 90), minutes: row.togetherMinutes }))
  const group = (id: string, title: string, rows: { ids: string[]; value: number; minutes?: number }[], cbGroup = false, ascending = false): RecordsLeaderboardGroup => ({ id, title, kind: 'combination', applicableFilters: { position: false, team: true }, rows: entries(rows, ascending).map((row, index) => { const combinationPair = combinationPairPresentation(id, row.ids); return { id: `${id}:${combinationPair.directional ? row.ids.join(':') : combinationKey(row.ids)}`, playerIds: row.ids, combinationPair, name: name(combinationPair), numeric: row.value, value: cbGroup ? `${row.value.toFixed(2)} SOT/90 · ${row.minutes}'` : String(row.value), detail: cbGroup ? `${row.minutes}' shared CB minutes` : 'Combination record', rank: index + 1 } }) })
  const units = buildUnitRecords(players, matches, teamIds)
  const teamNameById = new Map(teams.map(team => [team.id, team.shortName ?? team.name]))
  const unitGroup = (id: string, title: string, chosen: UnitRecord[], value: (row: UnitRecord) => number, suffix: string, ascending = false): RecordsLeaderboardGroup => ({
    id, title, kind: 'combination', applicableFilters: { position: false, team: true },
    rows: rank(chosen.map(row => ({ id: row.key, playerIds: row.playerIds, name: `${row.playerIds.map(playerId => playerFullName(byId.get(playerId))).join(' + ')} · ${teamNameById.get(row.teamId) ?? row.teamId}`, numeric: value(row), value: `${value(row).toFixed(2)}${suffix}`, detail: `${teamNameById.get(row.teamId) ?? row.teamId} · ${row.starts} starts · ${row.minutes}' shared · PPG ${row.starts ? ((row.wins * 3 + row.draws) / row.starts).toFixed(2) : '—'}${row.position === 'attack' ? ` · ${row.memberGoals} member goals · Team GF/M ${row.starts ? (row.teamGF / row.starts).toFixed(2) : '—'}` : ''}` })), ascending),
  })
  const positionName = { attack: 'Attack', midfield: 'Midfield', defence: 'Defence' }
  const sizeName = { 2: 'Pair', 3: 'Trio', 4: 'Four' }
  const together: RecordsLeaderboardGroup[] = []
  for (const position of ['attack', 'midfield', 'defence'] as const) for (const size of [2, 3, 4] as const) {
    const selected = units.filter(row => row.position === position && row.size === size)
    const prefix = `Together · ${positionName[position]} ${sizeName[size]}`
    together.push(unitGroup(`together:${position}:${size}:starts`, `${prefix} · Starts`, selected.filter(row => row.starts > 0), row => row.starts, ' starts'))
    together.push(unitGroup(`together:${position}:${size}:minutes`, `${prefix} · Minutes`, selected, row => row.minutes, "'"))
    together.push(unitGroup(`together:${position}:${size}:ppg`, `${prefix} · PPG`, selected.filter(row => row.starts >= 5), row => (row.wins * 3 + row.draws) / row.starts, ' PPG'))
  }
  const best: RecordsLeaderboardGroup[] = []
  for (const size of [2, 3] as const) best.push(unitGroup(`best-unit:attack:${size}:goals`, `Best Attack ${sizeName[size]} · Goals / Match`, units.filter(row => row.position === 'attack' && row.size === size && row.starts >= 5), row => row.memberGoals / row.starts, ' goals/match'))
  for (const size of [2, 3, 4] as const) best.push(unitGroup(`best-unit:midfield:${size}:gd`, `Best Midfield ${sizeName[size]} · GD / Match`, units.filter(row => row.position === 'midfield' && row.size === size && row.starts >= 5), row => (row.teamGF - row.teamGA) / row.starts, ' GD/match'))
  for (const size of [3, 4] as const) {
    const selected = units.filter(row => row.position === 'defence' && row.size === size && row.starts >= 5 && row.minutes > 0)
    best.push(unitGroup(`best-unit:defence:${size}:ga`, `Best Back ${size === 3 ? 'Three' : 'Four'} · Lowest GA/90`, selected, row => row.intervalGA / row.minutes * 90, ' GA/90', true))
    best.push(unitGroup(`best-unit:defence:${size}:sot`, `Best Back ${size === 3 ? 'Three' : 'Four'} · Lowest Opponent SOT/90`, selected, row => row.intervalSOT / row.minutes * 90, ' SOT/90', true))
  }
  const cbGA = unitGroup('cb-ga', 'Best CB Partnership · Lowest GA/90', units.filter(row => row.position === 'cb' && row.minutes >= 180), row => row.intervalGA / row.minutes * 90, ' GA/90', true)
  cbGA.rows = cbGA.rows.map(row => ({ ...row, combinationPair: combinationPairPresentation('cb-ga', row.playerIds!) }))
  return [group('goal-combinations', 'Most Goal Combinations', [...direct.values()]), group('mutual-goal-combinations', 'Most Mutual Goal Combinations', [...mutual.values()]), group('both-scored', 'Most Matches Both Scored', [...bothScored.values()]), group('both-ga', 'Most Matches Both Had G+A', [...bothGA.values()]), group('duo-ga', 'Best Duo Combined G+A', duo), ...together, ...best, group('cb-suppression', 'Best CB Partnership · Shot Suppression', cb, true, true), cbGA]
}
