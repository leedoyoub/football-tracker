import { useMemo, useState } from 'react'
import { historyAwardsForSeason, historyMonthlyAward, historySeasons, historyTimelineForSeason } from '../engine/historyReadModels'
import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { playerFullName } from '../components/ui'

type Props = { players: Player[]; teams: Team[]; matches: Match[]; states: CompetitionState[]; competition: CompetitionType | 'all' }

export function RecordsHistory({ players, teams, matches, states, competition }: Props) {
  const [panel, setPanel] = useState<'timeline' | 'awards'>('timeline')
  const [timelineSeason, setTimelineSeason] = useState<string | null>(null)
  const [awardSeason, setAwardSeason] = useState<string | null>(null)
  const seasons = useMemo(() => historySeasons(matches, states).slice().reverse(), [matches, states])
  return <section aria-label="Records history"><div role="tablist" aria-label="History view" className="mb-4 flex w-fit rounded-xl bg-zinc-900 p-1"><button role="tab" aria-selected={panel === 'timeline'} type="button" onClick={() => setPanel('timeline')} className={`rounded-lg px-3 py-2 text-xs font-bold ${panel === 'timeline' ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}>Timeline</button><button role="tab" aria-selected={panel === 'awards'} type="button" onClick={() => setPanel('awards')} className={`rounded-lg px-3 py-2 text-xs font-bold ${panel === 'awards' ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}>Awards</button></div>{panel === 'timeline' ? <Timeline seasons={seasons} openSeason={timelineSeason} onToggle={setTimelineSeason} players={players} teams={teams} matches={matches} states={states} /> : <Awards seasons={seasons} openSeason={awardSeason} onToggle={setAwardSeason} players={players} teams={teams} matches={matches} states={states} competition={competition} />}</section>
}

function Timeline({ seasons, openSeason, onToggle, players, teams, matches, states }: Omit<Props, 'competition'> & { seasons: string[]; openSeason: string | null; onToggle: (season: string | null) => void }) {
  return <><h2 className="mb-2 text-sm font-semibold">Season Timeline</h2><div className="space-y-2">{seasons.map(season => <section key={season} className="rounded-2xl bg-zinc-900"><button type="button" onClick={() => onToggle(openSeason === season ? null : season)} className="flex min-h-12 w-full items-center justify-between px-3 text-left text-sm font-black"><span>{season}</span><span className="text-xs text-zinc-400">{openSeason === season ? 'Hide' : 'Open'}</span></button>{openSeason === season && <TimelineDetail season={season} players={players} teams={teams} matches={matches} states={states} />}</section>)}</div>{!seasons.length && <p className="text-xs text-zinc-500">No recorded seasons yet.</p>}</>
}

function TimelineDetail({ season, players, teams, matches, states }: Omit<Props, 'competition'> & { season: string }) {
  const [openBlock, setOpenBlock] = useState<number | null>(null)
  const model = useMemo(() => historyTimelineForSeason(teams, players, matches, states, season), [teams, players, matches, states, season])
  const teamName = (id?: string) => teams.find(team => team.id === id)?.name ?? '—'
  const playerName = (id?: string) => id ? playerFullName(players.find(player => player.id === id)) : '—'
  return <div className="border-t border-white/5 px-3 pb-3 pt-2"><div className="grid grid-cols-3 gap-1 text-[10px]"><Fact label="League" value={teamName(model.league)} /><Fact label="Cup" value={teamName(model.cup)} /><Fact label="Champions" value={teamName(model.champions)} /><Fact label="Golden Boot" value={`${playerName(model.scorer?.playerId)} · ${model.scorer?.goals ?? 0}`} /><Fact label="Assist Leader" value={`${playerName(model.assists?.playerId)} · ${model.assists?.assists ?? 0}`} /><Fact label="Best Rating" value={`${playerName(model.rating?.playerId)} · ${model.rating?.avgRating.toFixed(2) ?? '—'}`} /></div>{model.bestXI.length > 0 && <p className="mt-3 text-[10px] text-zinc-400"><b className="text-zinc-200">Team of the Season:</b> {model.bestXI.map(playerName).join(', ')}</p>}<div className="mt-3"><h3 className="mb-1 text-xs font-semibold">Finalized Team of the Month</h3><div className="flex flex-wrap gap-1">{Array.from({ length: 10 }, (_, index) => index + 1).map(block => <button key={block} type="button" onClick={() => setOpenBlock(openBlock === block ? null : block)} className={`rounded-lg px-2 py-1 text-[10px] ${openBlock === block ? 'bg-emerald-500 text-black' : 'bg-black/30 text-zinc-300'}`}>{season}-{block}</button>)}</div>{openBlock !== null && <MonthlyDetail season={season} block={openBlock} players={players} teams={teams} matches={matches} />}</div></div>
}

function MonthlyDetail({ season, block, players, teams, matches }: Pick<Props, 'players' | 'teams' | 'matches'> & { season: string; block: number }) {
  const award = useMemo(() => historyMonthlyAward(teams, players, matches, season, block), [teams, players, matches, season, block])
  const playerName = (id?: string | null) => id ? playerFullName(players.find(player => player.id === id)) : '—'
  if (!award) return <p className="mt-2 text-[10px] text-zinc-500">Not available yet.</p>
  return <div className="mt-2 rounded-xl bg-black/30 p-2 text-[10px]"><b>Player of the Month: {playerName(award.playerOfMonth?.playerId)}</b><p className="mt-1 text-zinc-400">Team of the Month: {award.bestXI.flatMap(slot => slot.playerId ? [playerName(slot.playerId)] : []).join(', ') || '—'}</p></div>
}

function Awards({ seasons, openSeason, onToggle, players, teams, matches, states, competition }: Props & { seasons: string[]; openSeason: string | null; onToggle: (season: string | null) => void }) {
  return <><h2 className="mb-2 text-sm font-semibold">Award History</h2><p className="mb-3 text-[10px] text-zinc-500">Open a season to load its canonical award results.</p><div className="space-y-2">{seasons.map(season => <section key={season} className="rounded-2xl bg-zinc-900"><button type="button" onClick={() => onToggle(openSeason === season ? null : season)} className="flex min-h-12 w-full items-center justify-between px-3 text-left text-sm font-black"><span>{season}</span><span className="text-xs text-zinc-400">{openSeason === season ? 'Hide' : 'Open'}</span></button>{openSeason === season && <AwardsDetail season={season} players={players} teams={teams} matches={matches} states={states} competition={competition} />}</section>)}</div></>
}

function AwardsDetail({ season, players, teams, matches, states, competition }: Props & { season: string }) {
  const awards = useMemo(() => historyAwardsForSeason(teams, players, matches, states, season, competition), [teams, players, matches, states, season, competition])
  const playerName = (id?: string) => id ? playerFullName(players.find(player => player.id === id)) : '—'
  const playerLabel = (type: CompetitionType) => type === 'league' ? 'Player of the Season' : type === 'cup' ? 'Player of the Cup' : 'Player of the Tournament'
  return <div className="space-y-2 border-t border-white/5 px-3 pb-3 pt-2 text-xs">{awards.map(award => <div key={award.competition} className="rounded-xl bg-black/30 p-2"><b>{playerLabel(award.competition)}</b><p className="mt-1 text-emerald-300">{playerName(award.player?.playerId)}{award.player ? ` · ${award.player.value.toFixed(2)}` : ' · Not finalized'}</p>{award.goalkeeper && <p className="mt-1 text-sky-200">{award.goalkeeper.label}: {playerName(award.goalkeeper.playerId)} · {award.goalkeeper.value.toFixed(2)}</p>}{award.goldenGlove && <p className="mt-1 text-amber-200">Golden Glove: {playerName(award.goldenGlove.playerId)} · {award.goldenGlove.value} clean sheets</p>}</div>)}</div>
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-black/30 p-2"><small className="block text-zinc-500">{label}</small><b className="mt-1 block break-words">{value}</b></div> }
