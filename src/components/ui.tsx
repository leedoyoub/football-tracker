import type { Player, Team } from '../types'
import { PlayerIcon } from './PlayerIcon'

export function Badge({ children, className = '', colorClass, size = 'default' }: { children: React.ReactNode, className?: string, colorClass: string, size?: 'default' | 'large' }) {
  const sizeClasses = size === 'large' ? 'h-5 min-w-[28px] px-1 text-[8px]' : 'h-4 min-w-[25px] px-0.5 text-[7px]'
  return <span className={`flex items-center justify-center rounded-[4px] font-black ${sizeClasses} ${colorClass} ${className}`}>{children}</span>
}

export function SubstitutePlayerCard({ player, team, rating, stats, onClick }: { player: Player, team?: Team, rating?: number, stats?: { goals: number, assists: number }, onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 flex-col items-center rounded-lg bg-zinc-900 p-1 text-center">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <PlayerIcon player={player} team={team} className="h-10 w-10 text-[10px]" />
        {rating !== undefined && (
          <Badge colorClass={ratingTone(rating)} className="absolute -right-1 -top-1 z-30 shadow-lg" size="large">
            {rating.toFixed(1)}
          </Badge>
        )}
      </div>
      <span className="mt-1 w-full truncate text-[9px] font-semibold">{playerDisplayName(player)}</span>
      <StatIcons goals={stats?.goals ?? 0} assists={stats?.assists ?? 0} className="text-[8px] text-zinc-400" />
    </button>
  )
}

export function playerDisplayName(player?: Player): string {
  return player?.displayName?.trim() || player?.name || ''
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
  if (rating >= 7.3) return 'text-emerald-400'
  if (rating >= 6) return 'text-orange-400'
  return 'text-red-400'
}

export function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
