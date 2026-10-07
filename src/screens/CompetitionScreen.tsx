import { useEffect, useMemo, useRef, useState } from 'react'
import { CompactFilterMenu } from '../components/CompactFilterMenu'
import { AwardBestXI } from '../components/AwardBestXI'
import { RankingMetricTabs, RankingRow, useMetricSwipe } from '../components/RankingRow'
import { RANKING_METRICS, formatRankingMetricValue, rankingTitle, type RankingDisplayMetric } from '../lib/rankingMetrics'
import { TeamIcon } from '../components/TeamIcon'
import { TeamIdentityAction } from '../components/EntityActions'
import { playerFullName } from '../components/ui'
import { resultTone } from '../lib/resultTone'
import { StandingsTable } from '../components/StandingsTable'
import {
  championsCompetition,
  projectChampionsBracket,
  competitionMatches,
  drawNextChampionsTeam,
  leagueCompetition,
  type ChampionsPairing,
  type CupCompetition,
} from '../engine/competition'
import { competitionRevision } from '../engine/competitionRevision'
import { matchCompetitionStage } from '../engine/competitionContext'
import { selectChampionsCompetition, selectCompetitionSeasonComplete, selectCupCompetition, selectLeagueCompetition, type LeagueCacheDiagnostic } from '../engine/competitionSelectors'
import { isRecordedForTeam, teamPerspectiveScore, teamsCreditedWithResult } from '../engine/matchPerspective'
import { LEAGUE_MATCHES_PER_TEAM } from '../engine/leagueFormat'
import { buildGlobalRankingData, rankGlobalRankingRows, seasonsFromMatches, type LeaderboardMetric } from '../engine/stats'
import { buildSeasonAnalytics, monthlyAwardForStartedBlock, type PlayerRankingSnapshot, type SeasonAnalytics } from '../engine/seasonAnalytics'
import { SectionHeader, SegmentedControl } from '../components/SeasonUI'
import { currentStaticTeams } from '../data/teams'
import { competitionAwardResult, competitionAwardLabel, performanceAwardResult, type CanonicalAwardResult } from '../engine/awards'
import { startedChampionsAwardRounds, startedCupAwardStages, startedMonthlyAwardBlocks } from '../engine/awardScopes'
import { useStore } from '../store'
import type { ChampionsStage, CompetitionState, CompetitionType, CupStage, Match, Player, ScreenStateByView, Team, View } from '../types'

const LABELS: Record<CompetitionType, string> = { league: 'League', cup: 'Cup', champions: 'Champions' }
const SYMBOLS: Record<CompetitionType, string> = { league: '👑', cup: '🥇', champions: '🏆' }
const STAGE_LABELS: Record<string, string> = {
  stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3', stage4: 'Stage 4', stage5: 'Stage 5', stage6: 'Stage 6', stage7: 'Stage 7',
  final: 'Final', finalReplay: 'Final Replay', roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals',
}
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

function reportCompetitionCache(label: string, diagnostic: { key: string; hit: boolean; reason: string; durationMs: number }) {
  if (!import.meta.env.DEV) return
  console.debug(`[Football Tracker performance] ${label} derived cache: ${diagnostic.hit ? 'HIT' : 'MISS'} · ${diagnostic.key} · ${diagnostic.reason} · ${diagnostic.durationMs.toFixed(3)}ms`)
}

export function CompetitionScreen({ season, screenState, onStateChange, onCompetitionTypeChange, onSeason, onNavigate }: { season: string; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; onCompetitionTypeChange: (type: CompetitionType) => void; onSeason: (season: string) => void; onNavigate: (view: View) => void }) {
  const { teams, players, matches, competitionStates = [], competitionRevisions = {}, competitionCacheOwner, teamCatalogRevision = 0, setChampionsDraw, completeSeason } = useStore()
  const type = screenState.competitionType
  const patchState = (patch: Partial<ScreenStateByView['competition']>) => onStateChange({ ...screenState, ...patch })
  const setType = (value: CompetitionType) => { if (value !== type) onCompetitionTypeChange(value) }
  const renderMark = `football-tracker:CompetitionScreen:${diagnosticSequence++}:start`
  if (import.meta.env.DEV && typeof performance !== 'undefined') performance.mark(renderMark)
  const tournamentTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const seasons = useMemo(() => [...new Set([...seasonsFromMatches(matches), ...competitionStates.map(state => state.season), season, 'Season 1'])].sort((a, b) => Number(b.match(/\d+/)?.[0] ?? 0) - Number(a.match(/\d+/)?.[0] ?? 0)), [matches, competitionStates, season])
  const draw = competitionStates.find(state => state.id === `champions:${season}`)
  const leagueRevision = competitionRevision(competitionRevisions, season, 'league')
  const cupRevision = competitionRevision(competitionRevisions, season, 'cup')
  const championsRevision = competitionRevision(competitionRevisions, season, 'champions')
  const league = useMemo(() => type === 'league' ? measuredInDevelopment('League standings derivation', () => selectLeagueCompetition(competitionCacheOwner, teams, matches, season, leagueRevision, teamCatalogRevision, reportLeagueCache, players)) : null, [type, competitionCacheOwner, teams, matches, players, season, leagueRevision, teamCatalogRevision])
  const cup = useMemo(() => type === 'cup' ? selectCupCompetition(competitionCacheOwner, tournamentTeams, matches, season, cupRevision, teamCatalogRevision, players, diagnostic => reportCompetitionCache('Cup', diagnostic)) : null, [type, competitionCacheOwner, tournamentTeams, matches, season, cupRevision, teamCatalogRevision, players])
  const champions = useMemo(() => type === 'champions' ? selectChampionsCompetition(competitionCacheOwner, draw, matches, season, championsRevision, players, diagnostic => reportCompetitionCache('Champions', diagnostic)) : null, [type, competitionCacheOwner, draw, matches, season, championsRevision, players])
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
    <div className="mb-3 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Competitions</h1><p className="text-xs text-zinc-500">Season and tournament detail</p></div><CompactFilterMenu value={season} options={seasons.map(item => ({ value: item, label: item }))} onChange={onSeason} label="Competition season" /></div>
    <div role="tablist" aria-label="Competition type" className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1">{(['league', 'cup', 'champions'] as CompetitionType[]).map(item => <button key={item} role="tab" aria-selected={type === item} type="button" onClick={() => setType(item)} className={`rounded-lg py-2 text-xs font-black ${type === item ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}><span aria-hidden>{SYMBOLS[item]}</span> {LABELS[item]}</button>)}</div>

    {type === 'league' && league && <LeagueView season={season} teams={teams} players={players} matches={matches} league={league} screenState={screenState} onStateChange={onStateChange} onNavigate={onNavigate} />}
    {type === 'cup' && cup && <CupView season={season} teams={teams} cup={cup} all={screenState.cupViewAll} onAll={value => patchState({ cupViewAll: value })} onNavigate={onNavigate} />}
    {type === 'champions' && <section>
      {champions && <><CompetitionHeader type="champions" label={champions.currentStage} season={season} champion={champions.championId ? teamById[champions.championId] : undefined} progress={champions.championId ? 'Champ' : STAGE_LABELS[champions.currentStage] ?? champions.currentStage} />
      {!champions.drawn ? <DrawPanel teams={tournamentTeams} drawnIds={draw?.kind === 'champions-draw' ? draw.teamIds : []} teamById={teamById} onDraw={ids => setChampionsDraw(season, ids)} /> : <ChampionsBracket teams={teamById} rounds={champions.rounds} championId={champions.championId} currentStage={champions.currentStage} onNavigate={onNavigate} />}</>}
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
    {type !== 'league' && stage >= 2 && <DeferredCompetitionBestElevens season={season} type={type} screenState={screenState} onStateChange={onStateChange} players={players} teams={teams} allMatches={matches} leagueMatches={leagueMatches} cup={cup} champions={champions} onNavigate={onNavigate} />}
    {stage >= 3 && <DeferredSeasonCompletion season={season} teams={tournamentTeams} players={players} matches={matches} draw={draw} finalized={finalized} nextSeason={nextSeason} onComplete={onComplete} />}
  </>
}

function DeferredCompetitionRankings({ season, type, screenState, onStateChange, players, teams, allMatches, leagueMatches, onNavigate }: { season: string; type: CompetitionType; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; players: Player[]; teams: Team[]; allMatches: Match[]; leagueMatches?: Match[]; onNavigate: (view: View) => void }) {
  const matches = useMemo(() => measuredInDevelopment('Competition match filtering/index lookup', () => type === 'league' && leagueMatches ? leagueMatches : competitionMatches(allMatches, season, type)), [type, leagueMatches, allMatches, season])
  return <CompetitionRankings season={season} type={type} screenState={screenState} onStateChange={onStateChange} players={players} teams={teams} matches={matches} onNavigate={onNavigate} />
}

function DeferredCompetitionBestElevens({ season, type, screenState, onStateChange, players, teams, allMatches, leagueMatches, cup, champions, onNavigate }: { season: string; type: CompetitionType; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; players: Player[]; teams: Team[]; allMatches: Match[]; leagueMatches?: Match[]; cup: CupCompetition | null; champions: ReturnType<typeof championsCompetition> | null; onNavigate: (view: View) => void }) {
  const matches = useMemo(() => measuredInDevelopment('Best XI match scope lookup', () => type === 'league' && leagueMatches ? leagueMatches : competitionMatches(allMatches, season, type)), [type, leagueMatches, allMatches, season])
  return <CompetitionBestElevens season={season} type={type} screenState={screenState} onStateChange={onStateChange} players={players} teams={teams} matches={matches} allMatches={allMatches} cup={cup} champions={champions} onNavigate={onNavigate} />
}

function DeferredSeasonCompletion({ season, teams, players, matches, draw, finalized, nextSeason, onComplete }: { season: string; teams: Team[]; players: Player[]; matches: Match[]; draw?: CompetitionState; finalized: boolean; nextSeason: string; onComplete: () => void }) {
  const { competitionCacheOwner, competitionRevisions = {}, teamCatalogRevision = 0 } = useStore()
  const leagueRevision = competitionRevision(competitionRevisions, season, 'league')
  const cupRevision = competitionRevision(competitionRevisions, season, 'cup')
  const championsRevision = competitionRevision(competitionRevisions, season, 'champions')
  const complete = useMemo(() => measuredInDevelopment('Deferred season completion', () => selectCompetitionSeasonComplete(competitionCacheOwner, teams, matches, season, leagueRevision, cupRevision, championsRevision, teamCatalogRevision, players, draw)), [competitionCacheOwner, teams, matches, season, leagueRevision, cupRevision, championsRevision, teamCatalogRevision, players, draw])
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
  const canonicalAward = useMemo(() => competitionAwardResult('league', season, teams, players, matches, [], { league }), [season, teams, players, matches, league])
  const seasonFallback = useMemo(() => performanceAwardResult(players, analytics.leagueMatches), [players, analytics.leagueMatches])
  const seasonXi = canonicalAward ? { slots: canonicalAward.bestXI, statsByPlayer: canonicalAward.statsByPlayer } : { slots: seasonFallback.bestXI, statsByPlayer: seasonFallback.statsByPlayer }
  const startedMonthlyBlocks = useMemo(() => startedMonthlyAwardBlocks(matches, season), [matches, season])
  const selectedMonthlyBlock = startedMonthlyBlocks.includes(screenState.monthlyAwardBlock ?? 0) ? screenState.monthlyAwardBlock! : startedMonthlyBlocks[startedMonthlyBlocks.length - 1]
  const selectedMonthlyAward = useMemo(() => selectedMonthlyBlock ? monthlyAwardForStartedBlock(teams, players, matches, season, selectedMonthlyBlock) : undefined, [teams, players, matches, season, selectedMonthlyBlock])
  return <section><CompetitionHeader type="league" label="League" season={season} champion={league.championId ? teams.find(team => team.id === league.championId) : undefined} progress={league.complete ? 'Completed · 30/30' : `MD ${league.matchdayProgress} / ${LEAGUE_MATCHES_PER_TEAM}`} /><SegmentedControl label="League view" value={tab} onChange={setTab} options={[{ value: 'players', label: 'Players' }, { value: 'table', label: 'Table' }, { value: 'form', label: 'Form' }, { value: 'history', label: 'History' }]} />
    <div className="mt-3">{tab === 'players' && <><RankingMetricTabs label="League player category" value={playerMetric} onChange={setPlayerMetric} options={RANKING_METRICS} /><section className="mt-3"><SectionHeader title={rankingTitle('league')} subtitle="Top 10" /><div {...playerSwipe} className="mt-2 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe League ranking metrics">{playerRows.map((row, index) => { const player = playerById.get(row.playerId); return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow positionLabel={row.scopedPositionFamily} rank={index + 1} compact player={player} team={teamById.get(row.historicalTeamId ?? row.teamId)} value={playerValue(row)} onPlayerNavigate={id => onNavigate({ name: 'player', id, season, competitionType: 'league' })} onTeamNavigate={id => onNavigate({ name: 'team', id })} /></div> })}{!playerRows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div><button type="button" onClick={() => onNavigate({ name: 'global-ranking', season, competitionType: 'league', rankingMetric: playerMetric })} className="secondary-view-all mt-3 w-full">View All</button></section>{['goals', 'assists', 'mom', 'rating'].includes(playerMetric) && <RaceHistoryPanel analytics={analytics} metric={playerMetric as 'goals' | 'assists' | 'mom' | 'rating'} players={Object.fromEntries(players.map(player => [player.id, player]))} />}<AwardRacePanel race={canonicalAward} season={season} type="league" players={players} teams={teams} onNavigate={onNavigate} /><section className="mt-5"><SegmentedControl label="League Best XI" value={bestXiMode} onChange={value => setBestXiMode(value as typeof bestXiMode)} options={[{ value: 'season', label: 'League Best XI' }, { value: 'monthly', label: 'Team of the Month' }]} />{bestXiMode === 'season' ? <BestEleven title="League Best XI" xi={seasonXi} bestPlayerId={canonicalAward?.bestPlayerId} season={season} competitionType="league" players={players} teams={teams} onNavigate={onNavigate} /> : selectedMonthlyAward ? <><AwardScopeSelector ariaLabel="Team of the Month period" options={startedMonthlyBlocks.map(block => ({ value: block, label: `${Number(season.match(/\d+/)?.[0] ?? 1)}-${block}` }))} value={selectedMonthlyBlock} onChange={block => patchState({ monthlyAwardBlock: Number(block) })} /><p className="mt-2 text-[10px] text-zinc-500">{selectedMonthlyAward.scopeLabel} · {selectedMonthlyAward.finalized ? 'Finalized' : 'In progress'} · Player of the Month is marked blue.</p><AwardBestXI title="Team of the Month" result={selectedMonthlyAward} players={players} teams={teams} onPlayerOpen={id => onNavigate({ name: 'player', id, season, competitionType: 'league' })} /></> : <Empty text="Not available yet." />}</section></>}{tab === 'table' && (current.length ? <StandingsTable standings={current} teams={teams} compact onTeamNavigate={id => onNavigate({ name: 'team', id })} /> : <Empty text="No League data for this season." />)}
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
  const playedTeams = new Set(cup.stageMatches.flatMap(match => teamsCreditedWithResult(match)).filter(id => cup.activeTeamIds.includes(id))).size
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

function ChampionsBracket({ teams, rounds, championId, currentStage, onNavigate }: { teams: Record<string, Team>; rounds: ReturnType<typeof championsCompetition>['rounds']; championId?: string; currentStage: string; onNavigate: (view: View) => void }) {
  const projection = projectChampionsBracket(rounds)
  const placeholders = (stage: 'quarterFinal' | 'semiFinal' | 'final') => projection[stage].map((teamIds, index): ChampionsPairing => ({ id: `projected:${stage}:${index}`, stage, teamIds, matches: [], tied: false, requiredMatches: 0, rowWinners: [] }))
  rounds = { ...rounds, quarterFinal: rounds.quarterFinal.length ? rounds.quarterFinal : placeholders('quarterFinal'), semiFinal: rounds.semiFinal.length ? rounds.semiFinal : placeholders('semiFinal'), final: rounds.final.length ? rounds.final : placeholders('final') }
  const card = (pairing: ChampionsPairing) => {
    const games = (teamId: string) => pairing.teamGames?.[teamId] ?? pairing.matches.filter(match => isRecordedForTeam(match, teamId))
    const score = (match: Match | undefined, teamId: string) => { const perspective = match && teamPerspectiveScore(match, teamId); return perspective ? `${perspective.goalsFor}-${perspective.goalsAgainst}` : '–' }
    const rows = Array.from({ length: pairing.requiredMatches }, (_, index) => index)
    const projected = pairing.id.startsWith('projected:')
    const iconTone = (id: string) => resultTone(projected || !pairing.winnerId ? 'N' : pairing.winnerId === id ? 'W' : 'L')
    const scoreTone = (id: string, index: number) => resultTone(pairing.rowWinners?.[index] === id ? 'W' : pairing.rowWinners?.[index] ? 'L' : 'N')
    return <div key={pairing.id} className={`relative rounded-xl border p-2 shadow-lg ${!projected && pairing.stage === currentStage ? 'border-cyan-300/60 bg-cyan-400/10' : 'border-white/10 bg-zinc-900'}`}><div className="mb-2 grid grid-cols-2 gap-2">{pairing.teamIds.map((id, index) => id === 'TBD' ? <span key={`${id}:${index}`} className="mx-auto grid h-6 w-6 place-items-center rounded-full border border-zinc-400/30 bg-zinc-700/50 text-[6px] font-black text-zinc-400">TBD</span> : <span key={id} className="grid min-w-0 justify-items-center gap-0.5" onClick={event => event.stopPropagation()}><TeamIdentityAction team={teams[id]} onNavigate={teamId => onNavigate({ name: 'team', id: teamId })} className={`rounded-full border p-0.5 ${iconTone(id)}`} iconClassName="h-6 w-6 text-[6px]" /><TeamIdentityAction team={teams[id]} onNavigate={teamId => onNavigate({ name: 'team', id: teamId })} className="max-w-full truncate text-center text-[9px] font-semibold">{teams[id]?.shortName ?? teams[id]?.name ?? id}</TeamIdentityAction></span>)}</div>{!projected && <><div className="grid grid-cols-2 gap-x-2 gap-y-1">{rows.flatMap(index => pairing.teamIds.map(id => <span key={`${id}:${index}`} className={`rounded border px-1 py-0.5 text-center text-[10px] font-black ${scoreTone(id, index)}`}>{score(games(id)[index], id)}</span>))}</div><p className="mt-1 border-t border-white/5 pt-1 text-center text-[8px] text-zinc-600">{pairing.teamGames ? `${games(pairing.teamIds[0]).length}/${pairing.requiredMatches} · ${games(pairing.teamIds[1]).length}/${pairing.requiredMatches}` : `${pairing.matches.length}/${pairing.requiredMatches} matches`}</p></>}</div>
  }
  return <div aria-label="Champions fixed knockout bracket" className="champions-bracket-scroll no-scrollbar overflow-x-auto overflow-y-hidden"><div className="grid min-w-[780px] grid-cols-[1.35fr_1fr_.9fr_1fr_1.35fr] items-center gap-4 rounded-2xl border border-blue-400/10 bg-gradient-to-b from-slate-950 to-black p-4"><Round title="Round of 16" pairs={rounds.roundOf16.slice(0, 4)} card={card} side="left" /><div className="space-y-10"><Round title="Quarter-finals" pairs={rounds.quarterFinal.slice(0, 2)} card={card} side="left" /><Round title="Semi-final" pairs={rounds.semiFinal.slice(0, 1)} card={card} side="left" /></div><div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-amber-300/40 bg-amber-300/10 text-3xl">🏆</div><p className="mt-2 text-[10px] font-black uppercase text-amber-300">{championId ? <TeamIdentityAction team={teams[championId]} onNavigate={teamId => onNavigate({ name: 'team', id: teamId })}>{teams[championId]?.name}</TeamIdentityAction> : 'Champion'}</p>{rounds.final[0] && <div className="mt-3">{card(rounds.final[0])}</div>}</div><div className="space-y-10"><Round title="Semi-final" pairs={rounds.semiFinal.slice(1)} card={card} side="right" /><Round title="Quarter-finals" pairs={rounds.quarterFinal.slice(2)} card={card} side="right" /></div><Round title="Round of 16" pairs={rounds.roundOf16.slice(4)} card={card} side="right" /></div></div>
}

function Round({ title, pairs, card, side }: { title: string; pairs: ChampionsPairing[]; card: (pairing: ChampionsPairing) => React.ReactNode; side: 'left' | 'right' }) {
  return <div className="relative"><span aria-hidden className={`absolute top-1/2 h-px w-4 bg-cyan-300/20 ${side === 'left' ? '-right-4' : '-left-4'}`} /><p className="mb-2 text-center text-[9px] font-black uppercase tracking-wide text-cyan-200/50">{title}</p><div className="space-y-3">{pairs.map(card)}</div></div>
}

function CompetitionRankings({ season, type, screenState, onStateChange, players, teams, matches, onNavigate }: { season: string; type: CompetitionType; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; players: Player[]; teams: Team[]; matches: Match[]; onNavigate: (view: View) => void }) {
  const metric = screenState.rankingMetric as LeaderboardMetric
  const setMetric = (next: LeaderboardMetric) => onStateChange({ ...screenState, rankingMetric: next })
  const rankingIndex = useMemo(() => measuredInDevelopment('Deferred Global Rankings/player stats/rating derivation', () => buildGlobalRankingData(players, matches, { seasons: [season], teams: [], positions: [] }, 'rating')), [players, matches, season])
  const rows = useMemo(() => measuredInDevelopment('Global Rankings metric ordering', () => rankGlobalRankingRows(rankingIndex, players, metric)), [rankingIndex, players, metric])
  const playerById = useMemo(() => Object.fromEntries(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])), [teams])
  const rankingSwipe = useMetricSwipe(RANKING_METRICS.map(item => item.value), metric, setMetric)
  return <section className="mt-7"><SectionHeader title={rankingTitle(type)} subtitle={`${season} · Top 10`} />
    <RankingMetricTabs label={`${LABELS[type]} ranking metric`} value={metric} onChange={setMetric} options={RANKING_METRICS} />
    <div {...rankingSwipe} className="mt-2 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe competition ranking metrics">{rows.slice(0, 10).map((row, index) => { const player = playerById[row.playerId]; const team = teamById[row.historicalTeamId ?? row.teamId]; return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow positionLabel={row.scopedPositionFamily} rank={index + 1} compact player={player} team={team} value={formatRankingMetricValue(metric, row.value)} onPlayerNavigate={id => onNavigate({ name: 'player', id, season, competitionType: type })} onTeamNavigate={id => onNavigate({ name: 'team', id })} /></div> })}{!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div>
    <button type="button" onClick={() => onNavigate({ name: 'global-ranking', season, competitionType: type, rankingMetric: metric })} className="secondary-view-all mt-3 w-full">View All</button>
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

function AwardScopeSelector({ ariaLabel, options, value, onChange }: { ariaLabel: string; options: { value: string | number; label: string }[]; value: string | number | undefined; onChange: (value: string | number) => void }) {
  if (options.length < 2) return null
  return <div role="group" aria-label={ariaLabel} className="mt-3 flex flex-wrap gap-1">{options.map(option => <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)} className={`rounded-full px-2.5 py-1 text-[10px] font-black ${option.value === value ? 'bg-emerald-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>{option.label}</button>)}</div>
}

function CompetitionBestElevens({ season, type, screenState, onStateChange, players, teams, matches, allMatches, cup, champions, onNavigate }: { season: string; type: CompetitionType; screenState: ScreenStateByView['competition']; onStateChange: (state: ScreenStateByView['competition']) => void; players: Player[]; teams: Team[]; matches: Match[]; allMatches: Match[]; cup: CupCompetition | null; champions: ReturnType<typeof championsCompetition> | null; onNavigate: (view: View) => void }) {
  const { competitionStates = [] } = useStore()
  const tournamentTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const awardModels = useMemo(() => type === 'cup' ? { cup: cup ?? undefined } : type === 'champions' ? { champions: champions ?? undefined } : {}, [type, cup, champions])
  const seasonFallback = useMemo(() => measuredInDevelopment('Deferred Best XI fallback', () => performanceAwardResult(players, matches)), [players, matches])
  const canonicalAward = useMemo(() => competitionAwardResult(type, season, tournamentTeams, players, allMatches, competitionStates, awardModels), [type, season, tournamentTeams, players, allMatches, competitionStates, awardModels])
  const cupStages = useMemo(() => startedCupAwardStages(allMatches, season), [allMatches, season])
  const championsRounds = useMemo(() => startedChampionsAwardRounds(allMatches, season), [allMatches, season])
  const availableScopes = type === 'cup' ? cupStages : championsRounds
  const storedScope = type === 'cup' ? screenState.cupAwardStage : screenState.championsAwardRound
  const selectedScope = availableScopes.includes(storedScope as never) ? storedScope! : availableScopes[availableScopes.length - 1]
  const scopeMatches = useMemo(() => !selectedScope ? [] : matches.filter(match => {
    const stage = matchCompetitionStage(match)
    return selectedScope === 'final' ? stage === 'final' || stage === 'finalReplay' : stage === selectedScope
  }), [matches, selectedScope])
  const scopeAward = useMemo(() => scopeMatches.length ? performanceAwardResult(players, scopeMatches) : undefined, [players, scopeMatches])
  const patchScope = (value: string | number) => onStateChange({ ...screenState, ...(type === 'cup' ? { cupAwardStage: value as CupStage } : { championsAwardRound: value as Exclude<ChampionsStage, 'finalReplay'> }) })
  const finalXI = canonicalAward ? { slots: canonicalAward.bestXI, statsByPlayer: canonicalAward.statsByPlayer } : { slots: seasonFallback.bestXI, statsByPlayer: seasonFallback.statsByPlayer }
  const scopeTitle = type === 'cup' ? `Cup Team of ${selectedScope === 'final' ? 'the Final' : `Stage ${String(selectedScope).replace('stage', '')}`}` : `Champions ${selectedScope === 'roundOf16' ? 'R16' : selectedScope === 'quarterFinal' ? 'QF' : selectedScope === 'semiFinal' ? 'SF' : 'Final'} Best XI`
  const scopeOptions = availableScopes.map(scope => ({ value: scope, label: type === 'cup' ? scope === 'final' ? 'Final' : `Stage ${String(scope).replace('stage', '')}` : scope === 'roundOf16' ? 'R16' : scope === 'quarterFinal' ? 'QF' : scope === 'semiFinal' ? 'SF' : 'Final' }))
  return <><AwardRacePanel race={canonicalAward} season={season} type={type} players={players} teams={teams} onNavigate={onNavigate} /><section className="mt-7"><h2 className="text-lg font-semibold">{canonicalAward?.complete ? 'Best XI' : 'Best XI Race'}</h2><p className="mb-3 text-xs text-zinc-500">Competition-scoped · existing 4-3-3 position rules</p>{scopeAward && selectedScope && <><AwardScopeSelector ariaLabel={type === 'cup' ? 'Cup Team of Stage' : 'Champions round'} options={scopeOptions} value={selectedScope} onChange={patchScope} /><BestEleven title={scopeTitle} xi={{ slots: scopeAward.bestXI, statsByPlayer: scopeAward.statsByPlayer }} bestPlayerId={scopeAward.bestPlayerId} players={players} teams={teams} onNavigate={onNavigate} season={season} competitionType={type} /></>}<BestEleven title={canonicalAward?.teamLabel ?? competitionAwardLabel(type)} xi={finalXI} bestPlayerId={canonicalAward?.bestPlayerId} players={players} teams={teams} onNavigate={onNavigate} season={season} competitionType={type} /></section></>
}

function AwardRacePanel({ race, season, type, players, teams, onNavigate }: { race: CanonicalAwardResult | undefined; season: string; type: CompetitionType; players: Player[]; teams: Team[]; onNavigate: (view: View) => void }) {
  const [showAll, setShowAll] = useState(false)
  const candidates = race?.candidates ?? []
  const visible = showAll ? candidates : candidates.slice(0, 3)
  const byPlayer = new Map(players.map(player => [player.id, player]))
  const byTeam = new Map(teams.map(team => [team.id, team]))
  return <section className="mt-7"><h2 className="text-lg font-semibold">Award Race</h2><p className="mb-3 text-xs text-zinc-500">{race?.complete ? 'Final award scoring' : 'Current standings · provisional award score'} · official 40% eligibility</p>{visible.length ? <><div className="overflow-hidden rounded-xl bg-zinc-900">{visible.map((candidate, index) => <div key={`${candidate.playerId}:${candidate.teamId}`} className="border-b border-white/5 last:border-0"><RankingRow rank={index + 1} compact player={byPlayer.get(candidate.playerId)} team={byTeam.get(candidate.teamId)} positionLabel={candidate.family} value={candidate.selectionScore.toFixed(2)} onPlayerNavigate={id => onNavigate({ name: 'player', id, season, competitionType: type })} onTeamNavigate={id => onNavigate({ name: 'team', id })} /></div>)}</div>{candidates.length > 3 && <button type="button" onClick={() => setShowAll(value => !value)} className="secondary-view-all mt-3 w-full">{showAll ? 'Show Top 3' : 'View All'}</button>}</> : <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">Race begins after more matches are played.</p>}</section>
}

function BestEleven({ title, xi, bestPlayerId, players, teams, onNavigate, season, competitionType }: { title: string; xi: { slots: import('../types').Best11Slot[]; statsByPlayer: Record<string, { goals: number; assists: number; avgRating?: number }> }; bestPlayerId?: string; players: Player[]; teams: Team[]; onNavigate: (view: View) => void; season: string; competitionType: CompetitionType }) {
  return <AwardBestXI title={title} result={{ bestXI: xi.slots, statsByPlayer: xi.statsByPlayer, bestPlayerId }} players={players} teams={teams} onPlayerOpen={id => onNavigate({ name: 'player', id, season, competitionType })} />
}

function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-500">{text}</p> }
