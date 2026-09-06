import { useStore } from '../store'
import { TeamIcon } from '../components/TeamIcon'
import type { View } from '../types'

export function TeamsScreen({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { teams, players, matches } = useStore()
  return (
    <div className="px-4 pb-8 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'new-team' })}
          className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black"
        >
          Add
        </button>
      </div>
      <div className="space-y-3">
        {teams.map((team) => {
          const squad = players.filter((p) => (p.teamIds ?? [p.teamId]).includes(team.id)).length
          const played = matches.filter(
            (m) => m.homeTeamId === team.id || m.awayTeamId === team.id,
          ).length
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => onNavigate({ name: 'team', id: team.id })}
              className="flex w-full items-center gap-3 rounded-2xl bg-zinc-900 p-3 text-left"
            >
              <TeamIcon team={team} className="h-12 w-12 text-sm font-black">{team.shortName.slice(0, 3)}</TeamIcon>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{team.name}</span>
                <span className="text-[11px] text-zinc-400">
                  {squad} players · {played} matches
                </span>
              </span>
              <span className="text-zinc-500">›</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
