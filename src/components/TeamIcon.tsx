import { useState, type ReactNode } from 'react'
import type { Team, TeamColor } from '../types'

const colors: Record<TeamColor, string> = { red: '#dc2626', orange: '#f97316', yellow: '#eab308', green: '#16a34a', blue: '#2563eb', indigo: '#4f46e5', purple: '#9333ea', black: '#09090b', white: '#f8fafc' }

/** Team colors remain readable in old records, but new static identity uses the catalog logo. */
export function TeamIcon({ team, children, className = '', showAbbreviation = true }: { team?: Team; children?: ReactNode; className?: string; showAbbreviation?: boolean }) {
  const [failed, setFailed] = useState(false)
  const label = showAbbreviation ? team?.abbreviation : children
  return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-800 ${className}`}>
    {/* The 15% inset keeps a rectangular crest inside the circular safe area. */}
    {team?.logo && !failed && <span className="pointer-events-none absolute inset-[15%] flex items-center justify-center"><img src={team.logo} alt="" decoding="async" onError={() => setFailed(true)} className="block h-full w-full max-h-full max-w-full object-contain object-center" /></span>}
    <span className={`relative z-10 text-[10px] font-bold ${showAbbreviation && team?.logo && !failed ? 'sr-only' : ''}`}>{label}</span>
  </span>
}

/** Compatibility export for legacy jersey UI. */
export function jerseyColor(team?: Team) { return colors[team?.jerseyNumberColor ?? 'white'] }
