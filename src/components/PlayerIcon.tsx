import type { Player, Team } from '../types'
import { PlayerAvatar } from './PlayerAvatar'

/** Shared avatar circle; surrounding score, state and drag UI remains caller-owned. */
export function PlayerIcon({ player, team: _team, position, className = 'h-10 w-10 text-[11px]', badges, onClick }: { player?: Player; team?: Team; position?: string; className?: string; badges?: React.ReactNode; onClick?: () => void }) {
  const photoUrl = player?.photoUrl || player?.image
  // PlayerAvatar owns loading="lazy" and onError so every surface has the same fallback behavior.
  const content = <div className="relative"><PlayerAvatar photoUrl={photoUrl} number={player?.number} className={className} />{!photoUrl && <span aria-label="Jersey number" className="sr-only">{player?.number ?? '—'}</span>}{position && <span aria-label="Position" className="pointer-events-none absolute -top-3 right-1/2 z-30 mr-1 whitespace-nowrap text-[9px] font-bold leading-3 text-zinc-100">{position}</span>}{badges}</div>
  return onClick ? <button type="button" onClick={onClick} aria-label={player?.displayName || player?.name} className="text-left">{content}</button> : content
}
