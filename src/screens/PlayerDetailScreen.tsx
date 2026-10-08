import { useEffect, useMemo, useRef, useState } from 'react'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { TeamIdentityAction } from '../components/EntityActions'
import { formatDate, playerFullName, ratingTone } from '../components/ui'
import { GOOD_RATING_THRESHOLD } from '../engine/constants'
import { playerChemistry, startingPPG } from '../engine/analytics'
import { substituteImpact } from '../engine/substituteImpact'
import { derivePlayerScope, playerAppearanceMatches, playerCareerTimeline, playerPersonalRecords, type PlayerDerived } from '../engine/playerDerived'
import { matchCompetitionType, assignmentSnapshotForMatch, formatCompactCompetitionContext } from '../engine/competitionContext'
import { getMatchManOfTheMatch, matchScore, ratePlayerMatch, tracePlayerMatchRating } from '../engine/rating'
import { buildGlobalRankingData, rankGlobalRankingRows, seasonsFromMatches } from '../engine/stats'
import { buildSeasonAnalytics, scopedMetricRanks } from '../engine/seasonAnalytics'
import { playerStreaks } from '../engine/seasonInsights'
import { deriveNews } from '../engine/news'
import { playerTeamTitles } from '../engine/historyReadModels'
import { scopedPositionFamilyByPlayer } from '../engine/positionScope'
import { positionFamily } from '../engine/positionScope'
import { latestAppearanceTeamId } from '../engine/playerDetailScope'
import { playerForm } from '../engine/playerForm'
import { playerRankTrend, rankTrendMetricOptions, type RankTrendMetric } from '../engine/playerRankTrend'
import { careerNextMilestones } from '../engine/nextMilestones'
import { recordedTeamId } from '../engine/matchPerspective'
import { CompactFilterMenu } from '../components/CompactFilterMenu'
import { RankingMetricTabs } from '../components/RankingRow'
import { useStore } from '../store'
import { currentMembershipPresentation } from '../lib/currentMembershipPresentation'
import { recentFormLabelColor, scrollTrendToLatest, TREND_POINT_SPACING, trendPlotWidth } from '../lib/trendPlot'
import type { CompetitionType, Match, Player, RatingBreakdown, ScreenStateByView, View } from '../types'

const competitions: { value: CompetitionType | 'all'; label: string }[] = [{ value: 'all', label: 'All competitions' }, { value: 'league', label: 'League' }, { value: 'cup', label: 'Cup' }, { value: 'champions', label: 'Champions' }]
const pct = (number: number) => `${number.toFixed(0)}%`
const value = (number: number | null | undefined, digits = 2) => number === null || number === undefined || !Number.isFinite(number) ? '—' : number.toFixed(digits)
const fieldPositions = new Set(['CB', 'LB', 'RB'])
const metric = (label: string, content: string | number) => <div key={label} className="rounded-xl bg-black/20 px-2 py-2 text-center"><b className="block text-sm tabular-nums">{content}</b><small className="block text-[9px] uppercase text-zinc-500">{label}</small></div>

export function PlayerDetailScreen({ playerId, season, screenState, onStateChange, onNavigate, onBack }: { playerId: string; season: string; screenState: ScreenStateByView['player']; onStateChange: (state: ScreenStateByView['player']) => void; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches, competitionStates = [] } = useStore()
  const player = players.find(item => item.id === playerId)
  const seasons = useMemo(() => seasonsFromMatches(matches), [matches])
  const selectedSeason = screenState.season && seasons.includes(screenState.season) ? screenState.season : seasons.includes(season) ? season : seasons[0] ?? season
  const competition = screenState.competition
  const setSelectedSeason = (value: string) => onStateChange({ ...screenState, season: value, rankTrendMetric: 'rating' })
  const setCompetition = (value: CompetitionType | 'all') => onStateChange({ ...screenState, competition: value, rankTrendMetric: 'rating' })
  const scopedMatches = useMemo(() => matches.filter(match => match.season === selectedSeason && (competition === 'all' || matchCompetitionType(match) === competition)), [matches, selectedSeason, competition])
  const playerScopedMatches = useMemo(() => scopedMatches.filter(match => match.appearances.some(appearance => appearance.playerId === playerId)), [scopedMatches, playerId])
  const scopedFamilies = useMemo(() => scopedPositionFamilyByPlayer(players, scopedMatches, {}), [players, scopedMatches])
  const careerFamilies = useMemo(() => scopedPositionFamilyByPlayer(players, matches, {}), [players, matches])
  const rankingIndex = useMemo(() => buildGlobalRankingData(players, scopedMatches, { seasons: [selectedSeason], teams: [], positions: [] }, 'rating'), [players, scopedMatches, selectedSeason])
  const rankingRows = useMemo(() => ({ rating: rankGlobalRankingRows(rankingIndex, players, 'rating'), goals: rankGlobalRankingRows(rankingIndex, players, 'goals'), assists: rankGlobalRankingRows(rankingIndex, players, 'assists') }), [rankingIndex, players])
  const activeStreaks = useMemo(() => player ? playerStreaks(player, playerScopedMatches).filter(row => row.current > 1).sort((a, b) => b.current - a.current).slice(0, 3) : [], [player, playerScopedMatches])
  const leagueAnalytics = useMemo(() => competition === 'all' || competition === 'league' ? buildSeasonAnalytics(teams, players, matches, selectedSeason) : undefined, [competition, teams, players, matches, selectedSeason])
  let playerDerivedCacheHit = false
  const data = player ? derivePlayerScope(player, players, matches, { season: selectedSeason, competition }, diagnostic => { playerDerivedCacheHit = diagnostic.cacheHit }) : null
  const dominantPosition = (data?.minutes ? scopedFamilies.get(playerId) : careerFamilies.get(playerId)) ?? player?.position
  const historicalTeamId = latestAppearanceTeamId(playerId, playerScopedMatches)
  const teamRankingIndex = historicalTeamId ? buildGlobalRankingData(players, scopedMatches, { seasons: [selectedSeason], teams: [historicalTeamId], positions: [] }, 'rating') : []
  const teamRankingRows = { rating: rankGlobalRankingRows(teamRankingIndex, players, 'rating'), goals: rankGlobalRankingRows(teamRankingIndex, players, 'goals'), assists: rankGlobalRankingRows(teamRankingIndex, players, 'assists') }
  if (!player || !data) return <div className="p-6 text-sm text-zinc-400">Player not found.</div>
  const membership = currentMembershipPresentation(player, [], teams)
  const currentTeam = teams.find(team => team.id === membership.teamId)
  const form = playerForm(data.appearances)
  const rankIn = (metric: 'rating' | 'goals' | 'assists') => ({ ...scopedMetricRanks(rankingRows[metric], players, player.id, scopedFamilies), team: scopedMetricRanks(teamRankingRows[metric], players, player.id).team })
  const ranks = { rating: rankIn('rating'), goals: rankIn('goals'), assists: rankIn('assists') }
  const monthlyAwards = leagueAnalytics ? [...leagueAnalytics.monthlyAwards.values()].flatMap(award => [award.playerOfMonth?.playerId === player.id ? 'Player of the Month' : null, award.bestXI.some(slot => slot.playerId === player.id) ? 'Monthly Best XI' : null].filter((item): item is string => Boolean(item))) : []
  const awards = [...monthlyAwards, ...playerTeamTitles(teams, players, matches, competitionStates, player.id, selectedSeason, competition)]
  const scopedMatchIds = new Set(playerScopedMatches.map(match => match.id))
  const milestones = deriveNews(players, teams, matches).filter(item => item.playerId === player.id && item.milestone && item.matchId && scopedMatchIds.has(item.matchId)).slice(0, 3)
  const positions = [...data.positionMinutes.entries()].map(([position, minutes]) => ({ position, minutes, share: data.minutes ? minutes / data.minutes * 100 : 0 })).filter(row => row.share >= 10).sort((left, right) => right.share - left.share || right.minutes - left.minutes)
  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">Back</button>
    <header className="mb-4 flex items-start gap-3"><PlayerAvatar photoUrl={player.photoUrl || player.image} number={player.number} className="h-14 w-14 text-sm" /><div className="min-w-0 flex-1"><p className="text-xs text-zinc-400"><TeamIdentityAction team={currentTeam} onNavigate={id => onNavigate({ name: 'team', id })} className="inline-flex items-center gap-1">{membership.label}</TeamIdentityAction> · #{player.number} · {dominantPosition}</p><h1 className="break-words text-2xl font-semibold">{playerFullName(player)}</h1><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onNavigate({ name: 'edit-player', id: player.id })} className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-bold">Edit player</button><button type="button" onClick={() => onNavigate({ name: 'comparison', leftId: player.id, season: selectedSeason, competitionType: competition })} className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-bold">Compare</button></div></div></header>
    <div className="mb-4 grid grid-cols-2 gap-2"><CompactFilterMenu value={selectedSeason} options={seasons.map(item => ({ value: item, label: item }))} onChange={setSelectedSeason} label="Player detail season" popupAlign="start" /><CompactFilterMenu value={competition} options={competitions} onChange={setCompetition} label="Player detail competition" allValue="all" allLabel="All competitions" allAccessibilityLabel="All competitions" /></div>
    <Overview data={data} ranks={ranks} />
    <RecentForm form={form} playerId={playerId} players={players} teams={teams} onNavigate={onNavigate} />
    <DeferredRankTrend playerId={playerId} players={players} matches={matches} season={selectedSeason} competition={competition} position={dominantPosition} metric={screenState.rankTrendMetric} onMetric={rankTrendMetric => onStateChange({ ...screenState, rankTrendMetric })} />
    <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Active Streaks</h2>{activeStreaks.length ? <div className="mt-2 flex flex-wrap gap-2">{activeStreaks.map(row => <span key={row.key} className="rounded-full bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300">{row.current} straight · {row.label}</span>)}</div> : <p className="mt-2 text-xs text-zinc-500">No active streak.</p>}</section>
    <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><div><h2 className="text-sm font-semibold">Awards {awards.length}</h2><p className="text-[10px] text-zinc-500">Season awards and titles in {selectedSeason}</p></div>{awards.length ? <div className="mt-2 space-y-1">{awards.slice().reverse().map((award, index) => <p key={`${award}:${index}`} className="rounded-lg bg-black/20 px-2 py-1.5 text-xs">{award}</p>)}</div> : <p className="mt-2 text-xs text-zinc-500">No completed awards or team titles yet.</p>}</section>
    {milestones.length > 0 && <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Recent Milestones</h2><div className="mt-2 space-y-1">{milestones.map(item => <button key={item.id} type="button" onClick={() => item.matchId && onNavigate({ name: 'match', id: item.matchId })} className="block w-full rounded-lg bg-black/20 px-2 py-1.5 text-left text-xs">{item.title.replace(/^.*? · /, '')}</button>)}</div></section>}
    <PositionStats data={data} position={dominantPosition ?? player.position} />
    <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Positions Played</h2><p className="mt-1 text-[10px] text-zinc-500">Match-position timeline minutes · positions under 10% are hidden.</p>{positions.length ? <div className="mt-3 space-y-2">{positions.map(row => <div key={row.position} className="grid grid-cols-[34px_1fr_auto] items-center gap-2 text-xs"><b>{row.position}</b><span className="h-2 overflow-hidden rounded-full bg-black/30"><span className="block h-full rounded-full bg-emerald-400" style={{ width: `${row.share}%` }} /></span><span className="tabular-nums">{pct(row.share)} · {row.minutes}'</span></div>)}</div> : <p className="mt-2 text-xs text-zinc-500">No position minutes yet.</p>}</section>
    <StartingPerformance rows={data.startingPerformance} teams={teams} />
    <DeferredMount player={player} players={players} teams={teams} matches={matches} scopedMatches={playerScopedMatches} data={data} displayCacheHit={playerDerivedCacheHit} dominantPosition={dominantPosition ?? player.position} onNavigate={onNavigate} />
  </div>
}

function Overview({ data, ranks }: { data: PlayerDerived; ranks: Record<'rating' | 'goals' | 'assists', { overall: number | null; position: number | null; team: number | null }> }) { return <section className="mb-4 rounded-2xl border border-white/5 bg-zinc-900 p-3"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Overview</h2><p className="text-[10px] text-zinc-500">Core stats in the selected scope</p></div><b className={`rounded-full px-2 py-1 text-sm ${ratingTone(data.averageRating || 6)}`}>{data.apps ? value(data.averageRating) : '—'}</b></div><div className="grid grid-cols-3 gap-1.5"><RankedMetric label="Avg Rating" value={data.apps ? value(data.averageRating) : '—'} ranks={ranks.rating} /><RankedMetric label="Goals" value={data.goals} ranks={ranks.goals} /><RankedMetric label="Assists" value={data.assists} ranks={ranks.assists} /></div><div className="mt-2 grid grid-cols-3 gap-1.5"><AppsMetric apps={data.apps} starts={data.starts} subs={data.subs} />{metric('Minutes', data.minutes)}{metric('MOM', data.mom)}</div><p className="mt-2 text-[10px] text-zinc-500">Ranks: overall · position family · team.</p></section> }
function AppsMetric({ apps, starts, subs }: { apps: number; starts: number; subs: number }) { return <div aria-label={`${apps} appearances: ${starts} starts and ${subs} substitute appearances`} className="rounded-xl bg-black/20 px-2 py-2 text-center"><b className="block text-sm tabular-nums">{apps}</b><span className="mt-0.5 block text-[8px] tabular-nums text-zinc-400"><span>{starts}</span><span className="ml-2">{subs}</span></span><small className="block text-[9px] uppercase text-zinc-500">Apps</small></div> }
function RankedMetric({ label, value: content, ranks }: { label: string; value: string | number; ranks: { overall: number | null; position: number | null; team: number | null } }) { const rank = (item: number | null) => item ? `#${item}` : '—'; return <div className="rounded-xl bg-black/20 px-2 py-2 text-center"><b className="block text-sm tabular-nums">{content}</b><small className="block text-[9px] uppercase text-zinc-500">{label}</small><div className="mt-1 grid grid-cols-3 gap-0.5 text-[8px] text-zinc-400"><span aria-label={`Overall rank ${rank(ranks.overall)}`}>{rank(ranks.overall)}</span><span aria-label={`Position-family rank ${rank(ranks.position)}`}>{rank(ranks.position)}</span><span aria-label={`Team rank ${rank(ranks.team)}`}>{rank(ranks.team)}</span></div></div> }
function RecentForm({ form, playerId, players, teams, onNavigate }: { form: ReturnType<typeof playerForm>; playerId: string; players: Player[]; teams: { id: string; name: string; shortName: string }[]; onNavigate: (view: View) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = trendPlotWidth(form.points.length)
  const values = form.points.map(row => row.rating.raw)
  const min = Math.min(5, ...values); const max = Math.max(9, ...values)
  const x = (index: number) => 18 + index * TREND_POINT_SPACING
  const y = (rating: number) => 60 - (rating - min) / Math.max(1, max - min) * 44
  useEffect(() => scrollTrendToLatest(scrollRef.current), [form.points.length, form.points[form.points.length - 1]?.match.id])
  const opponent = (match: Match) => {
    const playedFor = match.appearances.find(appearance => appearance.playerId === playerId)?.teamId
    const opponentId = playedFor === match.homeTeamId ? match.awayTeamId : match.homeTeamId
    return (playedFor === recordedTeamId(match) ? match.opponentName : undefined) || teams.find(team => team.id === opponentId)?.shortName || opponentId
  }
  return <section className="mb-4 rounded-2xl bg-zinc-900 p-3">
    <div className="flex items-end justify-between"><div><h2 className="text-sm font-semibold">Recent Form</h2><p className="text-[10px] text-zinc-500">Player Form · {form.points.length} actual appearances</p></div><span className="text-[10px] text-zinc-500">Good {GOOD_RATING_THRESHOLD}+</span></div>
    <div className="mt-3 grid grid-cols-3 gap-1.5">{metric(form.count === 5 ? 'Last 5 avg' : 'Last ' + (form.count || 5) + ' avg', value(form.recentAverage))}{metric('Season avg', value(form.average))}{metric('Trend', form.delta === null ? '—' : (form.delta > 0 ? '↑ +' : form.delta < 0 ? '↓ ' : '→ ') + value(form.delta))}</div>
    {form.points.length > 0 && <div ref={scrollRef} className="no-scrollbar mt-3 overflow-x-auto overscroll-x-contain" aria-label="Recent Form horizontal plot">
      <svg width={width} height={82} role="img" aria-label={'All ' + form.points.length + ' raw match ratings, older to newer'} className="block">
        <line x1={18} x2={width - 18} y1={form.average === null ? 60 : y(form.average)} y2={form.average === null ? 60 : y(form.average)} stroke="#52525b" strokeDasharray="3 3" />
        {form.points.length > 1 && <polyline fill="none" stroke="#34d399" strokeWidth="2" points={values.map((rating, index) => x(index) + ',' + y(rating)).join(' ')} />}
        {form.points.map((row, index) => <g key={row.match.id}><circle cx={x(index)} cy={y(row.rating.raw)} r="3" fill="#34d399" /><text x={x(index)} y={y(row.rating.raw) - 7} textAnchor="middle" fontSize="9" fontWeight="700" fill={recentFormLabelColor(row.rating.rating, getMatchManOfTheMatch(row.match, players) === playerId)}>{row.rating.rating.toFixed(1)}</text><title>{opponent(row.match) + ' · ' + row.rating.raw.toFixed(2) + ' · ' + matchCompetitionType(row.match)}</title></g>)}
      </svg>
    </div>}
    <div className="mt-3 flex gap-1.5">{form.recent.slice().reverse().map(row => <button type="button" aria-label={'Open match with rating ' + row.rating.rating.toFixed(1)} onClick={() => onNavigate({ name: 'match', id: row.match.id })} key={row.match.id} className={'grid min-h-11 flex-1 place-items-center rounded-lg text-xs font-black ' + ratingTone(row.rating.rating)}>{row.rating.rating.toFixed(1)}</button>)}{!form.count && <span className="text-xs text-zinc-500">No actual appearances in this scope.</span>}</div>
  </section>
}

function DeferredRankTrend({ playerId, players, matches, season, competition, position, metric, onMetric }: { playerId: string; players: Player[]; matches: Match[]; season: string; competition: CompetitionType | 'all'; position?: string; metric: RankTrendMetric; onMetric: (metric: RankTrendMetric) => void }) {
  const [ready, setReady] = useState(() => typeof window === 'undefined')
  useEffect(() => { if (typeof window === 'undefined') return; const timer = window.setTimeout(() => setReady(true), 80); return () => window.clearTimeout(timer) }, [playerId, players, matches, season, competition])
  return ready ? <RankTrend key={`${playerId}:${season}:${competition}`} playerId={playerId} players={players} matches={matches} season={season} competition={competition} position={position} metric={metric} onMetric={onMetric} /> : <div className="mb-4 h-44 rounded-2xl bg-zinc-900/60" aria-label="Loading rank trend" />
}

export function RankTrend({ playerId, players, matches, season, competition, position, metric = 'rating', onMetric }: { playerId: string; players: Player[]; matches: Match[]; season: string; competition: CompetitionType | 'all'; position?: string; metric?: RankTrendMetric; onMetric?: (metric: RankTrendMetric) => void }) {
  const [selected, setSelected] = useState<'overall' | 'position' | 'team'>('position')
  const scrollRef = useRef<HTMLDivElement>(null)
  const scopedMatches = useMemo(() => matches.filter(match => match.season === season && (competition === 'all' || matchCompetitionType(match) === competition)), [matches, season, competition])
  const family = position ?? scopedPositionFamilyByPlayer(players, scopedMatches, {}).get(playerId) ?? players.find(player => player.id === playerId)?.position
  const options = rankTrendMetricOptions(family)
  const chosen = options.some(option => option.value === metric) ? metric : 'rating'
  const points = useMemo(() => playerRankTrend(playerId, players, matches, season, competition, chosen), [playerId, players, matches, season, competition, chosen])
  const valid = points.filter(row => row[selected] !== null)
  const highest = Math.max(2, ...valid.map(row => row[selected] ?? 0))
  const width = trendPlotWidth(points.length)
  const x = (index: number) => 18 + index * TREND_POINT_SPACING
  const y = (rank: number) => 26 + (rank - 1) * 62 / Math.max(1, highest - 1)
  const latestMatchId = points[points.length - 1]?.match.id
  useEffect(() => scrollTrendToLatest(scrollRef.current), [selected, chosen, points.length, latestMatchId])
  return <section className="mb-4 rounded-2xl bg-zinc-900 p-3">
    <div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Rank Trend</h2><p className="text-[10px] text-zinc-500">Rank after each appearance</p></div><div className="flex gap-1" aria-label="Rank trend type">{(['overall', 'position', 'team'] as const).map(item => <button key={item} type="button" aria-pressed={selected === item} onClick={() => setSelected(item)} className={'rounded-full px-2 py-1 text-[10px] ' + (selected === item ? 'bg-emerald-400 text-black' : 'bg-black/30 text-zinc-400')}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>
    <div className="mt-3"><RankingMetricTabs label="Rank Trend metric" value={chosen} onChange={value => onMetric?.(value)} options={options} /></div>
    {points.length > 0 ? <>
      <div ref={scrollRef} className="no-scrollbar mt-3 overflow-x-auto overscroll-x-contain" aria-label="Rank Trend horizontal plot"><svg width={width} height={104} role="img" aria-label={selected + ' ' + chosen + ' rank history: ' + points.map(row => row[selected] === null ? '—' : '#' + row[selected]).join(', ')} className="block">
        {points.slice(1).map((row, index) => row[selected] !== null && points[index][selected] !== null ? <line key={row.match.id} x1={x(index)} y1={y(points[index][selected]!)} x2={x(index + 1)} y2={y(row[selected]!)} stroke="#34d399" strokeWidth="2" /> : null)}
        {points.map((row, index) => <g key={row.match.id}>{row[selected] !== null && <circle cx={x(index)} cy={y(row[selected]!)} r="3" fill="#34d399" />}<text x={x(index)} y={row[selected] === null ? 96 : y(row[selected]!) - 7} textAnchor="middle" fontSize="9" fill="#e4e4e7">{row[selected] === null ? '—' : '#' + row[selected]}</text><title>{row.match.date + ' · ' + (row[selected] === null ? '—' : '#' + row[selected]) + ' · ' + matchCompetitionType(row.match)}</title></g>)}
      </svg></div><p className="text-right text-xs text-zinc-400">Current <b className="text-emerald-300">{points[points.length - 1][selected] === null ? '—' : '#' + points[points.length - 1][selected]}</b></p>
    </> : <p className="mt-3 text-xs text-zinc-500">Not enough matches to show rank trend.</p>}
  </section>
}
function PositionStats({ data, position }: { data: PlayerDerived; position: string }) {
  const contents: [string, string | number][] = position === 'GK'
    ? [['Saves', data.saves], ['Overall GK Save %', data.savePercentage === null ? '—' : pct(data.savePercentage)], ['GA / match', data.goalkeeperAppearances ? value(data.goalkeeperConceded / data.goalkeeperAppearances) : '—'], ['Clean sheets', data.cleanSheets]]
    : fieldPositions.has(positionFamily(position) ?? '')
      ? [['On-pitch GA/90', value(data.onPitchGaPer90)], ['On-pitch GD/90', value(data.onPitchGdPer90)], ['Goals', data.goals], ['Assists', data.assists]]
      : [['Goals/90', data.minutes ? value(data.goals * 90 / data.minutes) : '—'], ['Assists/90', data.minutes ? value(data.assists * 90 / data.minutes) : '—'], ['G+A/90', data.minutes ? value((data.goals + data.assists) * 90 / data.minutes) : '—'], ['Goal involvement', data.goalInvolvement === null ? '—' : pct(data.goalInvolvement)]]
  return <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Position Stats</h2><p className="mt-1 text-[10px] text-zinc-500">Relevant to {position}; core totals remain in Overview.</p><div className="mt-3 grid grid-cols-2 gap-1.5">{contents.map(([label, content]) => metric(label, String(content)))}</div></section>
}
function StartingPerformance({ rows, teams }: { rows: PlayerDerived['startingPerformance']; teams: { id: string; name: string }[] }) { return <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Team Performance When Starting</h2><p className="mt-1 text-[10px] text-zinc-500">Match outcomes, not individual causation. Separate by team stint.</p>{rows.length ? <div className="mt-3 space-y-2">{rows.map(row => <div key={row.teamId} className="rounded-xl bg-black/20 p-2.5 text-xs"><div className="mb-2 flex justify-between"><b>{teams.find(team => team.id === row.teamId)?.name ?? row.teamId}</b><span>{row.wins}-{row.draws}-{row.losses}</span></div><div className="grid grid-cols-2 gap-1.5">{metric('Starter PPG', value(row.starterPpg))}{metric('Team overall PPG', value(row.teamPpg))}{metric('Starter GD / match', value(row.starterGdPerMatch))}{metric('Team overall GD / match', value(row.teamGdPerMatch))}</div></div>)}</div> : <p className="mt-2 text-xs text-zinc-500">No starts in this scope.</p>}</section> }

function DeferredMount(props: { player: Player; players: Player[]; teams: { id: string; name: string; shortName: string }[]; matches: Match[]; scopedMatches: Match[]; data: PlayerDerived; displayCacheHit: boolean; dominantPosition: string; onNavigate: (view: View) => void }) { const [ready, setReady] = useState(() => typeof window === 'undefined'); useEffect(() => { if (typeof window === 'undefined') return; const timer = window.setTimeout(() => setReady(true), 80); return () => window.clearTimeout(timer) }, [props.player.id, props.scopedMatches]); return ready ? <DeferredPlayerSections {...props} /> : <div className="mb-4 h-12 rounded-2xl bg-zinc-900/60" aria-label="Loading secondary player statistics" /> }
function DeferredPlayerSections({ player, players, teams, matches, scopedMatches, data, displayCacheHit, dominantPosition, onNavigate }: { player: Player; players: Player[]; teams: { id: string; name: string; shortName: string }[]; matches: Match[]; scopedMatches: Match[]; data: PlayerDerived; displayCacheHit: boolean; dominantPosition: string; onNavigate: (view: View) => void }) {
  const impact = useMemo(() => substituteImpact(player, data.appearances.map(row => row.match)), [player, data])
  const chemistry = useMemo(() => playerChemistry(player, players, scopedMatches, {}, dominantPosition), [player, players, scopedMatches, dominantPosition])
  const career = useMemo(() => playerCareerTimeline(player, players, matches), [player, players, matches])
  const records = useMemo(() => playerPersonalRecords(player, players, matches), [player, players, matches])
  const history = useMemo(() => playerAppearanceMatches(player, scopedMatches), [player, scopedMatches])
  return <><RoleImpact data={data} impact={impact} /><GoalTypes data={data} /><section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Player Chemistry</h2><p className="mt-1 text-[10px] text-zinc-500">Evidence-based partnerships in the selected scope.</p>{chemistry.direct || chemistry.positional || chemistry.results ? <div className="mt-3 grid gap-2 text-xs">{chemistry.direct && <ChemistryCard title="🤝 Top goal connection" text={`${playerFullName(players.find(item => item.id === chemistry.direct!.partnerId))} · ${chemistry.direct.connections} links · ${chemistry.direct.minutesTogether}' together`} />}{chemistry.positional && <ChemistryCard title="Best positional partner" text={`${chemistry.positional.playerIds.filter(id => id !== player.id).map(id => playerFullName(players.find(item => item.id === id))).join(', ')} · ${chemistry.positional.startsTogether} starts`} />}{chemistry.results && <ChemistryCard title="Best results together" text={`${chemistry.results.playerIds.filter(id => id !== player.id).map(id => playerFullName(players.find(item => item.id === id))).join(', ')} · PPG ${value(startingPPG(chemistry.results))}`} />}</div> : <p className="mt-2 text-xs text-zinc-500">No shared-match partnership data in this scope.</p>}</section><section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Career Timeline</h2><div className="mt-3 space-y-1.5">{career.map((row, index) => <div key={`${row.season}:${row.teamId}:${index}`} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-xs"><span><b>{row.season}</b><small className="ml-2 text-zinc-500">{teams.find(team => team.id === row.teamId)?.shortName ?? row.teamId}</small></span><b>{row.apps} apps · {row.goals}G {row.assists}A · {value(row.averageRating)}</b></div>)}</div></section><CareerMilestones player={player} players={players} matches={matches} /><section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Career Personal Records</h2><div className="mt-3 grid grid-cols-2 gap-1.5">{metric('Highest rating', value(records.highestRating))}{metric('Best 5-match avg', records.bestFiveAverage === null ? '—' : value(records.bestFiveAverage))}{metric('Goals in match', records.mostGoals)}{metric('Assists in match', records.mostAssists)}{metric('G+A in match', records.mostGA)}{metric('Scoring streak', records.scoringStreak)}{metric('G+A streak', records.contributionStreak)}{metric(`${GOOD_RATING_THRESHOLD}+ streak`, records.goodMatchStreak)}</div></section><section><h2 className="mb-2 text-sm font-semibold">Matches</h2><p className="mb-2 text-[10px] text-zinc-500">Actual appearances in the selected scope.</p><div className="space-y-2">{history.map(match => <MatchRow key={match.id} match={match} player={player} displayCacheHit={displayCacheHit} onNavigate={onNavigate} />)}{!history.length && <p className="text-xs text-zinc-500">No matches in this scope.</p>}</div></section></>
}

function CareerMilestones({ player, players, matches }: { player: Player; players: Player[]; matches: Match[] }) {
  const rows = useMemo(() => careerNextMilestones(player, players, matches), [player, players, matches])
  return <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Next Milestones</h2><p className="mt-1 text-[10px] text-zinc-500">Career totals · all seasons and competitions</p>{rows.length ? <div className="mt-3 grid gap-1.5">{rows.map(row => <div key={row.metric} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-xs"><b>{row.label}</b><span className="text-zinc-400 tabular-nums">{row.remaining} to go</span></div>)}</div> : <p className="mt-2 text-xs text-zinc-500">No career milestones to show yet.</p>}</section>
}
function RoleImpact({ data, impact }: { data: PlayerDerived; impact: ReturnType<typeof substituteImpact> }) { const typicalEntry = impact.summary.apps ? Math.round(impact.appearances.reduce((sum, row) => sum + row.entryMinute, 0) / impact.summary.apps) : null; return <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Role Impact</h2><div className="mt-3 grid grid-cols-2 gap-2 text-xs">{([['Starter', data.starter], ['Substitute', data.substitute]] as const).map(([label, row]) => <div key={label} className="rounded-xl bg-black/20 p-2.5"><b>{label}</b><div className="mt-2 grid grid-cols-2 gap-1">{metric('Apps', row.apps)}{metric('Avg rating', value(row.averageRating))}{metric('Goals/90', value(row.goalsPer90))}{metric('Assists/90', value(row.assistsPer90))}{metric('G+A/90', value(row.gaPer90))}</div></div>)}</div>{impact.summary.apps > 0 && <details className="mt-3 rounded-xl bg-black/20 p-2.5 text-xs"><summary className="cursor-pointer font-bold">Substitute impact · typical entry {typicalEntry}'</summary><div className="mt-2 grid grid-cols-3 gap-1.5">{metric('On-pitch GF', impact.summary.goalsFor)}{metric('On-pitch GA', impact.summary.goalsAgainst)}{metric('On-pitch GD', `${impact.summary.goalDifference > 0 ? '+' : ''}${impact.summary.goalDifference}`)}{metric('GD/90', value(impact.summary.gdPer90))}{metric('G+A/90', value(impact.summary.gaPer90))}{metric('Sub apps', impact.summary.apps)}</div><div className="mt-2 space-y-1">{impact.appearances.map(row => <p key={row.match.id} className="rounded-lg bg-zinc-900 px-2 py-1.5">{row.entryMinute}' · entry {row.scoreAtEntry.home}-{row.scoreAtEntry.away} · final {row.finalScore.home}-{row.finalScore.away} · GF {row.goalsFor}, GA {row.goalsAgainst}</p>)}</div></details>}</section> }
function GoalTypes({ data }: { data: PlayerDerived }) { const base = [['opening', 'Opening'], ['equalizer', 'Equalizer'], ['goAhead', 'Go-Ahead'], ['leadExtending', 'Lead-Extending'], ['deficitReducing', 'Deficit-Reducing']] as const; const special = [['gameWinning', 'Game Winners'], ['comeback', 'Comeback Goals'], ['stoppageTime', 'Stoppage-Time Goals']] as const; const row = ([key, label]: readonly [keyof PlayerDerived['goalTypes'], string]) => <div key={key} className="flex justify-between rounded-lg bg-black/20 px-2 py-2"><span>{label}</span><b>{data.goalTypes[key]}</b></div>; return <section className="mb-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Goal Types</h2><p className="mt-1 text-[10px] text-zinc-500">Base types are exclusive; special goals may overlap.</p><h3 className="mt-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Base</h3><div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">{base.map(row)}</div><h3 className="mt-3 border-t border-white/10 pt-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Special Goals</h3><div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">{special.map(row)}</div></section> }
function ChemistryCard({ title, text }: { title: string; text: string }) { return <div className="rounded-xl bg-black/20 p-2.5"><b>{title}</b><p className="mt-1 text-zinc-400">{text}</p></div> }
function MatchRow({ match, player, displayCacheHit, onNavigate }: { match: Match; player: Player; displayCacheHit: boolean; onNavigate: (view: View) => void }) {
  const appearance = match.appearances.find(a => a.playerId === player.id)
  const rating = appearance ? ratePlayerMatch(match, player) : null
  const score = matchScore(match)
  const goals = appearance ? match.events.filter(e => e.type === 'goal' && !e.ownGoal && e.playerId === player.id).length : 0
  const assists = appearance ? match.events.filter(e => e.type === 'goal' && !e.ownGoal && e.assistPlayerId === player.id).length : 0
  return <article className="rounded-2xl bg-zinc-900 p-3">
    <button type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="flex w-full justify-between text-left">
      <span className="text-xs">{formatCompactCompetitionContext(assignmentSnapshotForMatch(match))} · {formatDate(match.date)} · {score.home}-{score.away}</span>
      <div className="flex gap-2">
        <span className="text-xs">{appearance ? appearance.position : '--'}</span>
        <span className="text-xs">{rating ? `${rating.minutes}'` : '--\''}</span>
        <b className={rating ? ratingTone(rating.rating) : 'text-zinc-500'}>{rating ? rating.rating.toFixed(1) : '--'}</b>
      </div>
    </button>
    <div className="mt-1 flex gap-2 text-xs">
      {goals > 0 && <span>{Array(goals).fill('⚽').join('')}</span>}
      {assists > 0 && <span>{Array(assists).fill('👟').join('')}</span>}
    </div>
    {rating && <RatingDetails match={match} player={player} rating={rating} displayCacheHit={displayCacheHit} />}
  </article>
}
function RatingDetails({ match, player, rating, displayCacheHit }: { match: Match; player: Player; rating: RatingBreakdown; displayCacheHit: boolean }) {
  const [open, setOpen] = useState(false)
  const trace = useMemo(() => open ? tracePlayerMatchRating(match, player) : null, [open, match, player])
  return <details className="mt-2 border-t border-white/5 pt-2 text-xs" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-zinc-400">Rating Details · {rating.position} · {rating.minutes}'</summary>
    {trace && <div className="mt-3 space-y-3">
      <div className="grid grid-cols-3 gap-1.5">{metric('Entry', `${trace.enter}'`)}{metric('Exit', `${trace.exit}'`)}{metric('Minutes', trace.minutes)}</div>
      <div><h3 className="mb-1 font-semibold text-zinc-400">Position timeline</h3>{trace.intervals.map((row, index) => <p key={index}>{row.enter}'–{row.exit}' <b>{row.position}</b></p>)}</div>
      <div><h3 className="mb-1 font-semibold text-zinc-400">Conceded goals</h3>{trace.concededGoals.length ? trace.concededGoals.map(row => <div key={row.eventId} className="flex justify-between gap-2 rounded-lg bg-black/20 p-2"><span>{row.minute}' · {row.onPitch ? row.position : 'Off pitch'}</span><b>{value(row.penalty)}</b></div>) : <p className="text-zinc-500">None</p>}</div>
      <div><h3 className="mb-1 font-semibold text-zinc-400">SOT suppression</h3><p className="mb-1 text-zinc-500">Opponent SOT {trace.opponentSot} × {value(trace.sotMultiplier)} multiplier</p>{trace.suppressionIntervals.map((row, index) => <div key={index} className="flex justify-between"><span>{row.position} · {row.minutes} min</span><b>+{value(row.bonus, 5)}</b></div>)}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {metric('Base', value(rating.base))}{metric('Goal', value(trace.goals))}
        {metric('Assist', value(trace.assists))}{metric('Uninvolved Goal Bonus', value(trace.teamGoals))}
        {metric('SOT Suppression', value(trace.sotBonus, 5))}{metric('Conceded Penalty', value(trace.concededPenalty))}
        {metric('Goal Responsibility', value(trace.individualCausePenalty))}{metric('Save Bonus', value(trace.saveBonus))}
        {metric('Result', value(trace.result))}{metric('Raw pre-clamp', value(trace.preClamp, 5))}
        {metric('Final Raw Rating', value(trace.raw, 5))}{metric('Displayed Rating', trace.display)}
      </div>
      <details className="text-[10px] text-zinc-500"><summary className="cursor-pointer">Calculation source</summary><p>Current raw Match/Event engine · Match {trace.matchId} · Player {trace.playerId} · scope cache {displayCacheHit ? 'HIT' : 'MISS'}</p>{trace.legacyStoredPlayerRating !== undefined && <p>Legacy stored player rating {trace.legacyStoredPlayerRating} is ignored.</p>}</details>
    </div>}
  </details>
}
