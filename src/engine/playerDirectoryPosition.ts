import type { Match, Player } from '../types'
import { matchesWithPlayerAppearance } from './playerMatchFacts'
import { scopedPositionFamilyByPlayer, type PositionScope, type PositionFamily } from './positionScope'
import { RATING_ENGINE_REVISION } from './ratingRevision'
const cache = new WeakMap<Match[], WeakMap<Player, Map<string, PositionFamily | undefined>>>()
/** Unfiltered virtual directories only need roles for the cards that are rendered. */
export function playerDirectoryPosition(player: Player, matches: Match[], scope: PositionScope): PositionFamily | undefined {
  let players = cache.get(matches); if (!players) { players = new WeakMap(); cache.set(matches, players) }
  let scopes = players.get(player); if (!scopes) { scopes = new Map(); players.set(player, scopes) }
  const key = JSON.stringify([RATING_ENGINE_REVISION, scope.seasons ?? [], scope.teams ?? [], scope.fallback])
  if (scopes.has(key)) return scopes.get(key)
  const value = scopedPositionFamilyByPlayer([player], matchesWithPlayerAppearance(player.id, matches), scope).get(player.id)
  if (scopes.size >= 24) scopes.delete(scopes.keys().next().value!)
  scopes.set(key, value)
  return value
}
