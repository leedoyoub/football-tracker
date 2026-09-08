import type { Player, Team } from '../types'
import { TeamIcon } from './TeamIcon'

export function PlayerIcon({ player, team, position, className = 'h-10 w-10 text-[11px]', badges, onClick }: { player?: Player; team?: Team; position?: string; className?: string; badges?: React.ReactNode; onClick?: () => void }) {
  const jerseyNumber = player?.number
  const content = (
    <div className="relative">
      <TeamIcon team={team} className={`${className} font-black shadow-lg`} showAbbreviation={false}>
        <span className="absolute inset-0 overflow-hidden rounded-full">{player?.image && <img src={player.image} alt="" className="h-full w-full object-cover" />}</span>
        <span className="relative z-10" aria-label="Jersey number">{jerseyNumber}</span>
      </TeamIcon>
      {position && <span aria-label="Position" className="pointer-events-none absolute -top-3 right-1/2 z-30 mr-1 whitespace-nowrap text-[9px] font-bold leading-3 text-zinc-100">{position}</span>}
      {badges}
    </div>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={player?.displayName || player?.name} className="text-left">
        {content}
      </button>
    )
  }

  return content
}
