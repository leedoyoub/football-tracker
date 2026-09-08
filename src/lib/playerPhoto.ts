import type { Player } from '../types'

/** Provider-neutral contract for a future explicit “Search Player Photo” flow. */
export type PlayerPhotoSearchResult = {
  externalPlayerId: string | number
  name: string
  teamName?: string
  photoUrl: string
}

/** A photo search result is deliberately photo-only: app and external identities stay unchanged. */
export function selectedPlayerPhoto(result: PlayerPhotoSearchResult): Pick<Player, 'photoUrl'> {
  return { photoUrl: result.photoUrl }
}
