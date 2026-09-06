import type { Player, Team } from '../types'
import { TeamIcon, jerseyColor } from './TeamIcon'

export function PlayerIcon({ player, team, className = 'h-10 w-10 text-[11px]' }: { player?: Player; team?: Team; className?: string }) {
  return <TeamIcon team={team} className={`${className} font-black shadow-lg`}><span className="absolute inset-0 overflow-hidden rounded-full">{player?.image && <img src={player.image} alt="" className="h-full w-full object-cover" />}</span><span className="relative z-10" style={{ color: jerseyColor(team) }}>{player?.number}</span></TeamIcon>
}
