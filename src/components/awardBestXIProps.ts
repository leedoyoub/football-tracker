import type { Best11Slot } from '../types'

export type AwardBestXIResult = {
  bestXI: Best11Slot[]
  bestPlayerId?: string
  statsByPlayer: Record<string, { goals: number; assists: number; avgRating?: number }>
}

/** Maps a scoped result onto the established Season Best XI pitch treatment. */
export function awardBestXIProps(result: AwardBestXIResult) {
  return { slots: result.bestXI, statsByPlayer: result.statsByPlayer, motmPlayerId: result.bestPlayerId, layout: 'free' as const, showPositionBadge: false }
}
