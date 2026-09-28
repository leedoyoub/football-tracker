import type { ReactNode } from 'react'
import { PlayerAvatar } from './PlayerAvatar'
import { TeamIcon } from './TeamIcon'
import { playerFullName } from './ui'
import type { Player, Team } from '../types'

export function TeamIdentityAction({ team, onNavigate, className = '', iconClassName = 'h-7 w-7 text-[7px]', children }: { team?: Team; onNavigate?: (teamId: string) => void; className?: string; iconClassName?: string; children?: ReactNode }) {
  const content = children ?? <TeamIcon team={team} className={iconClassName} />
  if (!team || !onNavigate) return <span className={className}>{content}</span>
  return <button type="button" aria-label={`Open ${team.name} team details`} onClick={() => onNavigate(team.id)} className={`rounded-md text-left transition-colors active:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${className}`}>{content}</button>
}

export function PlayerIdentityAction({ player, onNavigate, className = '', avatarClassName = 'h-9 w-9 text-[9px]', children }: { player?: Player; onNavigate?: (playerId: string) => void; className?: string; avatarClassName?: string; children?: ReactNode }) {
  const content = children ?? <PlayerAvatar photoUrl={player?.photoUrl || player?.image} number={player?.number} className={avatarClassName} />
  if (!player || !onNavigate) return <span className={className}>{content}</span>
  return <button type="button" aria-label={`Open ${playerFullName(player)} player details`} onClick={() => onNavigate(player.id)} className={`rounded-md text-left transition-colors active:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${className}`}>{content}</button>
}
