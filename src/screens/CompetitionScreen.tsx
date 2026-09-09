import { useMemo, useRef, useState } from 'react'
import { Pitch } from '../components/Pitch'
import { PlayerIcon } from '../components/PlayerIcon'
import { TeamIcon } from '../components/TeamIcon'
import { playerFullName } from '../components/ui'
import { StandingsTable } from '../components/StandingsTable'
import {
  CHAMPIONS_ROUNDS,
  CUP_STAGES,
  championsCompetition,
  competitionMatches,
  competitionSeasonStatus,
  competitionStageMatches,
  cupCompetition,
  drawNextChampionsTeam,
  leagueCompetition,
  type ChampionsPairing,
  type CupCompetition,
} from '../engine/competition'
import { matchScore } from '../engine/rating'
import { buildGlobalRankingData, rankGlobalRankingRows, seasonsFromMatches, unifiedBestEleven, type LeaderboardMetric } from '../engine/stats'
import { currentStaticTeams } from '../data/teams'
import { useStore } from '../store'
import { emptyFilters, RankingFilterButton, type RankingFilters } from './RankingFilters'
import type { CompetitionType, Match, Player, Team, View } from '../types'

const LABELS: Record<CompetitionType, string> = { league: 'League', cup: 'Cup', champions: 'Champions' }
const SYMBOLS: Record<CompetitionType, string> = { league: '👑', cup: '🥇', champions: '🏆' }
const STAGE_LABELS: Record<string, string> = {
  stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3', stage4: 'Stage 4', stage5: 'Stage 5', stage6: 'Stage 6', stage7: 'Stage 7',
  final: 'Final', finalReplay: 'Final Replay', roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals',
}
const METRICS: { id: LeaderboardMetric; label: string }[] = [
  { id: 'rating', label: 'Rating' }, { id: 'goals', label: 'Goals' }, { id: 'assists', label: 'Assists' }, { id: 'g+a', label: 'G+A' },
  { id: 'minutes', label: 'Minutes' }, { id: 'mom', label: 'MOM' }, { id: 'goals/90', label: 'Goals/90' }, { id: 'assists/90', label: 'Assists/90' },
  { id: 'g+a/90', label: 'G+A/90' }, { id: 'ga/90', label: 'Goals Against/90' }, { id: 'cleanSheets', label: 'Clean Sheets' }, { id: 'saves', label: 'Saves' },
]

export function CompetitionScreen({ season, initialType = 'league', onSeason, onNavigate }: { season: string; initialType?: CompetitionType; onSeason: (season: string) => void; onNavigate: (view: View) => void }) {
  const { teams, players, matches, competitionStates = [], setChampionsDraw, completeSeason } = useStore()
  const [type, setType] = useState<CompetitionType>(initialType)
  const tournamentTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const seasons = useMemo(() => [...new Set([...seasonsFromMatches(matches), ...competitionStates.map(state => state.season), season, 'Season 1'])].sort((a, b) => Number(b.match(/\d+/)?.[0] ?? 0) - Number(a.match(/\d+/)?.[0] ?? 0)), [matches, competitionStates, season])
  const draw = competitionStates.find(state => state.id === `champions:${season}`)
  const league = useMemo(() => leagueCompetition(teams, matches, season), [teams, matches, season])
  const cup = useMemo(() => cupCompetition(tournamentTeams, matches, season, players), [tournamentTeams, matches, season, players])
  const champions = useMemo(() => championsCompetition(draw, matches, season, players), [draw, matches, season, players])
  const selectedMatches = useMemo(() => competitionMatches(matches, season, type), [matches, season, type])
  const seasonStatus = useMemo(() => competitionSeasonStatus(tournamentTeams, matches, season, players, draw), [tournamentTeams, matches, season, players, draw])
  const finalized = competitionStates.some(state => state.kind === 'season-complete' && state.season === season)
  const nextSeason = `Season ${Number(season.match(/\d+/)?.[0] ?? 1) + 1}`
  const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])) as Record<string, Team>, [teams])

  return <div className="px-4 pb-8 pt-6">
    <div className="mb-3 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Competitions</h1><p className="text-xs text-zinc-500">Season and tournament detail</p></div><select aria-label="Competition season" value={season} onChange={event => onSeason(event.target.value)} className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-bold">{seasons.map(item => <option key={item}>{item}</option>)}</select></div>
    <div role="tablist" aria-label="Competition type" className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1">{(['league', 'cup', 'champions'] as CompetitionType[]).map(item => <button key={item} role="tab" aria-selected={type === item} type="button" onClick={() => setType(item)} className={`rounded-lg py-2 text-xs font-black ${type === item ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}><span aria-hidden>{SYMBOLS[item]}</span> {LABELS[item]}</button>)}</div>

    {type === 'league' && <LeagueView season={season} teams={teams} league={league} onNavigate={onNavigate} />}
    {type === 'cup' && <CupView season={season} teams={teams} cup={cup} onNavigate={onNavigate} />}
    {type === 'champions' && <section>
      <CompetitionHeader type="champions" label={champions.currentStage} season={season} champion={champions.championId ? teamById[champions.championId] : undefined} />
      {!champions.drawn ? <DrawPanel teams={tournamentTeams} drawnIds={draw?.kind === 'champions-draw' ? draw.teamIds : []} teamById={teamById} onDraw={ids => setChampionsDraw(season, ids)} /> : <ChampionsBracket teams={teamById} rounds={champions.rounds} championId={champions.championId} currentStage={champions.currentStage} />}
    </section>}

    <CompetitionRankings season={season} type={type} players={players} teams={teams} matches={selectedMatches} onNavigate={onNavigate} />
    <CompetitionBestElevens season={season} type={type} players={players} teams={teams} matches={selectedMatches} allMatches={matches} cup={cup} champions={champions} onNavigate={onNavigate} />

    {seasonStatus.complete && <section className="mt-7 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"><h2 className="text-sm font-black">Season complete</h2><p className="mt-1 text-xs text-zinc-300">League, Cup and Champions all have champions.</p>{finalized ? <p className="mt-3 text-xs font-bold text-emerald-300">History finalized · {nextSeason} is available</p> : <button type="button" onClick={() => { completeSeason(season); onSeason(nextSeason) }} className="mt-3 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-black">Complete Season</button>}</section>}
  </div>
}

function CompetitionHeader({ type, label, season, champion }: { type: CompetitionType; label: string; season: string; champion?: Team }) {
  return <header className="mb-4 rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-4"><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-400">{SYMBOLS[type]} {LABELS[type]} · {season}</p><div className="mt-1 flex items-center justify-between"><h2 className="text-xl font-black">{STAGE_LABELS[label] ?? label}</h2>{champion && <span className="flex items-center gap-2 text-xs font-black text-amber-300"><TeamIcon team={champion} className="h-8 w-8 text-[8px]" /> Champion</span>}</div></header>
}

function LeagueView({ season, teams, league, onNavigate }: { season: string; teams: Team[]; league: ReturnType<typeof leagueCompetition>; onNavigate: (view: View) => void }) {
  const [all, setAll] = useState(false)
  return <section><CompetitionHeader type="league" label="League" season={season} champion={league.championId ? teams.find(team => team.id === league.championId) : undefined} /><div className="mb-4 flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2.5"><span className="text-xs text-zinc-400">League progress</span><b className="text-sm text-emerald-400">MD {league.matchdayProgress} / 38</b></div>{league.standings.length ? <><StandingsTable standings={all ? league.standings : league.standings.slice(0, 8)} teams={teams} compact onTeamNavigate={id => onNavigate({ name: 'team', id })} />{league.standings.length > 8 && <button type="button" onClick={() => setAll(value => !value)} className="secondary-view-all mt-3 w-full">{all ? 'Show Top 8' : 'View All'}</button>}</> : <Empty text="No League data for this season." />}</section>
}

function CupView({ season, teams, cup, onNavigate }: { season: string; teams: Team[]; cup: CupCompetition; onNavigate: (view: View) => void }) {
  const [all, setAll] = useState(false)
  const byId = Object.fromEntries(teams.map(team => [team.id, team]))
  const riskIndex = cup.rows.findIndex(row => row.state === 'at-risk')
  const eliminatedIndex = cup.rows.findIndex(row => row.state === 'eliminated')
  const start = riskIndex >= 0 ? Math.max(0, riskIndex - 3) : 0
  const end = riskIndex >= 0 ? Math.min(cup.rows.length, Math.max(riskIndex + 2, eliminatedIndex >= 0 ? eliminatedIndex + 2 : 0)) : Math.min(8, cup.rows.length)
  const visible = all ? cup.rows : cup.rows.slice(start, end)
  const playedTeams = new Set(cup.stageMatches.flatMap(match => [match.homeTeamId, match.awayTeamId]).filter(id => cup.activeTeamIds.includes(id))).size
  return <section><CompetitionHeader type="cup" label={cup.stage} season={season} champion={cup.championId ? byId[cup.championId] : undefined} /><div className="mb-4 flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2.5"><span className="text-xs text-zinc-400">{STAGE_LABELS[cup.stage]} · {playedTeams}/{cup.activeTeamIds.length} played</span><b className="text-sm text-emerald-400">{cup.activeTeamIds.length} teams remaining</b></div>
    {cup.eliminationDrawTeamIds.length > 0 && <p className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[10px] font-bold text-amber-200">Elimination Draw applies only to {cup.eliminationDrawTeamIds.length} teams tied across the Survival Line.</p>}
    <div className="overflow-hidden rounded-xl bg-zinc-900"><div className="grid grid-cols-[24px_1fr_48px_52px_32px_34px] px-2 py-2 text-[9px] font-bold uppercase text-zinc-500"><span>#</span><span>Team</span><span>W-D-L</span><span>GF-GA</span><span>GD</span><span>Pts</span></div>{visible.map((row, index) => { const team = byId[row.teamId]; const previous = visible[index - 1]; const showLine = row.state === 'at-risk' && previous?.state !== 'at-risk'; return <div key={row.teamId}>{showLine && <div className="border-t border-dashed border-amber-400/70 px-2 py-1 text-center text-[8px] font-black uppercase tracking-[.18em] text-amber-300">Survival Line</div>}<button type="button" onClick={() => onNavigate({ name: 'team', id: row.teamId })} className={`grid w-full grid-cols-[24px_1fr_48px_52px_32px_34px] items-center border-t border-white/[.05] px-2 py-2.5 text-left text-[10px] ${row.state === 'at-risk' ? 'bg-orange-400/10 text-orange-100' : row.state === 'eliminated' ? 'bg-zinc-950/30 text-zinc-500 opacity-60' : ''}`}><b>{row.rank}</b><span className="flex min-w-0 items-center gap-1.5"><TeamIcon team={team} className="h-6 w-6 text-[6px]" /><span className="min-w-0"><b className="block truncate">{team?.shortName ?? team?.name}</b><small className={row.state === 'at-risk' ? 'text-orange-300' : 'text-zinc-500'}>{row.state === 'at-risk' ? 'At Risk' : row.state === 'eliminated' ? `Eliminated · Stage ${row.eliminatedStage}` : 'Surviving'}</small></span></span><span>{row.wins}-{row.draws}-{row.losses}</span><span>{row.goalsFor}-{row.goalsAgainst}</span><span>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</span><b>{row.points}</b></button></div>})}</div>
    {cup.rows.length > visible.length && <button type="button" onClick={() => setAll(true)} className="secondary-view-all mt-3 w-full">View All 16</button>}{all && <button type="button" onClick={() => setAll(false)} className="secondary-view-all mt-3 w-full">Show Survival Line</button>}
    <p className="mt-2 text-center text-[10px] text-zinc-500">Displayed totals are cumulative; survival order uses this Stage only.</p>
  </section>
}

function DrawPanel({ teams, drawnIds, teamById, onDraw }: { teams: Team[]; drawnIds: string[]; teamById: Record<string, Team>; onDraw: (ids: string[]) => void }) {
  return <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-center"><p className="text-sm font-semibold">Round of 16 draw</p><p className="mt-1 text-xs text-zinc-500">Completely random · no seeding or restrictions · {drawnIds.length}/16 slots</p><div className="mt-3 grid grid-cols-2 gap-1 text-left">{drawnIds.map((id, index) => <div key={id} className="flex items-center gap-2 rounded-lg bg-black/40 px-2 py-1.5 text-[10px]"><span className="text-zinc-600">{index + 1}</span><TeamIcon team={teamById[id]} className="h-5 w-5 text-[6px]" /><b className="truncate">{teamById[id]?.shortName}</b></div>)}</div><button type="button" disabled={drawnIds.length >= 16} onClick={() => onDraw(drawNextChampionsTeam(teams, drawnIds))} className="mt-4 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-black text-black disabled:opacity-40">{drawnIds.length ? 'DRAW NEXT TEAM' : 'START DRAW'}</button></div>
}

function ChampionsBracket({ teams, rounds, championId, currentStage }: { teams: Record<string, Team>; rounds: ReturnType<typeof championsCompetition>['rounds']; championId?: string; currentStage: string }) {
  const card = (pairing: ChampionsPairing) => <div key={pairing.id} className={`relative rounded-xl border p-2 shadow-lg ${pairing.stage === currentStage || (currentStage === 'finalReplay' && pairing.stage === 'final') ? 'border-cyan-300/60 bg-cyan-400/10' : 'border-white/10 bg-zinc-900'}`}>{pairing.teamIds.map(id => { const team = teams[id]; const aggregate = pairing.matches.reduce((total, match) => { const score = matchScore(match); return total + (match.homeTeamId === id ? score.home : score.away) }, 0); return <div key={id} className={`flex items-center gap-1.5 py-1 text-[10px] ${pairing.winnerId === id ? 'font-black text-emerald-300' : 'text-zinc-300'}`}><TeamIcon team={team} className="h-5 w-5 text-[6px]" /><span className="min-w-0 flex-1 truncate">{team?.shortName ?? team?.name}</span><b>{pairing.matches.length ? aggregate : '–'}</b></div>})}<p className="border-t border-white/5 pt-1 text-center text-[8px] text-zinc-600">{pairing.matches.length}/{pairing.requiredMatches} matches{pairing.replayMatches?.length ? ' · Replay' : ''}</p></div>
  return <div aria-label="Champions fixed knockout bracket" className="champions-bracket-scroll no-scrollbar overflow-x-auto overflow-y-hidden"><div className="grid min-w-[780px] grid-cols-[1.35fr_1fr_.9fr_1fr_1.35fr] items-center gap-4 rounded-2xl border border-blue-400/10 bg-gradient-to-b from-slate-950 to-black p-4"><Round title="Round of 16" pairs={rounds.roundOf16.slice(0, 4)} card={card} side="left" /><div className="space-y-10"><Round title="Quarter-finals" pairs={rounds.quarterFinal.slice(0, 2)} card={card} side="left" /><Round title="Semi-final" pairs={rounds.semiFinal.slice(0, 1)} card={card} side="left" /></div><div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-amber-300/40 bg-amber-300/10 text-3xl">🏆</div><p className="mt-2 text-[10px] font-black uppercase text-amber-300">{championId ? teams[championId]?.name : 'Champion'}</p>{rounds.final[0] && <div className="mt-3">{card(rounds.final[0])}</div>}</div><div className="space-y-10"><Round title="Semi-final" pairs={rounds.semiFinal.slice(1)} card={card} side="right" /><Round title="Quarter-finals" pairs={rounds.quarterFinal.slice(2)} card={card} side="right" /></div><Round title="Round of 16" pairs={rounds.roundOf16.slice(4)} card={card} side="right" /></div></div>
}

function Round({ title, pairs, card, side }: { title: string; pairs: ChampionsPairing[]; card: (pairing: ChampionsPairing) => React.ReactNode; side: 'left' | 'right' }) {
  return <div className="relative"><span aria-hidden className={`absolute top-1/2 h-px w-4 bg-cyan-300/20 ${side === 'left' ? '-right-4' : '-left-4'}`} /><p className="mb-2 text-center text-[9px] font-black uppercase tracking-wide text-cyan-200/50">{title}</p><div className="space-y-3">{pairs.map(card)}</div></div>
}

function CompetitionRankings({ season, type, players, teams, matches, onNavigate }: { season: string; type: CompetitionType; players: Player[]; teams: Team[]; matches: Match[]; onNavigate: (view: View) => void }) {
  const [metric, setMetric] = useState<LeaderboardMetric>('rating')
  const [filters, setFilters] = useState<RankingFilters>({ ...emptyFilters, seasons: [season] })
  const [all, setAll] = useState(false)
  const drag = useRef({ x: 0, left: 0, active: false })
  const effective = useMemo(() => ({ ...filters, seasons: [season] }), [filters, season])
  const rankingIndex = useMemo(() => buildGlobalRankingData(players, matches, effective, 'rating'), [players, matches, effective])
  const rows = useMemo(() => rankGlobalRankingRows(rankingIndex, players, metric), [rankingIndex, players, metric])
  const playerById = useMemo(() => Object.fromEntries(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])), [teams])
  const format = (value: number) => value.toFixed(metric === 'rating' || metric.endsWith('/90') ? 2 : 0)
  return <section className="mt-7"><div className="mb-2 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Global Rankings</h2><p className="text-xs text-zinc-500">{season} · {LABELS[type]} only</p></div><RankingFilterButton applied={effective} onApply={next => { setFilters({ ...next, seasons: [season] }); setAll(false) }} seasons={[season]} teams={teams} /></div>
    <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1 touch-pan-x" onPointerDown={event => { if (event.pointerType === 'mouse') drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, active: true } }} onPointerMove={event => { if (drag.current.active) event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x) }} onPointerUp={() => { drag.current.active = false }}>{METRICS.map(item => <button key={item.id} type="button" onClick={() => { setMetric(item.id); setAll(false) }} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${metric === item.id ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}>{item.label}</button>)}</div>
    <div className="overflow-hidden rounded-xl bg-zinc-900">{rows.slice(0, all ? 50 : 3).map((row, index) => { const player = playerById[row.playerId]; const team = teamById[row.historicalTeamId ?? row.teamId]; return <button key={row.playerId} type="button" onClick={() => onNavigate({ name: 'player', id: row.playerId })} className="flex w-full items-center gap-2 border-b border-white/5 px-3 py-2.5 text-left last:border-0"><b className="w-5 text-xs text-zinc-500">{index + 1}</b><PlayerIcon player={player} team={team} className="h-8 w-8 text-[8px]" /><span className="min-w-0 flex-1"><b className="block truncate text-xs">{playerFullName(player)}</b><small className="text-zinc-500">{team?.shortName} · {player?.position}</small></span><b className="text-sm text-emerald-300">{format(row.value)}</b></button>})}{!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div>
    {rows.length > 3 && <button type="button" onClick={() => setAll(value => !value)} className="secondary-view-all mt-3 w-full">{all ? 'Show Top 3' : 'View All'}</button>}
  </section>
}

function CompetitionBestElevens({ season, type, players, teams, matches, allMatches, cup, champions, onNavigate }: { season: string; type: CompetitionType; players: Player[]; teams: Team[]; matches: Match[]; allMatches: Match[]; cup: CupCompetition; champions: ReturnType<typeof championsCompetition>; onNavigate: (view: View) => void }) {
  const seasonXI = useMemo(() => unifiedBestEleven(players, matches, season), [players, matches, season])
  const snapshots = useMemo(() => {
    if (type === 'league') return [{ title: 'Team of the Week', games: matches, recent: true }]
    if (type === 'cup') return [...CUP_STAGES.flatMap((stage, index) => {
      const games = competitionStageMatches(allMatches, season, 'cup', stage)
      const complete = cup.stage !== stage && games.length > 0
      return complete ? [{ title: `Team of the Stage ${index + 1}`, games, recent: false }] : []
    }), ...(cup.championId ? [{ title: 'Team of the Final', games: competitionMatches(allMatches, season, 'cup').filter(match => match.competitionStage === 'final' || match.competitionStage === 'finalReplay'), recent: false }] : [])]
    return CHAMPIONS_ROUNDS.flatMap((stage, index) => {
      const games = competitionMatches(allMatches, season, 'champions').filter(match => match.competitionStage === stage || (stage === 'final' && match.competitionStage === 'finalReplay'))
      const pairs = champions.rounds[stage]
      return pairs.length > 0 && pairs.every(pair => Boolean(pair.winnerId)) ? [{ title: `Team of the Round ${index + 1}`, games, recent: false }] : []
    })
  }, [type, matches, allMatches, season, cup.stage, cup.championId, champions.rounds])
  return <section className="mt-7"><h2 className="text-lg font-semibold">Best XI</h2><p className="mb-3 text-xs text-zinc-500">Competition-scoped · existing 4-3-3 position rules</p>{snapshots.map(snapshot => <BestEleven key={snapshot.title} title={snapshot.title} xi={unifiedBestEleven(players, snapshot.games, season, snapshot.recent)} players={players} teams={teams} onNavigate={onNavigate} />)}<BestEleven title="Team of the Season" xi={seasonXI} players={players} teams={teams} onNavigate={onNavigate} /></section>
}

function BestEleven({ title, xi, players, teams, onNavigate }: { title: string; xi: ReturnType<typeof unifiedBestEleven>; players: Player[]; teams: Team[]; onNavigate: (view: View) => void }) {
  return <details className="mb-3 rounded-xl bg-zinc-900 p-3" open={title === 'Team of the Season'}><summary className="cursor-pointer text-sm font-black">{title}</summary><div className="mt-3"><Pitch slots={xi.slots} players={players} teams={teams} statsByPlayer={xi.statsByPlayer} layout="free" showPositionBadge={false} onSlotClick={slot => slot.playerId && onNavigate({ name: 'player', id: slot.playerId })} /></div></details>
}

function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-500">{text}</p> }
