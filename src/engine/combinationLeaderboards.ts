import { combinationStats } from './analytics'
import { goalCreditsForTeam } from './partnershipRecords'
import { buildHistoricalParticipation, buildSharedOpportunityCounter, meetsAppearancesShare, meetsMinutesShare, REGULATION_MATCH_MINUTES, uniquePlayedMatches } from './participation'
import { recordsScopedMatches, type RecordsMatchFilters } from './recordsScope'
import { buildUnitRecords, type UnitPosition, type UnitRecord } from './unitRecords'
import { playerFullName } from '../components/ui'
import type { Appearance, Match, Player, Team } from '../types'
import type { CombinationPairPresentation, RecordsLeaderboardGroup, RecordsLeaderboardRow } from '../screens/recordsLeaderboards'

export const partnershipRecordIds = ['goal-combinations', 'mutual-goal-combinations', 'both-scored', 'both-ga', 'duo-ga']
export const defensivePairRecordIds = ['cb-suppression', 'cb-ga']

const positionName = { attack: 'Attack', midfield: 'Midfield', defence: 'Defence' }
const sizeName = { 2: 'Pair', 3: 'Trio', 4: 'Four' }
const points = (row: UnitRecord) => (row.wins * 3 + row.draws) / row.starts
const rate = (value: number, row: UnitRecord) => value / row.minutes * 90

type UnitMetric = {
  id: string; title: string; position: UnitPosition; size: number
  numeric: (row: UnitRecord) => number; suffix: string
  eligible?: 'starts' | 'cb-minutes'; asc?: boolean; sample?: 'starts' | 'overlap'
}

const together: UnitMetric[] = (['attack', 'midfield', 'defence'] as const).flatMap(position => ([2, 3, 4] as const).flatMap(size => {
  const id = `together:${position}:${size}`
  const title = `Together · ${positionName[position]} ${sizeName[size]}`
  return [
    { id: id + ':starts', title: title + ' · Starts', position, size, numeric: (row: UnitRecord) => row.starts, suffix: ' starts' },
    { id: id + ':minutes', title: title + ' · Minutes', position, size, numeric: (row: UnitRecord) => row.minutes, suffix: "'" },
    { id: id + ':ppg', title: title + ' · PPG', position, size, numeric: points, suffix: ' PPG', eligible: 'starts', sample: 'starts' },
  ] satisfies UnitMetric[]
}))

const best: UnitMetric[] = [
  ...([2, 3] as const).map(size => ({ id: `best-unit:attack:${size}:goals`, title: `Best Attack ${sizeName[size]} · Goals / Match`, position: 'attack', size, numeric: (row: UnitRecord) => row.memberGoals / row.starts, suffix: ' goals/match', eligible: 'starts', sample: 'starts' } satisfies UnitMetric)),
  ...([2, 3, 4] as const).map(size => ({ id: `best-unit:midfield:${size}:gd`, title: `Best Midfield ${sizeName[size]} · GD / Match`, position: 'midfield', size, numeric: (row: UnitRecord) => (row.teamGF - row.teamGA) / row.starts, suffix: ' GD/match', eligible: 'starts', sample: 'starts' } satisfies UnitMetric)),
  ...([3, 4] as const).flatMap(size => {
    const prefix = `Best Back ${size === 3 ? 'Three' : 'Four'} · Lowest`
    const id = `best-unit:defence:${size}`
    return [
      { id: id + ':ga', title: prefix + ' GA/90', position: 'defence', size, numeric: (row: UnitRecord) => rate(row.intervalGA, row), suffix: ' GA/90', eligible: 'starts', sample: 'overlap', asc: true },
      { id: id + ':sot', title: prefix + ' Opponent SOT/90', position: 'defence', size, numeric: (row: UnitRecord) => rate(row.intervalSOT, row), suffix: ' SOT/90', eligible: 'starts', sample: 'overlap', asc: true },
    ] satisfies UnitMetric[]
  }),
]

const defensive: UnitMetric[] = [
  { id: 'cb-suppression', title: 'Best CB Partnership · Shot Suppression', position: 'cb', size: 2, numeric: row => rate(row.intervalSOT, row), suffix: ' SOT/90', eligible: 'cb-minutes', sample: 'overlap', asc: true },
  { id: 'cb-ga', title: 'Best CB Partnership · Lowest GA/90', position: 'cb', size: 2, numeric: row => rate(row.intervalGA, row), suffix: ' GA/90', eligible: 'cb-minutes', sample: 'overlap', asc: true },
]

export const combinationBestUnitOptions = best.map(({ id, title }) => ({ id, title }))

const pairRules: Record<string, Pick<CombinationPairPresentation, 'connector' | 'directional'>> = {
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
  const rule = pairRules[leaderboardId]
  if (!rule) throw new Error(`Unknown combination leaderboard: ${leaderboardId}`)
  return { playerIds: [...playerIds], ...rule }
}

type PairCount = { ids: string[]; value: number; teamId?: string }
const unordered = (ids: string[]) => [...ids].sort()
const pairKey = (ids: string[]) => ids.join(':')
const countKey = (ids: string[]) => JSON.stringify(ids)

function goalCounts(matches: Match[], teamIds: string[]) {
  const direct = new Map<string, PairCount>()
  const mutual = new Map<string, PairCount>()
  const bothScored = new Map<string, PairCount>()
  const bothGA = new Map<string, PairCount>()
  const add = (target: Map<string, PairCount>, ids: string[]) => {
    const key = countKey(ids)
    target.set(key, { ids, value: (target.get(key)?.value ?? 0) + 1 })
  }
  for (const match of matches) {
    const appearancesByTeam = new Map<string, Map<string, Appearance>>()
    for (const appearance of match.appearances) {
      if (teamIds.length && !teamIds.includes(appearance.teamId)) continue
      const members = appearancesByTeam.get(appearance.teamId) ?? new Map()
      if (!members.has(appearance.playerId)) members.set(appearance.playerId, appearance)
      appearancesByTeam.set(appearance.teamId, members)
    }
    for (const [teamId, members] of appearancesByTeam) {
      const scorers = new Set<string>()
      const contributors = new Set<string>()
      for (const { scorerId, assisterId } of goalCreditsForTeam(match, teamId, members)) {
        if (scorerId) { contributors.add(scorerId); scorers.add(scorerId) }
        if (assisterId) contributors.add(assisterId)
        if (scorerId && assisterId && scorerId !== assisterId) {
          add(direct, [assisterId, scorerId])
          add(mutual, unordered([assisterId, scorerId]))
        }
      }
      const ids = [...contributors].sort()
      for (let left = 0; left < ids.length; left++) for (let right = left + 1; right < ids.length; right++) {
        const pair = [ids[left], ids[right]]
        if (pair.every(id => scorers.has(id))) add(bothScored, pair)
        add(bothGA, pair)
      }
    }
  }
  return [direct, mutual, bothScored, bothGA].map(map => [...map.values()])
}

function group(id: string, title: string, rows: RecordsLeaderboardRow[]): RecordsLeaderboardGroup {
  return { id, title, kind: 'combination', applicableFilters: { position: false, team: true }, rows }
}

type Unranked = Omit<RecordsLeaderboardRow, 'rank'>
function rank(rows: Unranked[], ascending = false, tieOrder = (a: Unranked, b: Unranked) => a.name.localeCompare(b.name)) {
  const sorted = rows.sort((a, b) => (ascending ? a.numeric - b.numeric : b.numeric - a.numeric) || tieOrder(a, b))
  let priorRank = 0
  return sorted.map((row, i) => {
    const rank = i > 0 && sorted[i - 1].numeric === row.numeric ? priorRank : i + 1
    priorRank = rank
    return { ...row, rank }
  })
}

export function combinationGroups(players: Player[], teams: Team[], history: Match[], scope: RecordsMatchFilters, selectedIds?: string[]): RecordsLeaderboardGroup[] {
  const wanted = selectedIds && new Set(selectedIds)
  const needs = (id: string) => !wanted || wanted.has(id)
  const { teamIds } = scope
  const scoped = recordsScopedMatches(history, scope, 'combination')
  const matches = new Set(scoped.map(match => match.id)).size === scoped.length ? scoped : uniquePlayedMatches(scoped)
  const byId = new Map(players.map(player => [player.id, player]))
  const teamNames = new Map(teams.map(team => [team.id, team.shortName ?? team.name]))
  const nameOf = (ids: string[], connector: string) => ids.map(id => playerFullName(byId.get(id))).join(` ${connector} `)

  const pairGroup = (id: string, title: string, counts: PairCount[]) => group(id, title, rank(
    counts.filter(row => row.value > 0).map(row => {
      const combinationPair = combinationPairPresentation(id, row.ids)
      const pair = pairKey(combinationPair.directional ? row.ids : unordered(row.ids))
      const team = row.teamId ? teamNames.get(row.teamId) ?? row.teamId : undefined
      return {
        id: `${id}:${pair}${row.teamId ? ':' + row.teamId : ''}`,
        playerIds: row.ids,
        combinationPair,
        ...(row.teamId ? { combinationTeamId: row.teamId } : {}),
        name: nameOf(row.ids, combinationPair.connector),
        numeric: row.value,
        value: String(row.value),
        detail: team ?? 'Combination record',
      }
    }),
    false,
    (a, b) => pairKey(unordered(a.playerIds!)).localeCompare(pairKey(unordered(b.playerIds!))) || (a.combinationTeamId ?? '').localeCompare(b.combinationTeamId ?? ''),
  ))

  const [direct = [], mutual = [], bothScored = [], bothGA = []] = partnershipRecordIds.slice(0, 4).some(needs) ? goalCounts(matches, teamIds) : []
  const duo = needs('duo-ga') ? combinationStats(players, matches, {}, 'duo')
    .filter(row => !teamIds.length || teamIds.includes(row.teamId))
    .map(row => ({ ids: row.playerIds, value: row.combinedGA, teamId: row.teamId })) : []
  const pairs = [
    pairGroup('goal-combinations', 'Most Goal Combinations', direct),
    pairGroup('mutual-goal-combinations', 'Most Mutual Goal Combinations', mutual),
    pairGroup('both-scored', 'Most Matches Both Scored', bothScored),
    pairGroup('both-ga', 'Most Matches Both Had G+A', bothGA),
    pairGroup('duo-ga', 'Best Duo Combined G+A', duo),
  ].filter(metric => needs(metric.id))

  const metrics = [...together, ...best, ...defensive].filter(metric => needs(metric.id))
  if (!metrics.length) return pairs
  const requested = new Set(metrics.map(metric => `${metric.position}:${metric.size}`))
  const units = buildUnitRecords(players, matches, teamIds, requested, true)
  const count = metrics.some(metric => metric.eligible) ? buildSharedOpportunityCounter(
    buildHistoricalParticipation(history),
    players,
    recordsScopedMatches(history, { ...scope, teamIds: [] }, 'combination'),
  ) : undefined

  return [...pairs, ...metrics.map(metric => {
    const rows = units.filter(row => {
      if (row.position !== metric.position || row.size !== metric.size) return false
      if (!metric.eligible) return metric.id.endsWith(':starts') ? row.starts > 0 : true
      const opportunities = count!(row.playerIds, row.teamId)
      return metric.eligible === 'starts' ? meetsAppearancesShare(row.starts, opportunities) :
        meetsMinutesShare(row.minutes, opportunities * REGULATION_MATCH_MINUTES, 20)
    }).map(row => {
      const numeric = metric.numeric(row)
      const team = teamNames.get(row.teamId) ?? row.teamId
      const pair = row.position === 'cb' ? combinationPairPresentation(metric.id, row.playerIds) : undefined
      const sample = row.overlapMatches ?? 0
      const sampleLabel = metric.sample === 'overlap' ? `${sample} ${sample === 1 ? 'match' : 'matches'} · ` : ''
      const timeLabel = row.position === 'cb' ? 'shared CB minutes' : 'shared'
      const minutes = `${Number(row.minutes.toFixed(2))}' ${timeLabel}`
      const starts = row.position === 'cb' ? '' : `${row.starts} starts · `
      const ppg = row.position === 'cb' ? '' : ` · PPG ${row.starts ? points(row).toFixed(2) : '—'}`
      const attack = row.position === 'attack' ? ` · ${row.memberGoals} member goals · Team GF/M ${row.starts ? (row.teamGF / row.starts).toFixed(2) : '—'}` : ''
      const value = metric.id === 'cb-suppression' ? `${numeric.toFixed(2)}${metric.suffix} · ${row.minutes}'` : `${numeric.toFixed(2)}${metric.suffix}`
      return {
        id: row.key,
        playerIds: row.playerIds,
        combinationTeamId: row.teamId,
        ...(pair ? { combinationPair: pair } : {}),
        name: `${nameOf(row.playerIds, metric.id === 'cb-suppression' ? '&' : '+')} · ${team}`,
        numeric,
        value,
        detail: `${team} · ${sampleLabel}${starts}${minutes}${ppg}${attack}`,
      }
    })
    return group(metric.id, metric.title, rank(rows, metric.asc))
  })]
}
