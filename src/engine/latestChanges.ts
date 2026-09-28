import { RATING_ENGINE_REVISION } from './ratingRevision'
import { deriveFootballEvents, sortNewsNewestFirst, type DerivedFootballEvent } from './news'
import type { CompetitionState, Match, Player, Team } from '../types'

export type LatestChangeItem = Pick<DerivedFootballEvent, 'id' | 'kind' | 'title' | 'detail' | 'context' | 'emoji' | 'playerId' | 'teamId' | 'matchId' | 'date'> & { category: 'ranking' | 'record' | 'milestone' | 'streak' | 'competition' | 'performance' }
export type LatestChangeGroup = { id: string; date: string; matchId?: string; items: LatestChangeItem[]; playerIds: string[]; teamIds: string[]; title: string; detail: string }
type CacheEntry = { revision: number; value: LatestChangeGroup[] }
const EMPTY_STATES: CompetitionState[] = []
const cache = new WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], Map<string, CacheEntry>>>>>()

function categoryFor(item: DerivedFootballEvent): LatestChangeItem['category'] | undefined {
  if (item.id.startsWith('match-performance:')) return undefined
  if (item.id.startsWith('rank:')) {
    const rank = Number(item.title.match(/#(\d+)/)?.[1] ?? 99)
    return item.importance === 'major' || rank <= 3 ? 'ranking' : undefined
  }
  if (item.id.startsWith('record:')) return 'record'
  if (item.id.startsWith('rare:')) return 'performance'
  if (item.id.startsWith('streak:') || item.id.startsWith('team-win-streak:') || item.id.startsWith('team-unbeaten:') || item.id.startsWith('team-clean-streak:')) return 'streak'
  if (item.id.startsWith('cup-') || item.id.startsWith('champions-') || item.id.startsWith('title:') || item.id.startsWith('double:') || item.id.startsWith('treble:') || item.id.startsWith('award:') || item.id.startsWith('league-lead:')) return 'competition'
  if (item.id.startsWith('milestone:') || item.id.startsWith('career-') || item.id.startsWith('season-') || item.id.startsWith('team-season-')) return 'milestone'
  return undefined
}

const categoryOrder: Record<LatestChangeItem['category'], number> = { competition: 0, record: 1, ranking: 2, performance: 3, streak: 4, milestone: 5 }
function prepared(events: DerivedFootballEvent[], matches: Match[], season?: string): LatestChangeGroup[] {
  const seasonForMatch = new Map(matches.map(match => [match.id, match.season]))
  const grouped = new Map<string, LatestChangeItem[]>()
  for (const event of events) {
    const category = categoryFor(event)
    if (!category || (season && (!event.matchId || seasonForMatch.get(event.matchId) !== season))) continue
    const item: LatestChangeItem = { id: event.id, kind: event.kind, title: event.title, detail: event.detail, context: event.context, emoji: event.emoji, playerId: event.playerId, teamId: event.teamId, matchId: event.matchId, date: event.date, category }
    const key = event.matchId ? `match:${event.matchId}` : `event:${event.id}`
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  const groups = [...grouped.entries()].map(([id, items]) => {
    const ordered = items.slice().sort((left, right) => categoryOrder[left.category] - categoryOrder[right.category] || left.id.localeCompare(right.id))
    const first = ordered[0]
    return { id, date: first.date, matchId: first.matchId, items: ordered, playerIds: [...new Set(ordered.flatMap(item => item.playerId ? [item.playerId] : []))], teamIds: [...new Set(ordered.flatMap(item => item.teamId ? [item.teamId] : []))], title: first.title, detail: ordered.length > 1 ? `${first.detail} · ${ordered.length - 1} more change${ordered.length === 2 ? '' : 's'}` : first.detail }
  })
  return sortNewsNewestFirst(groups, matches)
}

/** Canonical, cached, non-persistent selection of meaningful football changes. */
export function deriveLatestChanges(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = EMPTY_STATES, season?: string): LatestChangeGroup[] {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byTeams = byPlayers.get(players); if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }
  let byStates = byTeams.get(teams); if (!byStates) { byStates = new WeakMap(); byTeams.set(teams, byStates) }
  let bySeason = byStates.get(states); if (!bySeason) { bySeason = new Map(); byStates.set(states, bySeason) }
  const key = season ?? ''
  const cached = bySeason.get(key)
  if (cached?.revision === RATING_ENGINE_REVISION) return cached.value
  const value = prepared(deriveFootballEvents(players, teams, matches, states, { includeAllRanking: true }), matches, season)
  bySeason.set(key, { revision: RATING_ENGINE_REVISION, value })
  return value
}
