import { useState } from 'react'
import type { Player, Team } from '../types'

/** Shared avatar circle; surrounding score, state and drag UI remains caller-owned. */
export function PlayerIcon({ player, team: _team, position, className = 'h-10 w-10 text-[11px]', badges, onClick }: { player?: Player; team?: Team; position?: string; className?: string; badges?: React.ReactNode; onClick?: () => void }) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const photoUrl = player?.photoUrl || player?.image
  const showPhoto = Boolean(photoUrl) && !photoFailed
  const content = <div className="relative"><span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-700 text-white ${className}`}>{showPhoto && <img src={photoUrl} alt="" loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} className="absolute inset-0 h-full w-full object-cover object-center" />}{!showPhoto && <span className="relative z-10 font-black" aria-label="Jersey number">{player?.number ?? '—'}</span>}</span>{position && <span aria-label="Position" className="pointer-events-none absolute -top-3 right-1/2 z-30 mr-1 whitespace-nowrap text-[9px] font-bold leading-3 text-zinc-100">{position}</span>}{badges}</div>
  return onClick ? <button type="button" onClick={onClick} aria-label={player?.displayName || player?.name} className="text-left">{content}</button> : content
}
