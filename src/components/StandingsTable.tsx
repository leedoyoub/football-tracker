import type { Team } from '../types'
import type { Standing } from '../engine/standings'
import { TeamIcon } from './TeamIcon'

export function StandingsTable({ standings, teams, compact = false }: { standings: Standing[]; teams: Team[]; compact?: boolean }) {
  const byId = Object.fromEntries(teams.map((team) => [team.id, team]))
  return <div className="overflow-hidden rounded-xl bg-zinc-900">
    <table className="w-full table-fixed text-[10px] tabular-nums">
      <thead className="border-b border-white/10 text-zinc-500"><tr>
        <th className="w-7 py-2 text-center font-semibold">#</th><th className="text-left font-semibold">Team</th>
        <th className="w-6 text-center font-semibold">P</th><th className="w-6 text-center font-semibold">W</th><th className="w-6 text-center font-semibold">D</th><th className="w-6 text-center font-semibold">L</th>
        <th className="w-11 text-center font-semibold">GF-GA</th><th className="w-8 text-center font-semibold">GD</th><th className="w-8 pr-1 text-center font-semibold">Pts</th>
      </tr></thead>
      <tbody>{standings.map((row) => { const team = byId[row.teamId]; return <tr key={row.teamId} className="border-b border-white/[.06] last:border-0">
        <td className="py-2 text-center font-bold text-zinc-500">{row.rank}</td>
        <td className="min-w-0 py-2"><span className="flex min-w-0 items-center gap-1.5"><TeamIcon team={team} className="h-4 w-4 text-[6px]" /><span className="truncate font-semibold">{compact ? team?.shortName : team?.name}</span></span></td>
        <td className="text-center text-zinc-300">{row.played}</td><td className="text-center text-zinc-300">{row.wins}</td><td className="text-center text-zinc-300">{row.draws}</td><td className="text-center text-zinc-300">{row.losses}</td>
        <td className="text-center text-zinc-300">{row.goalsFor}-{row.goalsAgainst}</td><td className={`text-center ${row.goalDifference > 0 ? 'text-emerald-400' : row.goalDifference < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td><td className="pr-1 text-center font-black text-white">{row.points}</td>
      </tr> })}</tbody>
    </table>
  </div>
}
