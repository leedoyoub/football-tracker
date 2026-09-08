import { useStore } from '../store'
import { useState } from 'react'
import { TeamIcon } from '../components/TeamIcon'
import { drawRandomNumber } from '../lib/randomDraw'
import type { View } from '../types'

export function TeamsScreen({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { teams, players, matches } = useStore()
  const [maximum, setMaximum] = useState(''); const [drawn, setDrawn] = useState<number | null>(null); const [drawError, setDrawError] = useState('')
  return (
    <div className="px-4 pb-8 pt-6">
      <div className="mb-5"><h1 className="text-2xl font-semibold">Teams</h1><p className="mt-1 text-xs text-zinc-500">Official team directory</p></div>
      <section className="mb-5 rounded-xl border border-white/10 bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Random Number</h2><div className="mt-2 flex gap-2"><input value={maximum} onChange={event => { setMaximum(event.target.value); setDrawError('') }} inputMode="numeric" pattern="[0-9]*" placeholder="Enter N" className="min-w-0 flex-1 rounded-lg bg-black px-3 py-2 text-sm" /><button type="button" onClick={() => { try { setDrawn(drawRandomNumber(maximum)) } catch (error) { setDrawn(null); setDrawError(error instanceof Error ? error.message : 'Enter a positive whole number.') } }} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black">Draw</button></div>{drawn !== null && <p className="mt-2 text-sm font-bold text-emerald-300">Result: {drawn}</p>}{drawError && <p role="alert" className="mt-2 text-xs text-amber-300">{drawError}</p>}</section>
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
              <TeamIcon team={team} className="h-12 w-12 text-sm font-black">{(team.shortName || team.abbreviation || team.name).slice(0, 3)}</TeamIcon>
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
