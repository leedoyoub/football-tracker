import type { Player, Team } from '../types'
import { PlayerIcon } from './PlayerIcon'
import { GOOD_RATING_THRESHOLD } from '../engine/constants'

export function Badge({ children, className = '', colorClass, size = 'default' }: { children: React.ReactNode, className?: string, colorClass: string, size?: 'default' | 'large' }) {
  const sizeClasses = size === 'large' ? 'h-[18px] min-w-[25px] px-0.5 text-[8px]' : 'h-[15px] min-w-[23px] px-0.5 text-[7px]'
  return <span className={`flex items-center justify-center rounded-[4px] font-black ${sizeClasses} ${colorClass} ${className}`}>{children}</span>
}

export function SubstitutionMarker({ direction, minute }: { direction: 'in' | 'out'; minute: number }) {
  return <span aria-label={`Substitution ${direction} at ${minute} minutes`} className={`whitespace-nowrap text-[9px] font-bold ${direction === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>{direction === 'in' ? `\u2192 IN ${minute}'` : `\u2190 OUT ${minute}'`}</span>
}

export function SubstitutionSelection({ direction }: { direction: 'in' | 'out' }) {
  return <span className={`pointer-events-none whitespace-nowrap text-[9px] font-bold ${direction === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>{direction === 'out' ? '\u2190 OUT' : '\u2192 IN'}</span>
}

export const ratingBadgeColor = (rating: number) => rating >= GOOD_RATING_THRESHOLD ? 'bg-emerald-500 text-white' : rating >= 6 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'

export function SubstitutePlayerCard({ player, team, rating, stats, position, inMinute, outMinute, showRating = true, selection, onClick }: { player: Player, team?: Team, rating?: number, stats?: { goals: number, assists: number }, position?: string, inMinute?: number, outMinute?: number, showRating?: boolean, selection?: 'in' | 'out', onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={playerDisplayName(player)} className={`flex w-full min-w-0 flex-col items-center rounded-lg bg-zinc-900 px-1 pb-2 pt-5 text-center transition-transform ${selection ? 'relative z-10 scale-105' : ''}`}>
      <div className="relative flex h-10 w-10 items-center justify-center">
        <PlayerIcon player={player} team={team} position={position ?? player.position} className="h-10 w-10 text-[11px]" />
        {showRating && (
          <Badge colorClass={rating === undefined ? 'bg-zinc-700 text-zinc-300' : ratingBadgeColor(rating)} className="absolute -right-3 -top-3 z-30 shadow-lg" size="large">
            {rating === undefined ? '-' : rating.toFixed(1)}
          </Badge>
        )}
      </div>
      {stats && <StatIcons goals={stats.goals} assists={stats.assists} className="relative z-10 rounded-full bg-black/80 px-1 text-[8px] text-white" />}
      <span className="relative z-10 -mt-0.5 h-4 max-w-full truncate rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold leading-tight">{playerCompactName(player)}</span>
      {selection && <SubstitutionSelection direction={selection} />}
      {inMinute !== undefined && <SubstitutionMarker direction="in" minute={inMinute} />}
      {outMinute !== undefined && <SubstitutionMarker direction="out" minute={outMinute} />}
    </button>
  )
}

export function playerFullName(player?: Player): string {
  return player?.fullName?.trim() || player?.name || ''
}

export function playerDisplayName(player?: Player): string {
  return player?.displayName?.trim() || player?.name || ''
}

/** Display Name stays compact, while the jersey number remains available for match identification. */
export function playerCompactName(player?: Player): string {
  const name = playerDisplayName(player)
  return player?.number === undefined || player?.number === null ? name : `${player.number} ${name}`
}

export function GoalIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-label="Goal" className={`${className} fill-none stroke-current stroke-2`}><circle cx="12" cy="12" r="9" /><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Zm-6 4 3 1m9-1 3 1m-10 8 1-3m2 3-1-3" /></svg>
}

export function AssistIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-label="Assist" className={`${className} fill-none stroke-current stroke-2`}><path d="M4 15.5c2.5-2.8 5.2-4.6 8.1-5.4l3.2.8 3.1 3.1-1.9 2.7-4.1.2-2.2 2.3-4.8-.4L4 15.5Z" /><path d="m12.1 10.1 1.1-3 2.2.5 1.1 3.3M7.4 14.5l1.8 1.1" /></svg>
}

export function StatIcons({ goals, assists, className = '' }: { goals: number; assists: number; className?: string }) {
  if (!goals && !assists) return null
  return <span className={`flex items-center gap-1 ${className}`}>{goals > 0 && <span className="flex items-center gap-0.5"><GoalIcon />{goals}</span>}{assists > 0 && <span className="flex items-center gap-0.5"><AssistIcon />{assists}</span>}</span>
}

export function ratingTone(rating: number) {
  if (rating >= GOOD_RATING_THRESHOLD) return 'text-emerald-400'
  if (rating >= 6) return 'text-orange-400'
  return 'text-red-400'
}

export function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
