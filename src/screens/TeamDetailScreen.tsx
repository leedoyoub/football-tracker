import { useMemo } from 'react'
import { derivedResults } from '../lib/results'
import { ResultCard } from '../components/ResultCard'
import { Pitch } from '../components/Pitch'
import { TeamIcon } from '../components/TeamIcon'
import { SubstitutePlayerCard } from '../components/ui'
import { RankingMetricTabs, RankingRow, useMetricSwipe } from '../components/RankingRow'
import { RANKING_METRICS, formatRankingMetricValue } from '../lib/rankingMetrics'
import { buildGlobalRankingData, rankGlobalRankingRows, teamPlayerSeasonStats, seasonsFromMatches, teamBestEleven, type LeaderboardMetric } from '../engine/stats'
import { matchCompetitionType, teamCompetitionOverview } from '../engine/competition'
import { teamsCreditedWithResult } from '../engine/matchPerspective'
import { latestLeagueStandings } from '../engine/seasonAnalytics'
import { competitionRevision } from '../engine/competitionRevision'
import { selectLeagueCompetition, selectCupCompetition, selectChampionsCompetition } from '../engine/competitionSelectors'
import { VirtualCardList } from '../components/VirtualCardList'
import { RankDelta, SegmentedControl } from '../components/SeasonUI'
import { CompetitionScopeSelector } from '../components/CompetitionScopeSelector'
import { useStore } from '../store'
import { sortPlayersByPosition } from '../lib/positionOrder'
import { scopedPositionFamilyByPlayer } from '../engine/positionScope'
import { CompactFilterMenu } from '../components/CompactFilterMenu'
import { TeamHistory } from './TeamHistory'
import { teamForm, teamMomentumDirection } from '../engine/teamForm'
import { COMPETITION_OPTIONS } from '../lib/competitionOptions'
import type { CompetitionType, ScreenStateByView, Team, View } from '../types'

export function TeamDetailScreen({ teamId, season, screenState, onStateChange, onNavigate, onBack }: { teamId: string; season: string; screenState: ScreenStateByView['team']; onStateChange: (state: ScreenStateByView['team']) => void; onNavigate: (view: View) => void; onBack: () => void }) {
  const { teams, players, matches, competitionStates = [], competitionRevisions = {}, competitionCacheOwner, teamCatalogRevision = 0 } = useStore()
  const { bestPlayersCompetition: bestCompetition, matchesCompetition, tab } = screenState
  const playersCompetition = screenState.playersCompetition ?? 'all'
  const bestSeason = screenState.bestPlayersSeason ?? season
  const patchState = (patch: Partial<ScreenStateByView['team']>) => onStateChange({ ...screenState, ...patch })
  const setBestSeason = (value: string) => patchState({ bestPlayersSeason: value })
  const setBestCompetition = (value: CompetitionType | 'all') => patchState({ bestPlayersCompetition: value })
  const setMatchesCompetition = (value: CompetitionType | 'all') => patchState({ matchesCompetition: value })
  const setTab = (value: ScreenStateByView['team']['tab']) => patchState({ tab: value })
  const team = teams.find((item) => item.id === teamId)
  const seasons = seasonsFromMatches(matches)
  const activeSeason = seasons.includes(season) ? season : seasons[0] ?? season
  const representative = useMemo(() => tab === 'players' ? scopedPositionFamilyByPlayer(players, matches, {}) : new Map(), [tab, players, matches])
  const selectedBestSeason = seasons.includes(bestSeason) ? bestSeason : activeSeason
  const overview = useMemo(() => {
    if (tab !== 'overview') return undefined
    const owner = competitionCacheOwner ?? matches
    const league = selectLeagueCompetition(owner, teams, matches, activeSeason, competitionRevision(competitionRevisions, activeSeason, 'league'), teamCatalogRevision, undefined, players)
    const cup = selectCupCompetition(owner, teams, matches, activeSeason, competitionRevision(competitionRevisions, activeSeason, 'cup'), teamCatalogRevision, players)
    const champions = selectChampionsCompetition(owner, competitionStates.find(state => state.id === `champions:${activeSeason}` && state.kind === 'champions-draw'), matches, activeSeason, competitionRevision(competitionRevisions, activeSeason, 'champions'), players)
    return teamCompetitionOverview(teamId, teams, matches, activeSeason, players, competitionStates, { league, cup, champions })
  }, [tab, teamId, teams, matches, activeSeason, players, competitionStates, competitionRevisions, competitionCacheOwner, teamCatalogRevision])
  const standings = useMemo(() => tab === 'overview' ? latestLeagueStandings(teams, players, matches, activeSeason) : [], [tab, teams, players, matches, activeSeason])
  const playerData = useMemo(() => {
    if (tab !== 'players') return undefined
    const competitionMatches = playersCompetition === 'all' ? matches : matches.filter(match => matchCompetitionType(match) === playersCompetition)
    const canonicalBest = teamBestEleven(players, competitionMatches, teamId, activeSeason)
    const historicalStarterIds = new Set(canonicalBest.slots.map(slot => slot.playerId))
    const allTeamPlayers = sortPlayersByPosition(players.filter(player => (player.teamIds ?? [player.teamId]).includes(teamId)), [], representative)
    const facts = teamPlayerSeasonStats(players, matches, activeSeason, teamId, playersCompetition === 'all' ? undefined : playersCompetition)
    const statsByPlayer = Object.fromEntries(players.filter(player => (player.teamIds ?? [player.teamId]).includes(teamId) || historicalStarterIds.has(player.id)).map(player => [player.id, facts.get(player.id) ?? { goals: 0, assists: 0, avgRating: 0, matches: 0 }]))
    const slots = canonicalBest.slots.map(slot => {
      const stats = slot.playerId ? statsByPlayer[slot.playerId] : undefined
      return { ...slot, avgRating: stats?.avgRating ?? 0, matches: stats?.matches ?? 0 }
    })
    return { best: { ...canonicalBest, slots }, statsByPlayer, starterIds: new Set(slots.flatMap(slot => slot.playerId ? [slot.playerId] : [])), allTeamPlayers }
  }, [tab, players, matches, teamId, activeSeason, playersCompetition, representative])
  const matchData = useMemo(() => tab === 'matches' ? derivedResults(matches.filter(match => match.season === activeSeason && (matchesCompetition === 'all' || matchCompetitionType(match) === matchesCompetition) && teamsCreditedWithResult(match).includes(teamId)), teams, teamId) : [], [tab, matches, teams, activeSeason, matchesCompetition, teamId])
  const form = useMemo(() => tab === 'overview' ? teamForm(teamId, players, matches, selectedBestSeason, bestCompetition) : undefined, [tab, teamId, players, matches, selectedBestSeason, bestCompetition])
  if (!team) return <div className="p-6 text-sm text-zinc-400">Team not found.</div>

  const best = playerData?.best
  const statsByPlayer = playerData?.statsByPlayer ?? {}
  const starterIds = playerData?.starterIds ?? new Set<string>()
  const allTeamPlayers = playerData?.allTeamPlayers ?? []
  const leagueRow = standings.find(row => row.teamId === teamId)
  const renderResult = (result: ReturnType<typeof derivedResults>[number]) => <ResultCard key={result.match.id} result={result} teams={teams} showCompetition onMatchNavigate={() => onNavigate({ name: 'match', id: result.match.id })} onTeamNavigate={id => onNavigate({ name: 'team', id })} />
  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 min-h-9 px-1 text-xs font-semibold text-emerald-400">← Back</button>
    <header className="mb-5 flex items-center gap-3">
      <TeamIcon team={team} className="h-12 w-12 text-sm font-black">{team.shortName}</TeamIcon>
      <div><h1 className="text-xl font-bold">{team.name}</h1><p className="text-[10px] uppercase tracking-widest text-zinc-500">{activeSeason} · Season stats</p></div>
      <div className="ml-auto"><button type="button" onClick={() => onNavigate({ name: 'new-match', teamId, season: activeSeason })} className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-bold text-black">Log match</button></div>
    </header>
    <SegmentedControl sticky label="Team detail section" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'matches', label: 'Matches' }, { value: 'players', label: 'Players' }, { value: 'history', label: 'History' }]} />
    {tab === 'history' && <TeamHistory teamId={teamId} season={activeSeason} teams={teams} players={players} matches={matches} states={competitionStates} screenState={screenState} onStateChange={patchState} onNavigate={onNavigate} />}
    {tab === 'players' && <div className="mt-4"><RankingMetricTabs value={playersCompetition} options={COMPETITION_OPTIONS} onChange={playersCompetition => patchState({ playersCompetition })} label="Team players competition" /></div>}
    {tab === 'overview' && overview && <><div className="mt-4 mb-5 grid grid-cols-4 gap-2 text-center">
      {[['Rank', <span key="rank" className="flex items-center justify-center">{overview.league.rank ? `#${overview.league.rank}` : '—'} <RankDelta value={leagueRow?.movement ?? null} /></span>], ['W-D-L', `${overview.league.wins}-${overview.league.draws}-${overview.league.losses}`], ['GF-GA', `${overview.league.goalsFor}-${overview.league.goalsAgainst}`], ['Pts', overview.league.points]].map(([label, value]) => <div key={String(label)} className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{value}</div><div className="text-[9px] uppercase text-zinc-500">{label}</div></div>)}
    </div><div className="mb-2 grid grid-cols-4 gap-2 text-center"><div className="col-span-2 min-w-0 rounded-xl bg-zinc-900 px-2 py-2"><div className="text-sm font-black [overflow-wrap:normal]">{competitionProgressLines(overview.champions.status).map((line, index) => <span key={index} className="block">{line}</span>)}</div><div className="text-[9px] uppercase text-zinc-500">Champions</div></div><div className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{overview.champions.wins}-{overview.champions.draws}-{overview.champions.losses}</div><div className="text-[9px] uppercase text-zinc-500">W-D-L</div></div><div className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{overview.champions.goalsFor}-{overview.champions.goalsAgainst}</div><div className="text-[9px] uppercase text-zinc-500">GF-GA</div></div></div><div className="mb-5 grid grid-cols-4 gap-2 text-center"><div className="col-span-2 min-w-0 rounded-xl bg-zinc-900 px-2 py-2"><div className="text-sm font-black [overflow-wrap:normal]">{competitionProgressLines(overview.cup.status).map((line, index) => <span key={index} className="block">{line}</span>)}</div><div className="text-[9px] uppercase text-zinc-500">Cup</div></div><div className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{overview.cup.wins}-{overview.cup.draws}-{overview.cup.losses}</div><div className="text-[9px] uppercase text-zinc-500">W-D-L</div></div><div className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{overview.cup.goalsFor}-{overview.cup.goalsAgainst}</div><div className="text-[9px] uppercase text-zinc-500">GF-GA</div></div></div></>}
    {tab === 'overview' && <section className="mb-4 mt-5 rounded-2xl bg-zinc-900 p-3" aria-label="Team Analysis scope"><div className="mb-2 text-sm font-semibold">Team Analysis</div><div className="flex items-center gap-2"><CompactFilterMenu value={selectedBestSeason} options={(seasons.length ? seasons : [activeSeason]).map(item => ({ value: item, label: item }))} onChange={setBestSeason} label="Team Analysis season" popupAlign="start" /><CompetitionScopeSelector value={bestCompetition} onChange={setBestCompetition} /></div></section>}
    {tab === 'overview' && form && <CurrentForm form={form} season={selectedBestSeason} />}
    {tab === 'overview' && <TeamBestPlayers team={team} teamId={teamId} selectedSeason={selectedBestSeason} competition={bestCompetition} metric={screenState.bestPlayersMetric as LeaderboardMetric} players={players} matches={matches} onMetric={metric => patchState({ bestPlayersMetric: metric })} onPlayer={id => onNavigate({ name: 'player', id, season: selectedBestSeason, competitionType: bestCompetition })} onViewAll={(metric) => onNavigate({ name: 'global-ranking', season: selectedBestSeason, competitionType: bestCompetition, rankingMetric: metric, teamId })} />}
    {tab === 'players' && best && <><section className="mt-6"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Latest XI</h2><p className="text-xs text-zinc-400">Kickoff XI · {best.formation ?? 'Saved formation unavailable'}</p></div></div>{best.match && best.slots.length ? <Pitch emptyRatingLabel="—" slots={best.slots} players={players} teams={teams} statsByPlayer={statsByPlayer} showPositionBadge={false} presentation="history" onSlotClick={(slot) => { if (slot.playerId) onNavigate({ name: 'player', id: slot.playerId, season: activeSeason, competitionType: playersCompetition }) }} /> : <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">No match data yet</div>}</section><section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold">Bench</h2><p className="mb-2 text-[10px] text-zinc-500">Not in Latest XI</p>
      {allTeamPlayers.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {allTeamPlayers.filter(player => !starterIds.has(player.id)).map((player) => {
            const stats = statsByPlayer[player.id]
            return (
              <SubstitutePlayerCard
                key={player.id}
                emptyRatingLabel="—"
                player={player}
                team={team}
                rating={stats?.matches === 0 ? undefined : stats?.avgRating}
                position={representative.get(player.id)}
                stats={{ goals: stats?.goals ?? 0, assists: stats?.assists ?? 0 }}
                onClick={() => onNavigate({ name: 'player', id: player.id, season: activeSeason, competitionType: playersCompetition })}
              />
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No players in squad.</p>
      )}
    </section></>}

    {tab === 'players' && <section aria-label="Roster management" className="mt-4 mb-5 rounded-xl border border-white/10 bg-zinc-900 p-3"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Roster management</h2><p className="mt-0.5 text-[11px] text-zinc-400">Import official squad and player photos</p></div><button type="button" onClick={() => onNavigate({ name: 'import-squad', teamId })} className="shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">Import Squad</button></div></section>}

    {tab === 'matches' && <section className="mt-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Matches</h2><CompetitionScopeSelector value={matchesCompetition} onChange={value => setMatchesCompetition(value)} /></div><div className="space-y-2">{matchData.length > 40 ? <VirtualCardList rows={matchData} itemKey={resultKey} estimate={104} measurementOwner={matches} renderRow={renderResult} /> : matchData.map(renderResult)}{!matchData.length && <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No matches in this scope.</p>}</div></section>}
  </div>
}

function CurrentForm({ form, season }: { form: ReturnType<typeof teamForm>; season: string }) {
  const number = (value: number | null) => value === null ? '—' : value.toFixed(2)
  const rows: { key: 'rating' | 'goalsFor' | 'goalsAgainst'; label: string }[] = [{ key: 'rating', label: 'Rating' }, { key: 'goalsFor', label: 'GF / Match' }, { key: 'goalsAgainst', label: 'GA / Match' }]
  return <section className="mb-5 rounded-2xl bg-zinc-900 p-3"><div><h2 className="text-sm font-semibold">Current Form</h2><p className="text-[10px] text-zinc-500">Latest {form.recent.length} recorded matches · {season}</p></div>{form.count ? <><div className="mt-3 flex gap-1.5" aria-label="Recent team results">{form.recent.map(row => <span key={row.match.id} title={`${row.match.date} · ${row.goalsFor}-${row.goalsAgainst}`} className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${row.outcome === 'W' ? 'bg-emerald-500/15 text-emerald-300' : row.outcome === 'D' ? 'bg-zinc-700 text-zinc-200' : 'bg-rose-500/15 text-rose-300'}`}>{row.outcome}</span>)}</div><div className="mt-3 grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-2 text-[11px]"><span className="text-zinc-500">Metric</span><span className="text-zinc-500">Last {form.recent.length}</span><span className="text-zinc-500">Season</span><span className="text-zinc-500">Change</span>{rows.map(row => { const delta = form.delta[row.key]; const direction = teamMomentumDirection(row.key, delta); const tone = direction === 'flat' ? 'text-zinc-400' : direction === 'better' ? 'text-emerald-300' : 'text-rose-300'; return <div key={row.key} className="col-span-4 grid grid-cols-subgrid border-t border-white/5 pt-2"><b>{row.label}</b><span className="tabular-nums">{number(form.lastFive[row.key])}</span><span className="tabular-nums">{number(form.season[row.key])}</span><span className={`tabular-nums ${tone}`}>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}</span></div> })}</div></> : <p className="mt-3 text-xs text-zinc-500">No recorded matches in this scope.</p>}</section>
}

function scopedTeamRanking(players: Parameters<typeof buildGlobalRankingData>[0], matches: Parameters<typeof buildGlobalRankingData>[1], teamId: string, season: string, competition: CompetitionType | 'all') { return buildGlobalRankingData(players, competition === 'all' ? matches : matches.filter(match => matchCompetitionType(match) === competition), { seasons: [season], teams: [teamId], positions: [] }, 'rating') }

function TeamBestPlayers({ team, teamId, selectedSeason, competition, metric, players, matches, onMetric, onPlayer, onViewAll }: { team: Team; teamId: string; selectedSeason: string; competition: CompetitionType | 'all'; metric: LeaderboardMetric; players: Parameters<typeof buildGlobalRankingData>[0]; matches: Parameters<typeof buildGlobalRankingData>[1]; onMetric: (metric: LeaderboardMetric) => void; onPlayer: (id: string) => void; onViewAll: (metric: LeaderboardMetric) => void }) {
  const index = useMemo(() => scopedTeamRanking(players, matches, teamId, selectedSeason, competition), [players, matches, teamId, selectedSeason, competition])
  const byId = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const rows = rankGlobalRankingRows(index, players, metric).slice(0, 5)
  const swipe = useMetricSwipe(RANKING_METRICS.map(item => item.value), metric, onMetric)
  return <section className="mb-6"><h2 className="mb-3 text-lg font-semibold">Best Players</h2><RankingMetricTabs label="Best Players category" value={metric} onChange={onMetric} options={RANKING_METRICS} /><div {...swipe} className="mt-2 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe Team Best Player metrics">{rows.map((row, index) => { const player = byId.get(row.playerId); return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow positionLabel={row.scopedPositionFamily} rank={index + 1} player={player} team={team} value={formatRankingMetricValue(metric, row.value)} onClick={() => player && onPlayer(player.id)} /></div> })}{!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div><button type="button" onClick={() => onViewAll(metric)} className="secondary-view-all mt-3 w-full">View All</button></section>
}

/** Only rearranges the canonical status string; no competition state is inferred. */
function competitionProgressLines(status: string): string[] {
  const eliminated = /^Eliminated \u00b7 (.+)$/.exec(status)
  if (eliminated) return [eliminated[1], 'Eliminated']
  const progress = /^(.+) \((\d+\/\d+)\)$/.exec(status)
  return progress ? [progress[1], progress[2]] : [status]
}
const resultKey = (result: ReturnType<typeof derivedResults>[number]) => result.match.id
