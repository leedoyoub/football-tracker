import type { Team } from '../types'
import { TeamIcon } from './TeamIcon'

/** Interactive team identity for surfaces that are not already inside another button. */
export function TeamLink({ team, compact, onNavigate }: { team?: Team; compact?: boolean; onNavigate: (teamId: string) => void }) {
  if (!team) return <span className="text-zinc-500">Unknown team</span>
  return <button type="button" onClick={() => onNavigate(team.id)} className="flex min-w-0 items-center gap-1.5 rounded-md py-1 text-left hover:text-emerald-300"><TeamIcon team={team} className="h-4 w-4 text-[6px]" /><span className="truncate font-semibold">{compact ? team.shortName : team.name}</span></button>
}
