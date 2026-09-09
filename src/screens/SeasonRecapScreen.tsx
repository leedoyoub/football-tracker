import { Pitch } from '../components/Pitch'
import { playerDisplayName } from '../components/ui'
import { seasonRecap, startingXILeaders, type StartingXIStat } from '../engine/seasonInsights'
import { useStore } from '../store'
import type { View } from '../types'

export function SeasonRecapScreen({ season, onNavigate, onBack }: { season: string; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches, competitionStates = [] } = useStore(); const recap = seasonRecap(players, matches, season, competitionStates); const xiLeaders = startingXILeaders(players, matches, season)
  const byId = Object.fromEntries(players.map(player => [player.id, player]))
  const xiRows: { label: string; row: StartingXIStat | undefined; value: (row: StartingXIStat) => string }[] = [
    { label: 'Most Used XI', row: xiLeaders.mostUsed, value: row => `${row.matches} matches` },
    { label: 'Highest Win Rate XI', row: xiLeaders.highestWinRate, value: row => `${(row.winRate * 100).toFixed(0)}% wins` },
    { label: 'Best Rated XI', row: xiLeaders.bestRated, value: row => row.averageRating.toFixed(2) },
  ]
  if (!recap.complete) return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">Back</button><h1 className="text-2xl font-semibold">Season Recap</h1><p className="mt-2 rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">The recap unlocks after League, Cup and Champions are complete and Complete Season is confirmed.</p></div>
  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">Back</button>
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">Complete season</p><h1 className="mb-1 text-2xl font-semibold">Season Recap</h1><p className="mb-5 text-xs text-zinc-400">{season} · {recap.matchDays} match days · calculated from saved matches</p>
    <section className="mb-6"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Best XI</h2><p className="text-xs text-zinc-400">Season average rating · 4-3-3</p></div></div><Pitch slots={recap.bestXI} players={players} teams={teams} statsByPlayer={{}} layout="free" showPositionBadge={false} onSlotClick={slot => slot.playerId && onNavigate({ name: 'player', id: slot.playerId })} /></section>
    <section className="mb-6"><h2 className="mb-2 text-lg font-semibold">Starting XI analytics</h2><p className="mb-2 text-[10px] text-zinc-500">Minimum sample: 3 matches</p><div className="space-y-1.5">{xiRows.map(item => item.row && <div key={item.label} className="flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2.5 text-xs"><span className="font-semibold">{item.label}</span><span className="font-black text-emerald-400">{item.value(item.row)}</span></div>)}{!xiLeaders.mostUsed && <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No XI has reached the 3-match sample yet.</p>}</div></section>
    <section><h2 className="mb-3 text-lg font-semibold">Awards</h2><div className="space-y-2">{recap.awards.map(award => <button key={award.id} type="button" onClick={() => award.playerIds[0] && onNavigate({ name: 'player', id: award.playerIds[0] })} className="w-full rounded-xl border border-white/5 bg-zinc-900 px-3 py-3 text-left"><div className="flex items-start justify-between gap-3"><span><span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-400">{award.title}</span><span className="mt-1 block text-sm font-semibold">{award.playerIds.map(id => playerDisplayName(byId[id])).join(' + ')}</span></span><span className="max-w-36 text-right text-[11px] text-zinc-400">{award.detail}</span></div></button>)}</div></section>
  </div>
}
