import type { View } from '../types'

/** Removes Edit Player when returning to its existing detail route. */
export function popPlayerEditHistory(history: View[], playerId: string): View[] {
  const previous = history[history.length - 2]
  return previous?.name === 'player' && previous.id === playerId ? history.slice(0, -1) : [{ name: 'player', id: playerId }]
}
