import type { Best11Slot, Match, Player } from '../types'
import { isRecordedForTeam } from './matchPerspective'
import { positionFamily, positionMinutesByPlayer, type PositionFamily } from './positionScope'

/** Presentation only: preserve selected slot/player facts and use the same
 * credited-minute cache as selection. No new timeline or retained index. */
export function placeTeamHistoryPlayers(slots: Best11Slot[], players: Player[], games: Match[], teamId: string): Best11Slot[] {
  const eligibleGroups = (['DEF', 'MID'] as const).filter(group => slots.filter(slot => slot.displayPosition === group).length >= 4)
  if (!eligibleGroups.length) return slots
  const teamGames = games.every(match => isRecordedForTeam(match, teamId)) ? games : games.filter(match => isRecordedForTeam(match, teamId))
  const minutes = positionMinutesByPlayer(players, teamGames, { teams: [teamId] })
  const result = slots.slice()
  for (const group of eligibleGroups) {
    const indices = slots.flatMap((slot, index) => slot.displayPosition === group ? [index] : [])
    const selected = indices.map(index => slots[index])
    const [leftFamily, rightFamily]: PositionFamily[] = group === 'DEF' ? ['LB', 'RB'] : ['LM', 'RM']
    const weights = selected.map(slot => {
      let left = 0, right = 0
      for (const [position, value] of minutes.get(slot.playerId ?? '') ?? []) {
        const family = positionFamily(position)
        if (family === leftFamily) left += value
        if (family === rightFamily) right += value
      }
      return { left, right }
    })
    // Exhaustive at most 11x11 distinct edge assignments, including an absent
    // edge. Maximum combined actual wing minutes wins; selection order, then
    // player ID, makes equal assignments deterministic.
    const choices = (side: 'left' | 'right') => [-1, ...weights.flatMap((weight, index) => weight[side] > 0 ? [index] : [])]
    const assignments = choices('left').flatMap(left => choices('right').flatMap(right => left !== -1 && left === right ? [] : [{ left, right, score: (weights[left]?.left ?? 0) + (weights[right]?.right ?? 0) }]))
    const order = (index: number) => index < 0 ? selected.length : index
    const best = assignments.sort((a, b) => b.score - a.score || order(a.left) - order(b.left) || order(a.right) - order(b.right) || (selected[a.left]?.playerId ?? '').localeCompare(selected[b.left]?.playerId ?? '') || (selected[a.right]?.playerId ?? '').localeCompare(selected[b.right]?.playerId ?? ''))[0]
    if (!best.score) continue
    const arranged: Best11Slot[] = Array(selected.length)
    if (best.left >= 0) arranged[0] = selected[best.left]
    if (best.right >= 0) arranged[arranged.length - 1] = selected[best.right]
    const middle = selected.filter((_, index) => index !== best.left && index !== best.right)
    for (let index = 0; index < arranged.length; index++) if (!arranged[index]) arranged[index] = middle.shift()!
    indices.forEach((index, offset) => { result[index] = arranged[offset] })
  }
  return result
}
