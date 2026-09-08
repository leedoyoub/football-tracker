import type { Player } from '../types'

/** Provider-neutral contract for a future explicit “Search Player Photo” flow. */
export type PlayerPhotoSearchResult = {
  externalPlayerId: string | number
  name: string
  teamName?: string
  photoUrl: string
}

/** Only an explicitly selected result may connect an external identity to a player. */
export function selectedPlayerPhoto(result: PlayerPhotoSearchResult): Pick<Player, 'externalPlayerId' | 'photoUrl'> {
  return { externalPlayerId: result.externalPlayerId, photoUrl: result.photoUrl }
}
