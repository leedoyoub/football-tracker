import type { Player } from '../types'

export function Badge({ children, className = '', colorClass }: { children: React.ReactNode, className?: string, colorClass: string }) {
  return <span className={`flex h-5 min-w-[32px] items-center justify-center rounded-md px-1 text-[9px] font-black ${colorClass} ${className}`}>{children}</span>
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
