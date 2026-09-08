import { AssistIcon, GoalIcon, playerDisplayName } from './ui'
import type { MatchEvent, Player } from '../types'
import { classifyGoalEvents } from '../engine/seasonInsights'
import type { Match } from '../types'

export function MatchTimeline({ events, players, teamId, match }: { events: MatchEvent[]; players: Player[]; teamId: string; match?: Match }) {
  const byId = Object.fromEntries(players.map((player) => [player.id, player]))
  const labelsByEventId = new Map(match ? classifyGoalEvents(match).map(item => [item.eventId, item.labels]) : [])
  const timelineEvents = events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> | Extract<MatchEvent, { type: 'sub' }> => event.type === 'goal' || event.type === 'sub')
  const ordered = timelineEvents.map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.minute ?? 0) - (b.event.minute ?? 0) || a.index - b.index)
  if (!ordered.length) return <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No recorded events.</p>
  return <div className="space-y-2">{ordered.map(({ event }) => {
    if (event.type === 'sub') return <div key={event.id} className="flex gap-3 rounded-xl bg-zinc-900 px-3 py-2 text-xs"><span className="w-7 shrink-0 font-black text-zinc-500">{event.minute}'</span><span><span className="text-red-400">← {playerDisplayName(byId[event.playerOutId])}</span><br /><span className="text-emerald-400">→ {playerDisplayName(byId[event.playerInId])}</span></span></div>
    const ours = (event.teamId === teamId) !== Boolean(event.ownGoal)
    const labels = labelsByEventId.get(event.id) ?? []
    return <div key={event.id} className="flex gap-3 rounded-xl bg-zinc-900 px-3 py-2 text-xs"><span className="w-7 shrink-0 font-black text-zinc-500">{event.minute}'</span><span className="min-w-0"><span className={ours ? 'flex items-center gap-1 font-bold text-white' : 'font-bold text-red-300'}>{ours ? <GoalIcon /> : null}{ours ? (event.playerId ? playerDisplayName(byId[event.playerId]) : 'Opponent own goal') : 'CONCEDED'}</span>{ours && event.assistPlayerId && <span className="mt-1 flex items-center gap-1 text-zinc-400"><AssistIcon />{playerDisplayName(byId[event.assistPlayerId])}</span>}{labels.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{labels.map(label => <span key={label} className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">{label}</span>)}</span>}</span></div>
  })}</div>
}
