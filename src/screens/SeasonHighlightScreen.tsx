import { useMemo } from 'react'
import { Pitch } from '../components/Pitch'
import { playerFullName } from '../components/ui'
import { homeMilestoneNews } from '../engine/news'
import { buildSeasonAnalytics } from '../engine/seasonAnalytics'
import { useStore } from '../store'
import type { View } from '../types'

export function SeasonHighlightScreen({ season, kind, onNavigate, onBack }: { season: string; kind: 'monthly' | 'review' | 'news'; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches, competitionStates = [] } = useStore()
  const analytics = useMemo(() => buildSeasonAnalytics(teams, players, matches, season), [teams, players, matches, season])
  const playerById = useMemo(() => Object.fromEntries(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])), [teams])
  const news = useMemo(() => homeMilestoneNews(players, teams, matches, competitionStates), [players, teams, matches, competitionStates])
  const awards = analytics.latestMonthlyAwards
  const review = analytics.latestReview
  const title = kind === 'monthly' ? 'Monthly Awards' : kind === 'review' ? 'Matchday Review' : 'News'
  return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">Back</button><header className="mb-4"><h1 className="text-2xl font-semibold">{title}</h1><p className="text-xs text-zinc-500">{season} · League-only awards and review data</p></header>
    {kind === 'monthly' && (awards ? <section className="space-y-3"><div className="rounded-2xl bg-zinc-900 p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-300">MD {awards.block.startMatchDay}–{awards.block.endMatchDay}</p><h2 className="mt-2 text-lg font-bold">Player of the Month</h2>{awards.playerOfMonth ? <button type="button" onClick={() => onNavigate({ name: 'player', id: awards.playerOfMonth!.playerId })} className="mt-2 text-left text-sm text-emerald-300">{playerFullName(playerById[awards.playerOfMonth.playerId])} · {awards.playerOfMonth.avgRating.toFixed(2)}</button> : <p className="mt-2 text-sm text-zinc-500">No eligible player.</p>}</div><section className="rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Monthly Best XI</h2><div className="mt-3"><Pitch slots={awards.bestXI} players={players} teams={teams} statsByPlayer={awards.statsByPlayer} presentation="history" showPositionBadge={false} onSlotClick={slot => slot.playerId && onNavigate({ name: 'player', id: slot.playerId })} /></div></section></section> : <Empty text="No finalized Monthly Awards yet." />)}
    {kind === 'review' && (review ? <section className="space-y-3"><article className="rounded-2xl bg-zinc-900 p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">MD {review.matchDay}</p><h2 className="mt-2 text-sm font-semibold">Highest-rated player</h2><p className="mt-1 text-lg font-bold">{review.highestRated ? `${playerFullName(playerById[review.highestRated.playerId])} · ${review.highestRated.rating.toFixed(1)}` : 'No rated player'}</p></article><article className="rounded-2xl bg-zinc-900 p-4"><h2 className="text-sm font-semibold">Biggest win</h2>{review.biggestWin ? <button type="button" onClick={() => onNavigate({ name: 'match', id: review.biggestWin!.matchId })} className="mt-1 text-sm font-bold text-emerald-300">Won by {review.biggestWin.margin} · Open match</button> : <p className="mt-1 text-xs text-zinc-500">No completed match.</p>}</article><article className="rounded-2xl bg-zinc-900 p-4"><h2 className="text-sm font-semibold">Biggest mover</h2><p className="mt-1 text-sm font-bold">{review.biggestMover ? `${teamById[review.biggestMover.teamId]?.name ?? 'Team'} +${review.biggestMover.movement}` : 'No upward movement'}</p></article></section> : <Empty text="No completed Matchday review yet." />)}
    {kind === 'news' && <section className="space-y-2">{news.length ? news.map(item => <button key={item.id} type="button" disabled={!item.matchId} onClick={() => item.matchId && onNavigate({ name: 'match', id: item.matchId })} className="w-full rounded-2xl bg-zinc-900 p-4 text-left disabled:opacity-70"><p className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-300">{item.emoji} {item.eyebrow}</p><h2 className="mt-1 text-sm font-semibold">{item.title}</h2><p className="mt-1 text-xs text-zinc-500">{item.context || item.detail}</p></button>) : <Empty text="No news yet." />}</section>}
  </div>
}

function Empty({ text }: { text: string }) { return <p className="rounded-2xl bg-zinc-900 p-4 text-sm text-zinc-500">{text}</p> }
