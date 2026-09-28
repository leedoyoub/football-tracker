import { PlayerIdentityAction } from './EntityActions'
import type { Player, View } from '../types'
import type { CombinationPairPresentation } from '../screens/recordsLeaderboards'

/** Shared Records pair renderer: player entities stay independent from the relationship symbol. */
export function CombinationPairIdentity({ pair, playerById, onNavigate }: { pair: CombinationPairPresentation; playerById: Map<string, Player>; onNavigate: (view: View) => void }) {
  return <span data-combination-pair className="flex min-w-0 items-center gap-1 overflow-hidden">{pair.playerIds.map((id, index) => { const player = playerById.get(id); return <span key={id} className="flex min-w-0 items-center gap-1">{index > 0 && <span data-combination-connector aria-hidden="true" className="shrink-0 text-[10px] font-medium text-zinc-500">{pair.connector}</span>}<PlayerIdentityAction player={player} onNavigate={player ? playerId => onNavigate({ name: 'player', id: playerId }) : undefined} className="min-w-0 truncate text-left font-semibold" avatarClassName="hidden">{player?.displayName ?? player?.name ?? 'Unknown player'}</PlayerIdentityAction></span> })}</span>
}
