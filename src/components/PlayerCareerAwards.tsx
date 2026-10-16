import { useMemo } from 'react'
import type { CompetitionState, Match, Player, Team } from '../types'
import { awardEventDetail, careerAwardEvents, type OfficialAwardEvent } from '../engine/officialAwards'

export function PlayerCareerAwards({ playerId, players, teams, matches, states }: { playerId: string; players: Player[]; teams: Team[]; matches: Match[]; states: CompetitionState[] }) {
  const events = useMemo(() => careerAwardEvents(teams, players, matches, states, playerId), [teams, players, matches, states, playerId])
  const group = (category: OfficialAwardEvent['category']) => {
    const groups = new Map<string, OfficialAwardEvent[]>()
    for (const event of events.filter(e => e.category === category)) { const list = groups.get(event.label) ?? []; list.push(event); groups.set(event.label, list) }
    return groups.size ? <div className="mt-2 space-y-1">{[...groups].map(([label, awards]) => <details key={label} className="rounded-lg bg-black/20 px-2 py-1.5 text-xs"><summary className="cursor-pointer py-1 font-semibold text-zinc-200">{label} <span className="text-amber-300">×{awards.length}</span></summary><ul className="mt-1 space-y-1 border-t border-white/5 py-2 text-[10px] text-zinc-400">{awards.map(event => <li key={event.id}>{awardEventDetail(event, teams)}</li>)}</ul></details>)}</div> : <p className="mt-2 text-[10px] text-zinc-500">No finalized honors yet.</p>
  }
  return <section aria-label="Career awards" className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Awards</h2><p className="mt-1 text-[10px] text-zinc-500">Career · finalized official honors</p><h3 className="mt-3 text-xs font-semibold">Individual Awards <span className="text-amber-300">{events.filter(e => e.category === 'individual').length}</span></h3>{group('individual')}<h3 className="mt-4 text-xs font-semibold">Team Honors</h3><h4 className="mt-2 text-[10px] font-semibold text-emerald-300">Championships</h4>{group('championship')}<h4 className="mt-3 text-[10px] font-semibold text-zinc-400">Runner-up Finishes</h4>{group('runner-up')}</section>
}
