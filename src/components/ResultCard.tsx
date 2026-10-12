import { TeamIdentityAction } from './EntityActions'
import type { DerivedResult } from '../lib/results'
import type { Team } from '../types'
import { resultCompetitionLabel } from '../lib/competitionResults'
const tone = { W: 'bg-emerald-500/15 text-emerald-300', D: 'bg-yellow-500/15 text-yellow-300', L: 'bg-red-500/15 text-red-300' }
const matchAction = 'min-h-9 rounded-md active:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300'

export function ResultCard({ result, teams, onMatchNavigate, onTeamNavigate, showCompetition = false }: { result: DerivedResult; teams: Team[]; onMatchNavigate: () => void; onTeamNavigate?: (teamId: string) => void; showCompetition?: boolean }) {
  const team = teams.find(item => item.id === result.teamId)
  const metadata = resultCompetitionLabel(result.match)
  const matchLabel = `Open ${metadata}, ${result.teamName}, ${result.goalsFor} to ${result.goalsAgainst}, match details`
  return <div className="flex w-full items-center gap-2 rounded-xl border border-white/5 bg-zinc-900 px-3 py-2.5">
    <TeamIdentityAction team={team} onNavigate={onTeamNavigate} className="grid min-h-9 shrink-0 place-items-center" iconClassName="h-8 w-8 text-[8px]" />
    <div className="min-w-0 flex-1">
      <TeamIdentityAction team={team} onNavigate={onTeamNavigate} className="block w-full truncate text-sm font-bold">{result.teamName}</TeamIdentityAction>
      <button type="button" onClick={onMatchNavigate} aria-label={matchLabel} className={`${matchAction} block w-full truncate text-left text-[11px] text-zinc-400`}>
        {showCompetition ? metadata : metadata.replace(/^(League|Cup|Champions) · /, '')}
      </button>
    </div>
    <button type="button" onClick={onMatchNavigate} aria-label={matchLabel} className={`${matchAction} flex shrink-0 items-center gap-2`}>
      <b className="whitespace-nowrap text-sm tabular-nums">{result.goalsFor} - {result.goalsAgainst}</b>
      <span className={`rounded-md px-2 py-1 text-[10px] font-black ${tone[result.outcome]}`}>{result.outcome}</span>
    </button>
  </div>
}
