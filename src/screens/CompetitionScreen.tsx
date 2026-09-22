import { useEffect, useMemo, useRef, useState } from 'react'
import { AwardBestXI } from '../components/AwardBestXI'
import { FloatingScrollToTop } from '../components/FloatingScrollToTop'
import { RankingMetricTabs, RankingRow, useMetricSwipe } from '../components/RankingRow'
import { RANKING_METRICS, formatRankingMetricValue, rankingTitle, type RankingDisplayMetric } from '../lib/rankingMetrics'
import { TeamIcon } from '../components/TeamIcon'
import { playerFullName } from '../components/ui'
import { StandingsTable } from '../components/StandingsTable'
import {
  CHAMPIONS_ROUNDS,
  CUP_STAGES,
  championsCompetition,
  competitionMatches,
  competitionStageMatches,
  cupCompetition,
  drawNextChampionsTeam,
  isCompetitionSeasonComplete,
  leagueCompetition,
  type ChampionsPairing,
  type CupCompetition,
} from '../engine/competition'
import { competitionRevision } from '../engine/competitionRevision'
import { matchCompetitionStage } from '../engine/competitionContext'
import { selectLeagueCompetition, type LeagueCacheDiagnostic } from '../engine/competitionSelectors'
import { matchScore } from '../engine/rating'
import { LEAGUE_MATCHES_PER_TEAM } from '../engine/leagueFormat'
import { buildGlobalRankingData, rankGlobalRankingRows, seasonsFromMatches, unifiedBestEleven, type LeaderboardMetric } from '../engine/stats'
import { buildSeasonAnalytics, rankingMovement, type PlayerRankingSnapshot, type SeasonAnalytics } from '../engine/seasonAnalytics'
import { SectionHeader, SegmentedControl } from '../components/SeasonUI'
import { currentStaticTeams } from '../data/teams'
import { competitionAwardResult, competitionAwardLabel } from '../engine/awards'
import { useStore } from '../store'
import { emptyFilters, RankingFilterButton, type RankingFilters } from './RankingFilters'
import type { CompetitionState, CompetitionType, Match, Player, ScreenStateByView, Team, View } from '../types'

const LABELS: Record<CompetitionType, string> = { league: 'League', cup: 'Cup', champions: 'Champions' }
const SYMBOLS: Record<CompetitionType, string> = { league: '👑', cup: '🥇', champions: '🏆' }
const STAGE_LABELS: Record<string, string> = {
  stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3', stage4: 'Stage 4', stage5: 'Stage 5', stage6: 'Stage 6', stage7: 'Stage 7',
  final: 'Final', finalReplay: 'Final Replay', roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals',
}
const METRICS = RANKING_METRICS.map(({ value: id, label }) => ({ id, label }))

let diagnosticSequence = 0
function measuredInDevelopment<T>(label: string, operation: () => T): T {
  if (!import.meta.env.DEV || typeof performance === 'undefined') return operation()
  const id = `football-tracker:${label}:${diagnosticSequence++}`
  performance.mark(`${id}:start`)
  try { return operation() } finally {
    performance.mark(`${id}:end`)
    performance.measure(label, `${id}:start`, `${id}:end`)
    const entries = performance.getEntriesByName(label)
    const duration = entries[entries.length - 1]?.duration ?? 0
    console.debug(`[Football Tracker performance] ${label}: ${duration.toFixed(3)}ms`)
    performance.clearMarks(`${id}:start`); performance.clearMarks(`${id}:end`); performance.clearMeasures(label)
  }
}

function reportLeagueCache(diagnostic: LeagueCacheDiagnostic) {
  if (!import.meta.env.DEV) return
  console.debug(`[Football Tracker performance] League derived cache: ${diagnostic.hit ? 'HIT' : 'MISS'} · ${diagnostic.key} · ${diagnostic.reason} · ${diagnostic.durationMs.toFixed(3)}ms`)
}

export function CompetitionScreen({ season, screenState, onStateChange, onSeason, onNavigate }: { season: string; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; onSeason: (season: string) => void; onNavigate: (view: View) => void }) {
  const { teams, players, matches, competitionStates = [], competitionRevisions = {}, competitionCacheOwner, teamCatalogRevision = 0, setChampionsDraw, completeSeason } = useStore()
  const type = screenState.competitionType
  const patchState = (patch: Partial<ScreenStateByView['competition']>) => onStateChange({ ...screenState, ...patch })
  const setType = (value: CompetitionType) => patchState({ competitionType: value, viewAllMetric: null, cupViewAll: false, compareMode: false, comparedPlayerIds: [] })
  const renderMark = `football-tracker:CompetitionScreen:${diagnosticSequence++}:start`
  if (import.meta.env.DEV && typeof performance !== 'undefined') performance.mark(renderMark)
  const tournamentTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const seasons = useMemo(() => [...new Set([...seasonsFromMatches(matches), ...competitionStates.map(state => state.season), season, 'Season 1'])].sort((a, b) => Number(b.match(/\d+/)?.[0] ?? 0) - Number(a.match(/\d+/)?.[0] ?? 0)), [matches, competitionStates, season])
  const draw = competitionStates.find(state => state.id === `champions:${season}`)
  const leagueRevision = competitionRevision(competitionRevisions, season, 'league')
  const league = useMemo(() => type === 'league' ? measuredInDevelopment('League standings derivation', () => selectLeagueCompetition(competitionCacheOwner, teams, matches, season, leagueRevision, teamCatalogRevision, reportLeagueCache, players)) : null, [type, competitionCacheOwner, teams, matches, players, season, leagueRevision, teamCatalogRevision])
  const cup = useMemo(() => type === 'cup' ? cupCompetition(tournamentTeams, matches, season, players) : null, [type, tournamentTeams, matches, season, players])
  const champions = useMemo(() => type === 'champions' ? championsCompetition(draw, matches, season, players) : null, [type, draw, matches, season, players])
  const finalized = competitionStates.some(state => state.kind === 'season-complete' && state.season === season)
  const nextSeason = `Season ${Number(season.match(/\d+/)?.[0] ?? 1) + 1}`
  const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])) as Record<string, Team>, [teams])
  useEffect(() => {
    if (!import.meta.env.DEV || typeof performance === 'undefined') return
    if (!performance.getEntriesByName(renderMark).length) return
    const end = renderMark.replace(':start', ':commit')
    performance.mark(end)
    performance.measure('CompetitionScreen render-to-commit', renderMark, end)
    const entries = performance.getEntriesByName('CompetitionScreen render-to-commit')
    const duration = entries[entries.length - 1]?.duration ?? 0
    console.debug(`[Football Tracker performance] CompetitionScreen render-to-commit: ${duration.toFixed(3)}ms · ${season} · ${type}`)
    performance.clearMarks(renderMark); performance.clearMarks(end); performance.clearMeasures('CompetitionScreen render-to-commit')
  })

  return <div className="px-4 pb-8 pt-6">
    <div className="mb-3 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Competitions</h1><p className="text-xs text-zinc-500">Season and tournament detail</p></div><select aria-label="Competition season" value={season} onChange={event => onSeason(event.target.value)} className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-bold">{seasons.map(item => <option key={item}>{item}</option>)}</select></div>
    <div role="tablist" aria-label="Competition type" className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1">{(['league', 'cup', 'champions'] as CompetitionType[]).map(item => <button key={item} role="tab" aria-selected={type === item} type="button" onClick={() => setType(item)} className={`rounded-lg py-2 text-xs font-black ${type === item ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}><span aria-hidden>{SYMBOLS[item]}</span> {LABELS[item]}</button>)}</div>

    {type === 'league' && league && <LeagueView season={season} teams={teams} players={players} matches={matches} league={league} screenState={screenState} onStateChange={onStateChange} onNavigate={onNavigate} />}
    {type === 'cup' && cup && <CupView season={season} teams={teams} cup={cup} all={screenState.cupViewAll} onAll={value => patchState({ cupViewAll: value })} onNavigate={onNavigate} />}
    {type === 'champions' && <section>
      {champions && <><CompetitionHeader type="champions" label={champions.currentStage} season={season} champion={champions.championId ? teamById[champions.championId] : undefined} progress={champions.championId ? 'Champ' : STAGE_LABELS[champions.currentStage] ?? champions.currentStage} />
      {!champions.drawn ? <DrawPanel teams={tournamentTeams} drawnIds={draw?.kind === 'champions-draw' ? draw.teamIds : []} teamById={teamById} onDraw={ids => setChampionsDraw(season, ids)} /> : <ChampionsBracket teams={teamById} rounds={champions.rounds} championId={champions.championId} currentStage={champions.currentStage} />}</>}
    </section>}

    <DeferredCompetitionPanels key={`${season}:${type}`} season={season} type={type} screenState={screenState} onStateChange={onStateChange} players={players} teams={teams} tournamentTeams={tournamentTeams} matches={matches} leagueMatches={league?.matches} draw={draw} cup={cup} champions={champions} finalized={finalized} nextSeason={nextSeason} onComplete={() => { completeSeason(season); onSeason(nextSeason) }} onNavigate={onNavigate} />
  </div>
}

/** Leave standings/header on the first paint. Each stage gets a separate idle
 * turn so Rankings, Best XI, and completion checks cannot form one long task. */
function DeferredCompetitionPanels({ season, type, screenState, onStateChange, players, teams, tournamentTeams, matches, leagueMatches, draw, cup, champions, finalized, nextSeason, onComplete, onNavigate }: { season: string; type: CompetitionType; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; players: Player[]; teams: Team[]; tournamentTeams: Team[]; matches: Match[]; leagueMatches?: Match[]; draw?: CompetitionState; cup: CupCompetition | null; champions: ReturnType<typeof championsCompetition> | null; finalized: boolean; nextSeason: string; onComplete: () => void; onNavigate: (view: View) => void }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (stage >= 3) return
    const idle = window.requestIdleCallback?.(() => setStage(value => Math.min(value + 1, 3)), { timeout: 400 })
    const timer = idle === undefined ? window.setTimeout(() => setStage(value => Math.min(value + 1, 3)), 0) : undefined
    return () => { if (idle !== undefined) window.cancelIdleCallback?.(idle); if (timer !== undefined) window.clearTimeout(timer) }
  }, [stage])
  return <>
    {stage === 0 && <section aria-label="Competition summaries" className="mt-7 h-14 rounded-2xl bg-zinc-900/60" />}
    {type !== 'league' && stage >= 1 && <DeferredCompetitionRankings season={season} type={type} screenState={screenState} onStateChange={onStateChange} players={players} teams={teams} allMatches={matches} leagueMatches={leagueMatches} onNavigate={onNavigate} />}
    {type !== 'league' && stage >= 2 && <DeferredCompetitionBestElevens season={season} type={type} players={players} teams={teams} allMatches={matches} leagueMatches={leagueMatches} cup={cup} champions={champions} onNavigate={onNavigate} />}
    {stage >= 3 && <DeferredSeasonCompletion season={season} teams={tournamentTeams} players={players} matches={matches} draw={draw} finalized={finalized} nextSeason={nextSeason} onComplete={onComplete} />}
  </>
}

function DeferredCompetitionRankings({ season, type, screenState, onStateChange, players, teams, allMatches, leagueMatches, onNavigate }: { season: string; type: CompetitionType; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; players: Player[]; teams: Team[]; allMatches: Match[]; leagueMatches?: Match[]; onNavigate: (view: View) => void }) {
  const matches = useMemo(() => measuredInDevelopment('Competition match filtering/index lookup', () => type === 'league' && leagueMatches ? leagueMatches : competitionMatches(allMatches, season, type)), [type, leagueMatches, allMatches, season])
  return <CompetitionRankings season={season} type={type} screenState={screenState} onStateChange={onStateChange} players={players} teams={teams} matches={matches} onNavigate={onNavigate} />
}

function DeferredCompetitionBestElevens({ season, type, players, teams, allMatches, leagueMatches, cup, champions, onNavigate }: { season: string; type: CompetitionType; players: Player[]; teams: Team[]; allMatches: Match[]; leagueMatches?: Match[]; cup: CupCompetition | null; champions: ReturnType<typeof championsCompetition> | null; onNavigate: (view: View) => void }) {
  const matches = useMemo(() => measuredInDevelopment('Best XI match scope lookup', () => type === 'league' && leagueMatches ? leagueMatches : competitionMatches(allMatches, season, type)), [type, leagueMatches, allMatches, season])
  return <CompetitionBestElevens season={season} type={type} players={players} teams={teams} matches={matches} allMatches={allMatches} cup={cup} champions={champions} onNavigate={onNavigate} />
}

function DeferredSeasonCompletion({ season, teams, players, matches, draw, finalized, nextSeason, onComplete }: { season: string; teams: Team[]; players: Player[]; matches: Match[]; draw?: CompetitionState; finalized: boolean; nextSeason: string; onComplete: () => void }) {
  const complete = useMemo(() => measuredInDevelopment('Deferred season completion', () => isCompetitionSeasonComplete(teams, matches, season, players, draw)), [teams, matches, season, players, draw])
  if (!complete) return null
  return <section className="mt-7 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"><h2 className="text-sm font-black">Season complete</h2><p className="mt-1 text-xs text-zinc-300">League, Cup and Champions all have champions.</p>{finalized ? <p className="mt-3 text-xs font-bold text-emerald-300">History finalized · {nextSeason} is available</p> : <button type="button" onClick={onComplete} className="mt-3 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-black">Complete Season</button>}</section>
}

function CompetitionHeader({ type, label, season, champion, progress }: { type: CompetitionType; label: string; season: string; champion?: Team; progress?: string }) {
  return <header className="mb-4 rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-400">{SYMBOLS[type]} {LABELS[type]} · {season}</p><h2 className="mt-1 text-xl font-black">{STAGE_LABELS[label] ?? label}</h2></div><div className="text-right">{progress && <b className="block text-xs text-emerald-300">{progress}</b>}{champion && <span className="mt-2 flex items-center justify-end gap-2 text-xs font-black text-amber-300"><TeamIcon team={champion} className="h-8 w-8 text-[8px]" /> Champion</span>}</div></div></header>
}

function LeagueView({ season, teams, players, matches, league, screenState, onStateChange, onNavigate }: { season: string; teams: Team[]; players: Player[]; matches: Match[]; league: ReturnType<typeof leagueCompetition>; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; onNavigate: (view: View) => void }) {
  const playerMetric = screenState.rankingMetric as RankingDisplayMetric
  const bestXiMode = screenState.bestXiMode
  const tab = screenState.tab
  const patchState = (patch: Partial<ScreenStateByView['competition']>) => onStateChange({ ...screenState, ...patch })
  const setPlayerMetric = (value: RankingDisplayMetric) => patchState({ rankingMetric: value })
  const setBestXiMode = (value: 'season' | 'monthly') => patchState({ bestXiMode: value })
  const setTab = (value: ScreenStateByView['competition']['tab']) => patchState({ tab: value })
  const analytics = useMemo(() => buildSeasonAnalytics(teams, players, matches, season), [teams, players, matches, season])
  const current = analytics.leagueSnapshots.get(analytics.currentMatchDay)?.standings ?? league.standings
  const playerRows = useMemo(() => rankGlobalRankingRows(buildGlobalRankingData(players, analytics.leagueMatches, { seasons: [season], teams: [], positions: [] }, 'rating'), players, playerMetric).slice(0, 10), [players, analytics.leagueMatches, season, playerMetric])
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const playerValue = (row: typeof playerRows[number]) => formatRankingMetricValue(playerMetric, row.value)
  const playerSwipe = useMetricSwipe(RANKING_METRICS.map(item => item.value), playerMetric, setPlayerMetric)
  const seasonXi = useMemo(() => unifiedBestEleven(players, analytics.leagueMatches, season), [players, analytics.leagueMatches, season])
  return <section><CompetitionHeader type="league" label="League" season={season} champion={league.championId ? teams.find(team => team.id === league.championId) : undefined} progress={league.complete ? 'Completed · 30/30' : `MD ${league.matchdayProgress} / ${LEAGUE_MATCHES_PER_TEAM}`} /><SegmentedControl label="League view" value={tab} onChange={setTab} options={[{ value: 'players', label: 'Players' }, { value: 'table', label: 'Table' }, { value: 'form', label: 'Form' }, { value: 'history', label: 'History' }]} />
    <div className="mt-3">{tab === 'players' && <><RankingMetricTabs label="League player category" value={playerMetric} onChange={setPlayerMetric} options={RANKING_METRICS} /><section className="mt-3"><SectionHeader title={rankingTitle('league')} subtitle="Top 10" /><div {...playerSwipe} className="mt-2 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe League ranking metrics">{playerRows.map((row, index) => { const player = playerById.get(row.playerId); return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow rank={index + 1} compact player={player} team={teamById.get(row.historicalTeamId ?? row.teamId)} value={playerValue(row)} onClick={() => onNavigate({ name: 'player', id: row.playerId })} /></div> })}{!playerRows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div><button type="button" onClick={() => onNavigate({ name: 'global-ranking', season, competitionType: 'league', rankingMetric: playerMetric })} className="secondary-view-all mt-3 w-full">View All</button></section>{['goals', 'assists', 'mom', 'rating'].includes(playerMetric) && <RaceHistoryPanel analytics={analytics} metric={playerMetric as 'goals' | 'assists' | 'mom' | 'rating'} players={Object.fromEntries(players.map(player => [player.id, player]))} />}<section className="mt-5"><SegmentedControl label="League Best XI" value={bestXiMode} onChange={value => setBestXiMode(value as typeof bestXiMode)} options={[{ value: 'season', label: 'Season Best XI' }, { value: 'monthly', label: 'Team of the Month' }]} />{bestXiMode === 'season' ? <BestEleven title="Season Best XI" xi={seasonXi} players={players} teams={teams} onNavigate={onNavigate} /> : analytics.activeMonthlyAwards ? <><p className="mt-2 text-[10px] text-zinc-500">{analytics.activeMonthlyAwards.scopeLabel} · {analytics.activeMonthlyAwards.finalized ? 'Finalized' : 'In progress'} · Player of the Month is marked blue.</p><AwardBestXI title="Team of the Month" result={analytics.activeMonthlyAwards} players={players} teams={teams} onPlayerOpen={id => onNavigate({ name: 'player', id })} /></> : <Empty text="Not available yet." />}</section></>}{tab === 'table' && (current.length ? <StandingsTable standings={current} teams={teams} compact onTeamNavigate={id => onNavigate({ name: 'team', id })} /> : <Empty text="No League data for this season." />)}
    {tab === 'form' && <><p className="mb-2 text-xs text-zinc-500">Last 3 League matches only. This is not the official table.</p>{analytics.formTable.some(row => row.played) ? <StandingsTable standings={analytics.formTable} teams={teams} compact onTeamNavigate={id => onNavigate({ name: 'team', id })} /> : <Empty text="Not enough matches for Last 3." />}</>}
    {tab === 'history' && <LeagueHistory analytics={analytics} teams={teams} screenState={screenState} onStateChange={onStateChange} onNavigate={onNavigate} />}</div></section>
}

function LeagueHistory({ analytics, teams, screenState, onStateChange, onNavigate }: { analytics: SeasonAnalytics; teams: Team[]; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; onNavigate: (view: View) => void }) {
  const day = screenState.historyMatchday ?? Math.max(1, analytics.currentMatchDay)
  const compared = screenState.historyComparedTeamIds.length ? screenState.historyComparedTeamIds : analytics.leagueSnapshots.get(analytics.currentMatchDay)?.standings.slice(0, 1).map(row => row.teamId) ?? []
  const setDay = (value: number) => onStateChange({ ...screenState, historyMatchday: value })
  const setCompared = (value: string[]) => onStateChange({ ...screenState, historyComparedTeamIds: value })
  const snapshot = analytics.leagueSnapshots.get(Math.min(day, analytics.currentMatchDay))
  const toggle = (id: string) => setCompared(compared.includes(id) ? compared.filter(item => item !== id) : compared.length < 4 ? [...compared, id] : compared)
  if (!analytics.currentMatchDay || !snapshot) return <Empty text="No League history available yet." />
  return <div><div className="rounded-xl bg-zinc-900 p-3"><div className="flex items-center justify-between text-xs"><b>MD {snapshot.matchDay}</b><span className={snapshot.complete ? 'text-emerald-400' : 'text-amber-300'}>{snapshot.complete ? 'Complete' : 'Incomplete Matchday'}</span></div><input aria-label="Historical League Matchday" type="range" min="1" max={analytics.currentMatchDay} value={snapshot.matchDay} onChange={event => setDay(Number(event.target.value))} className="mt-3 w-full accent-emerald-500" /><div className="mt-1 flex justify-between text-[9px] text-zinc-600"><span>MD1</span><span>MD{analytics.currentMatchDay}</span></div></div>
    <div className="no-scrollbar my-3 flex gap-1 overflow-x-auto">{teams.map(team => <button key={team.id} type="button" aria-pressed={compared.includes(team.id)} onClick={() => toggle(team.id)} className={`min-h-10 shrink-0 rounded-full px-3 text-[10px] font-bold ${compared.includes(team.id) ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}>{team.shortName}</button>)}</div>
    <PositionHistory analytics={analytics} teamIds={compared} teams={teams} />
    <div className="mt-3"><StandingsTable standings={snapshot.standings} teams={teams} compact onTeamNavigate={id => onNavigate({ name: 'team', id })} /></div></div>
}

function PositionHistory({ analytics, teamIds, teams }: { analytics: SeasonAnalytics; teamIds: string[]; teams: Team[] }) {
  const [focused, setFocused] = useState<string | null>(null)
  if (!teamIds.length) return <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">Select up to four teams to compare position history.</p>
  const days = [...analytics.leagueSnapshots.keys()]
  const width = Math.max(320, days.length * 26); const height = 176; const rankCount = Math.max(2, teams.length)
  const series = teamIds.map(teamId => ({ teamId, points: days.flatMap((day, index) => { const rank = analytics.leagueSnapshots.get(day)?.standings.find(row => row.teamId === teamId)?.rank; return rank ? [{ day, rank, x: 24 + index * 26, y: 14 + (rank - 1) / Math.max(1, rankCount - 1) * 130 }] : [] }) }))
  const colors = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6']
  return <div className="rounded-xl bg-zinc-900 p-3" aria-label="League position history line chart"><div className="mb-2 flex flex-wrap gap-1">{series.map((row, index) => <button key={row.teamId} type="button" onClick={() => setFocused(focused === row.teamId ? null : row.teamId)} className={`rounded-full px-2 py-1 text-[10px] font-bold ${focused === row.teamId ? 'bg-white text-black' : 'bg-black/30 text-zinc-300'}`}><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: colors[index] }} />{teams.find(team => team.id === row.teamId)?.shortName}</button>)}</div><div className="no-scrollbar overflow-x-auto"><svg role="img" aria-label="League position comparison, first place at top" viewBox={`0 0 ${width} ${height}`} className="h-44 min-w-[320px]" style={{ width }}><text x="2" y="18" fill="#a1a1aa" fontSize="9">1</text><text x="2" y="148" fill="#a1a1aa" fontSize="9">{rankCount}</text>{series.map((row, index) => { const muted = focused !== null && focused !== row.teamId; const points = row.points.map(point => `${point.x},${point.y}`).join(' '); const latest = row.points[row.points.length - 1]; return <g key={row.teamId} opacity={muted ? .22 : 1}><polyline fill="none" stroke={colors[index]} strokeWidth={focused === row.teamId ? 3 : 2} points={points} />{row.points.map(point => <g key={point.day}><circle cx={point.x} cy={point.y} r="2.5" fill={colors[index]} /><title>{`MD${point.day}: #${point.rank}`}</title>{focused === row.teamId && <text x={point.x} y={point.y - 5} textAnchor="middle" fill="white" fontSize="8">{point.rank}</text>}</g>)}{!focused && latest && <text x={latest.x + 4} y={latest.y - 4} fill={colors[index]} fontSize="8">#{latest.rank}</text>}</g>})}</svg></div><p className="mt-2 text-[9px] text-zinc-500">Matchday progression · 1st at top. Scroll only the plot for long seasons.</p></div>
}

function CupView({ season, teams, cup, all, onAll, onNavigate }: { season: string; teams: Team[]; cup: CupCompetition; all: boolean; onAll: (value: boolean) => void; onNavigate: (view: View) => void }) {
  const byId = Object.fromEntries(teams.map(team => [team.id, team]))
  const riskIndex = cup.rows.findIndex(row => row.state === 'at-risk')
  const eliminatedIndex = cup.rows.findIndex(row => row.state === 'eliminated')
  const start = riskIndex >= 0 ? Math.max(0, riskIndex - 3) : 0
  const end = riskIndex >= 0 ? Math.min(cup.rows.length, Math.max(riskIndex + 2, eliminatedIndex >= 0 ? eliminatedIndex + 2 : 0)) : Math.min(8, cup.rows.length)
  const visible = all ? cup.rows : cup.rows.slice(start, end)
  const playedTeams = new Set(cup.stageMatches.flatMap(match => [match.homeTeamId, match.awayTeamId]).filter(id => cup.activeTeamIds.includes(id))).size
  return <section><CompetitionHeader type="cup" label={cup.stage} season={season} champion={cup.championId ? byId[cup.championId] : undefined} progress={cup.championId ? 'Champ' : cup.stage === 'final' ? 'Final' : `S${cup.stage.replace('stage', '')}`} /><div className="mb-4 flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2.5"><span className="text-xs text-zinc-400">{STAGE_LABELS[cup.stage]} · {playedTeams}/{cup.activeTeamIds.length} played</span><b className="text-sm text-emerald-400">{cup.activeTeamIds.length} teams remaining</b></div>
    {cup.eliminationDrawTeamIds.length > 0 && <p className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[10px] font-bold text-amber-200">Elimination Draw applies only to {cup.eliminationDrawTeamIds.length} teams tied across the Survival Line.</p>}
    <div className="overflow-hidden rounded-xl bg-zinc-900"><div className="grid grid-cols-[24px_1fr_48px_52px_32px_34px] px-2 py-2 text-[9px] font-bold uppercase text-zinc-500"><span>#</span><span>Team</span><span>W-D-L</span><span>GF-GA</span><span>GD</span><span>Pts</span></div>{visible.map((row, index) => { const team = byId[row.teamId]; const previous = visible[index - 1]; const showLine = row.state === 'at-risk' && previous?.state !== 'at-risk'; return <div key={row.teamId}>{showLine && <div className="border-t border-dashed border-amber-400/70 px-2 py-1 text-center text-[8px] font-black uppercase tracking-[.18em] text-amber-300">Survival Line</div>}<button type="button" onClick={() => onNavigate({ name: 'team', id: row.teamId })} className={`grid w-full grid-cols-[24px_1fr_48px_52px_32px_34px] items-center border-t border-white/[.05] px-2 py-2.5 text-left text-[10px] ${row.state === 'at-risk' ? 'bg-orange-400/10 text-orange-100' : row.state === 'eliminated' ? 'bg-zinc-950/30 text-zinc-500 opacity-60' : ''}`}><b>{row.rank}</b><span className="flex min-w-0 items-center gap-1.5"><TeamIcon team={team} className="h-6 w-6 text-[6px]" /><span className="min-w-0"><b className="block truncate">{team?.shortName ?? team?.name}</b><small className={row.state === 'at-risk' ? 'text-orange-300' : 'text-zinc-500'}>{row.state === 'at-risk' ? 'At Risk' : row.state === 'eliminated' ? `Eliminated · Stage ${row.eliminatedStage}` : 'Surviving'}</small></span></span><span>{row.wins}-{row.draws}-{row.losses}</span><span>{row.goalsFor}-{row.goalsAgainst}</span><span>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</span><b>{row.points}</b></button></div>})}</div>
    {cup.rows.length > visible.length && <button type="button" onClick={() => onAll(true)} className="secondary-view-all mt-3 w-full">View All 16</button>}{all && <button type="button" onClick={() => onAll(false)} className="secondary-view-all mt-3 w-full">Show Survival Line</button>}
    <p className="mt-2 text-center text-[10px] text-zinc-500">Survivors show this Stage; eliminated teams are frozen at elimination.</p>
  </section>
}

function DrawPanel({ teams, drawnIds, teamById, onDraw }: { teams: Team[]; drawnIds: string[]; teamById: Record<string, Team>; onDraw: (ids: string[]) => void }) {
  return <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-center"><p className="text-sm font-semibold">Round of 16 draw</p><p className="mt-1 text-xs text-zinc-500">Completely random · no seeding or restrictions · {drawnIds.length}/16 slots</p><div className="mt-3 grid grid-cols-2 gap-1 text-left">{drawnIds.map((id, index) => <div key={id} className="flex items-center gap-2 rounded-lg bg-black/40 px-2 py-1.5 text-[10px]"><span className="text-zinc-600">{index + 1}</span><TeamIcon team={teamById[id]} className="h-5 w-5 text-[6px]" /><b className="truncate">{teamById[id]?.shortName}</b></div>)}</div><button type="button" disabled={drawnIds.length >= 16} onClick={() => onDraw(drawNextChampionsTeam(teams, drawnIds))} className="mt-4 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-black text-black disabled:opacity-40">{drawnIds.length ? 'DRAW NEXT TEAM' : 'START DRAW'}</button></div>
}

function ChampionsBracket({ teams, rounds, championId, currentStage }: { teams: Record<string, Team>; rounds: ReturnType<typeof championsCompetition>['rounds']; championId?: string; currentStage: string }) {
  const card = (pairing: ChampionsPairing) => {
    const games = (teamId: string) => pairing.teamGames?.[teamId] ?? pairing.matches.filter(match => match.teamId === teamId || match.homeTeamId === teamId || match.awayTeamId === teamId)
    const score = (match: Match | undefined, teamId: string) => { if (!match) return '–'; const value = matchScore(match); const home = match.homeTeamId === teamId || (match.teamId === teamId && match.homeTeamId !== teamId); return `${home ? value.home : value.away}-${home ? value.away : value.home}` }
    const rows = Array.from({ length: pairing.requiredMatches }, (_, index) => index)
    return <div key={pairing.id} className={`relative rounded-xl border p-2 shadow-lg ${pairing.stage === currentStage ? 'border-cyan-300/60 bg-cyan-400/10' : 'border-white/10 bg-zinc-900'}`}><div className="mb-2 grid grid-cols-2 gap-2">{pairing.teamIds.map(id => <TeamIcon key={id} team={teams[id]} className="mx-auto h-6 w-6 text-[6px]" />)}</div><div className="grid grid-cols-2 gap-x-2 gap-y-1">{rows.flatMap(index => pairing.teamIds.map(id => <span key={`${id}:${index}`} className={`rounded px-1 py-0.5 text-center text-[10px] font-black ${pairing.rowWinners?.[index] === id ? 'bg-emerald-500/25 text-emerald-200' : pairing.rowWinners?.[index] ? 'bg-red-500/20 text-red-200' : 'bg-black/30 text-zinc-400'}`}>{score(games(id)[index], id)}</span>))}</div><p className="mt-1 border-t border-white/5 pt-1 text-center text-[8px] text-zinc-600">{pairing.teamGames ? `${games(pairing.teamIds[0]).length}/${pairing.requiredMatches} · ${games(pairing.teamIds[1]).length}/${pairing.requiredMatches}` : `${pairing.matches.length}/${pairing.requiredMatches} matches`}</p></div>
  }
  return <div aria-label="Champions fixed knockout bracket" className="champions-bracket-scroll no-scrollbar overflow-x-auto overflow-y-hidden"><div className="grid min-w-[780px] grid-cols-[1.35fr_1fr_.9fr_1fr_1.35fr] items-center gap-4 rounded-2xl border border-blue-400/10 bg-gradient-to-b from-slate-950 to-black p-4"><Round title="Round of 16" pairs={rounds.roundOf16.slice(0, 4)} card={card} side="left" /><div className="space-y-10"><Round title="Quarter-finals" pairs={rounds.quarterFinal.slice(0, 2)} card={card} side="left" /><Round title="Semi-final" pairs={rounds.semiFinal.slice(0, 1)} card={card} side="left" /></div><div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-amber-300/40 bg-amber-300/10 text-3xl">🏆</div><p className="mt-2 text-[10px] font-black uppercase text-amber-300">{championId ? teams[championId]?.name : 'Champion'}</p>{rounds.final[0] && <div className="mt-3">{card(rounds.final[0])}</div>}</div><div className="space-y-10"><Round title="Semi-final" pairs={rounds.semiFinal.slice(1)} card={card} side="right" /><Round title="Quarter-finals" pairs={rounds.quarterFinal.slice(2)} card={card} side="right" /></div><Round title="Round of 16" pairs={rounds.roundOf16.slice(4)} card={card} side="right" /></div></div>
}

function Round({ title, pairs, card, side }: { title: string; pairs: ChampionsPairing[]; card: (pairing: ChampionsPairing) => React.ReactNode; side: 'left' | 'right' }) {
  return <div className="relative"><span aria-hidden className={`absolute top-1/2 h-px w-4 bg-cyan-300/20 ${side === 'left' ? '-right-4' : '-left-4'}`} /><p className="mb-2 text-center text-[9px] font-black uppercase tracking-wide text-cyan-200/50">{title}</p><div className="space-y-3">{pairs.map(card)}</div></div>
}

function CompetitionRankings({ season, type, screenState, onStateChange, players, teams, matches, onNavigate }: { season: string; type: CompetitionType; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; players: Player[]; teams: Team[]; matches: Match[]; onNavigate: (view: View) => void }) {
  const metric = screenState.rankingMetric as LeaderboardMetric
  const filters: RankingFilters = { ...emptyFilters, seasons: [season], teams: screenState.rankingTeamIds }
  const all = screenState.viewAllMetric === metric
  const compareMode = screenState.compareMode
  const selectedPlayers = screenState.comparedPlayerIds
  const patchState = (patch: Partial<ScreenStateByView['competition']>) => onStateChange({ ...screenState, ...patch })
  const drag = useRef({ x: 0, left: 0, active: false })
  const effective = useMemo(() => ({ ...filters, seasons: [season] }), [filters, season])
  const rankingIndex = useMemo(() => measuredInDevelopment('Deferred Global Rankings/player stats/rating derivation', () => buildGlobalRankingData(players, matches, effective, 'rating')), [players, matches, effective])
  const rows = useMemo(() => measuredInDevelopment('Global Rankings metric ordering', () => rankGlobalRankingRows(rankingIndex, players, metric)), [rankingIndex, players, metric])
  const playerById = useMemo(() => Object.fromEntries(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])), [teams])
  const analytics = useMemo(() => type === 'league' ? buildSeasonAnalytics(teams, players, matches, season) : null, [type, teams, players, matches, season])
  const playerMovement = useMemo(() => analytics ? rankingMovement(analytics.playerSnapshots.get(analytics.currentMatchDay), analytics.playerSnapshots.get(analytics.currentMatchDay - 1), metric) : new Map<string, number | null>(), [analytics, metric])
  const format = (value: number) => value.toFixed(metric === 'rating' || metric.endsWith('/90') || metric === 'sotAllowed' || metric === 'goalsConceded' || metric === 'savePercentage' ? 2 : 0) + (metric === 'savePercentage' ? '%' : '')
  const rankingSwipe = useMetricSwipe(METRICS.map(item => item.id), metric, next => patchState({ rankingMetric: next, viewAllMetric: null }))
  const choosePlayer = (playerId: string) => {
    if (!compareMode) { onNavigate({ name: 'player', id: playerId }); return }
    const next = selectedPlayers.includes(playerId) ? selectedPlayers.filter(id => id !== playerId) : [...selectedPlayers, playerId].slice(-2)
    patchState({ comparedPlayerIds: next })
    if (next.length === 2) onNavigate({ name: 'comparison', leftId: next[0], rightId: next[1], season, competitionType: type })
  }
  const sectionId = `competition-ranking-${type}-${metric}`
  return <section id={sectionId} className="mt-7"><SectionHeader title={rankingTitle(type)} subtitle={`${season} · ${LABELS[type]} only`} action={<div className="flex items-center gap-1"><button type="button" aria-pressed={compareMode} onClick={() => patchState({ compareMode: !compareMode, comparedPlayerIds: [] })} className={`min-h-9 rounded-lg px-2 text-[10px] font-black ${compareMode ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-emerald-300'}`}>{compareMode ? 'Cancel' : 'Compare'}</button><RankingFilterButton applied={effective} onApply={next => patchState({ rankingTeamIds: next.teams, viewAllMetric: null })} seasons={[season]} teams={teams} /></div>} />
    {compareMode && <p className="mb-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-200">Select exactly two players ({selectedPlayers.length}/2). Ranking order stays unchanged.</p>}
    <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1 touch-pan-x" onPointerDown={event => { if (event.pointerType === 'mouse') drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, active: true } }} onPointerMove={event => { if (drag.current.active) event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x) }} onPointerUp={() => { drag.current.active = false }}>{METRICS.map(item => <button key={item.id} type="button" onClick={() => patchState({ rankingMetric: item.id, viewAllMetric: null })} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${metric === item.id ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}>{item.label}</button>)}</div>{all && rows.length > 10 && <FloatingScrollToTop sectionId={sectionId} />}
    <div {...rankingSwipe} className="overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe competition ranking metrics">{(all ? rows : rows.slice(0, 10)).map((row, index) => { const player = playerById[row.playerId]; const team = teamById[row.historicalTeamId ?? row.teamId]; const selected = selectedPlayers.includes(row.playerId); return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow rank={index + 1} player={player} team={team} movement={type === 'league' ? playerMovement.get(row.playerId) ?? null : null} value={format(row.value)} selected={compareMode && selected} onClick={() => choosePlayer(row.playerId)} /></div> })}{!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div>
    {rows.length > 10 && <button type="button" onClick={() => patchState({ viewAllMetric: all ? null : metric })} className="secondary-view-all mt-3 w-full">{all ? 'Show Top 10' : 'View All'}</button>}
    {analytics && ['goals', 'assists', 'mom', 'rating'].includes(metric) && <RaceHistoryPanel analytics={analytics} metric={metric as 'goals' | 'assists' | 'mom' | 'rating'} players={playerById} />}
  </section>
}

function RaceHistoryPanel({ analytics, metric, players }: { analytics: SeasonAnalytics; metric: 'goals' | 'assists' | 'mom' | 'rating'; players: Record<string, Player> }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const snapshots = useMemo<PlayerRankingSnapshot[]>(() => [...analytics.playerSnapshots.values()], [analytics])
  const series = useMemo(() => { const current = snapshots[snapshots.length - 1]?.rows.get(metric) ?? []; const ids: string[] = current.slice(0, 10).map(row => row.playerId); return ids.map(playerId => ({ playerId, points: snapshots.flatMap(snapshot => { const rank = (snapshot.rows.get(metric) ?? []).findIndex(row => row.playerId === playerId); return rank < 0 ? [] : [{ day: snapshot.matchDay, rank: rank + 1 }] }) })) }, [snapshots, metric])
  const width = Math.max(300, snapshots.length * 36 + 32)
  useEffect(() => { const element = scrollRef.current; if (element) element.scrollLeft = element.scrollWidth }, [analytics.season, metric, snapshots.length])
  const colors = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#a3e635', '#e879f9', '#f87171']; const y = (rank: number) => 14 + (rank - 1) * 18
  return <details className="mt-3 rounded-xl bg-zinc-900 p-3"><summary className="min-h-8 cursor-pointer text-xs font-black">Race History · Current Top 10</summary>{series.length ? <div className="mt-3"><p className="mb-2 text-[10px] text-zinc-500">Current Top 10 traced through canonical snapshots. Rank 1 is at the top.</p><div className="mb-2 flex flex-wrap gap-1">{series.map(row => <button key={row.playerId} type="button" aria-pressed={selected === row.playerId} onClick={() => setSelected(value => value === row.playerId ? null : row.playerId)} className={`rounded-full px-2 py-1 text-[9px] font-bold ${selected === row.playerId ? 'bg-white text-black' : selected ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-800 text-zinc-200'}`}>{playerFullName(players[row.playerId])}</button>)}</div><div ref={scrollRef} className="overflow-x-auto overscroll-x-contain" aria-label="Horizontally scrollable rank plot"><svg width={width} height="190" role="img" aria-label="Race History rank graph" className="block min-w-full">{Array.from({ length: 10 }, (_, index) => <g key={index}><line x1="28" x2={width} y1={y(index + 1)} y2={y(index + 1)} stroke="#3f3f46" strokeWidth="1" /><text x="2" y={y(index + 1) + 3} fill="#a1a1aa" fontSize="8">{index + 1}</text></g>)}{series.map((row, index) => { const muted = selected !== null && selected !== row.playerId; const points = row.points.map((point, pointIndex) => `${32 + pointIndex * 36},${y(point.rank)}`).join(' '); return <g key={row.playerId} opacity={muted ? .18 : 1}><polyline points={points} fill="none" stroke={colors[index]} strokeWidth={selected === row.playerId ? 3 : 1.5} />{row.points.map((point, pointIndex) => <g key={point.day}><circle cx={32 + pointIndex * 36} cy={y(point.rank)} r={selected === row.playerId ? 3 : 2} fill={colors[index]} />{(selected === row.playerId || pointIndex === row.points.length - 1) && <text x={34 + pointIndex * 36} y={y(point.rank) - 4} fill="white" fontSize="8">#{point.rank}</text>}</g>)}</g>})}</svg></div></div> : <p className="mt-2 text-xs text-zinc-500">No race history available yet.</p>}</details>
}

function CompetitionBestElevens({ season, type, players, teams, matches, allMatches, cup, champions, onNavigate }: { season: string; type: CompetitionType; players: Player[]; teams: Team[]; matches: Match[]; allMatches: Match[]; cup: CupCompetition | null; champions: ReturnType<typeof championsCompetition> | null; onNavigate: (view: View) => void }) {
  const { competitionStates = [] } = useStore()
  const seasonXI = useMemo(() => measuredInDevelopment('Deferred Team of Season', () => unifiedBestEleven(players, matches, season)), [players, matches, season])
  const canonicalAward = useMemo(() => competitionAwardResult(type, season, currentStaticTeams(teams), players, allMatches, competitionStates), [type, season, teams, players, allMatches, competitionStates])
  const snapshots = useMemo(() => {
    // League monthly awards are rendered with the League tabs. This avoids a
    // second, overlapping Team of the Week award surface.
    if (type === 'league') return []
    if (type === 'cup') return [...CUP_STAGES.flatMap((stage, index) => {
      const games = competitionStageMatches(allMatches, season, 'cup', stage)
      const complete = cup?.stage !== stage && games.length > 0
      return complete ? [{ title: `Team of the Stage ${index + 1}`, games, recent: false }] : []
    }), ...(cup?.championId ? [{ title: 'Team of the Final', games: competitionMatches(allMatches, season, 'cup').filter(match => matchCompetitionStage(match) === 'final' || matchCompetitionStage(match) === 'finalReplay'), recent: false }] : [])]
    return CHAMPIONS_ROUNDS.flatMap((stage, index) => {
      const games = competitionMatches(allMatches, season, 'champions').filter(match => matchCompetitionStage(match) === stage || (stage === 'final' && matchCompetitionStage(match) === 'finalReplay'))
      const pairs = champions?.rounds[stage] ?? []
      return pairs.length > 0 && pairs.every(pair => Boolean(pair.winnerId)) ? [{ title: `Team of the Round ${index + 1}`, games, recent: false }] : []
    })
  }, [type, matches, allMatches, season, cup?.stage, cup?.championId, champions?.rounds])
  const finalXI = canonicalAward ? { slots: canonicalAward.bestXI, statsByPlayer: canonicalAward.statsByPlayer } : seasonXI
  return <section className="mt-7"><h2 className="text-lg font-semibold">Best XI</h2><p className="mb-3 text-xs text-zinc-500">Competition-scoped · existing 4-3-3 position rules</p>{snapshots.map(snapshot => <BestEleven key={snapshot.title} title={snapshot.title} xi={measuredInDevelopment(`Deferred ${snapshot.title}`, () => unifiedBestEleven(players, snapshot.games, season, snapshot.recent))} players={players} teams={teams} onNavigate={onNavigate} />)}<BestEleven title={canonicalAward?.teamLabel ?? competitionAwardLabel(type)} xi={finalXI} bestPlayerId={canonicalAward?.bestPlayerId} players={players} teams={teams} onNavigate={onNavigate} /></section>
}

function BestEleven({ title, xi, bestPlayerId, players, teams, onNavigate }: { title: string; xi: ReturnType<typeof unifiedBestEleven>; bestPlayerId?: string; players: Player[]; teams: Team[]; onNavigate: (view: View) => void }) {
  return <AwardBestXI title={title} result={{ bestXI: xi.slots, statsByPlayer: xi.statsByPlayer, bestPlayerId }} players={players} teams={teams} onPlayerOpen={id => onNavigate({ name: 'player', id })} />
}

function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-500">{text}</p> }
