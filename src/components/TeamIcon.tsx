import type { ReactNode } from 'react'
import type { Team, TeamColor } from '../types'

const colors: Record<TeamColor, string> = { red: '#dc2626', orange: '#f97316', yellow: '#eab308', green: '#16a34a', blue: '#2563eb', indigo: '#4f46e5', purple: '#9333ea', black: '#09090b', white: '#f8fafc' }

export function TeamIcon({ team, children, className = '' }: { team?: Team; children?: ReactNode; className?: string }) {
  const primary = team?.primaryColor ? colors[team.primaryColor] : team?.color ?? colors.green; const secondary = colors[team?.secondaryColor ?? 'white']; const striped = team?.visualStyle === 'striped'
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`} style={{ background: striped ? undefined : primary }}>
      <span className="absolute inset-0 flex">{striped && <><i className="flex-1" style={{ background: primary }} /><i className="flex-1" style={{ background: secondary }} /><i className="flex-1" style={{ background: primary }} /></>}</span>
      <span className="relative z-10 text-[10px] font-bold" style={{ color: jerseyColor(team) }}>
        {team?.abbreviation ?? children}
      </span>
    </span>
  )
}

export function jerseyColor(team?: Team) { return colors[team?.jerseyNumberColor ?? 'white'] }
