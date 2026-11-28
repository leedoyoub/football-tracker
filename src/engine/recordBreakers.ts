import type { Match, Player, Team } from '../types'
import { arrayItemRevision } from './arrayItemRevision'
import { oldestMatches } from './matchChronology'
import { careerPerformanceRows, buildPlayerRecordLeaderboards } from './playerRecords'
import { RECORDS_POLICY_REVISION, uniquePlayedMatches } from './participation'
import { teamHistoricMatchRecords } from './teamHistoricMatches'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { MOM_POLICY_REVISION } from './momPolicy'

export type RecordBreaker = {
  recordId: string; title: string; kind: 'player' | 'team'; entityId: string
  match: Match; teamId: string; previous: number; value: number; tied: boolean
}
type Mark = Omit<RecordBreaker, 'previous' | 'tied' | 'match'> & { cumulative?: boolean }
const cache = new WeakMap<Match[], WeakMap<Player[], { teams: Team[] | undefined; revision: string; rows: RecordBreaker[] }>>()

/** Replay saved matches in chronology. Each record keeps only its running high
 * and tie holders. Edits rebuild history with the original achievement dates. */
export function recordBreakers(players: Player[], matches: Match[], teams?: Team[]): RecordBreaker[] {
  let byPlayer = cache.get(matches)
  if (!byPlayer) { byPlayer = new WeakMap(); cache.set(matches, byPlayer) }
  const revision = [RECORDS_POLICY_REVISION, RATING_ENGINE_REVISION, MOM_POLICY_REVISION, arrayItemRevision(players), arrayItemRevision(matches), teams && arrayItemRevision(teams)].join(':')
  const cached = byPlayer.get(players)
  if (cached?.teams === teams && cached?.revision === revision) return cached.rows

  const marks = new Map<string, Mark[]>()
  const add = (id: string, mark: Mark) => {
    if (mark.value <= 0) return
    const rows = marks.get(id) ?? []
    rows.push(mark)
    marks.set(id, rows)
  }
  const careerIds = [['goals', 'Most Goals'], ['assists', 'Most Assists'], ['appearances', 'Most Appearances'], ['mom', 'Most MOM']] as const
  for (const player of careerPerformanceRows(players, matches)) {
    for (const { match, teamId, goals, assists, mom } of player.matches) {
      const values = { goals, assists, appearances: 1, mom: Number(mom) }
      for (const [recordId, title] of careerIds) add(match.id, { recordId, title, kind: 'player', entityId: player.playerId, teamId, value: values[recordId], cumulative: true })
    }
  }
  for (const group of buildPlayerRecordLeaderboards(players, matches, {}, ['highest-goals', 'highest-assists', 'highest-ga', 'highest-rating', 'highest-saves'])) {
    for (const row of group.rows) {
      if (row.matchId && row.teamIds?.[0]) add(row.matchId, { recordId: group.id, title: group.title, kind: 'player', entityId: row.playerId, teamId: row.teamIds[0], value: row.numeric })
    }
  }
  for (const group of teamHistoricMatchRecords(matches, teams?.map(team => team.id))) {
    for (const row of group.rows) add(row.match.id, { recordId: group.id, title: group.title, kind: 'team', entityId: row.teamId, teamId: row.teamId, value: row.numeric })
  }

  const highs = new Map<string, { value: number; holders: Set<string> }>()
  const totals = new Map<string, number>()
  const history: RecordBreaker[] = []
  for (const match of oldestMatches(uniquePlayedMatches(matches))) {
    const batch = new Map<string, Mark[]>()
    for (const mark of marks.get(match.id) ?? []) {
      if (mark.cumulative) {
        const key = JSON.stringify([mark.recordId, mark.entityId])
        const total = (totals.get(key) ?? 0) + mark.value
        totals.set(key, total)
        mark.value = total
      }
      const entries = batch.get(mark.recordId) ?? []
      entries.push(mark)
      batch.set(mark.recordId, entries)
    }
    for (const [id, entries] of batch) {
      const maximum = Math.max(...entries.map(mark => mark.value))
      const leaders = entries.filter(mark => mark.value === maximum)
      const previous = highs.get(id)
      if (!previous || maximum > previous.value) {
        if (previous) for (const { cumulative: _cumulative, ...leader } of leaders) history.push({ ...leader, match, previous: previous.value, tied: false })
        highs.set(id, { value: maximum, holders: new Set(leaders.map(leader => leader.entityId)) })
      } else if (maximum === previous.value) {
        for (const { cumulative, ...leader } of leaders) {
          if (cumulative && previous.holders.has(leader.entityId)) continue
          previous.holders.add(leader.entityId)
          history.push({ ...leader, match, previous: previous.value, tied: true })
        }
      }
    }
  }
  const rows = history.reverse()
  byPlayer.set(players, { teams, revision, rows })
  return rows
}
