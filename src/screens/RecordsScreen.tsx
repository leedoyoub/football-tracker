import { useMemo } from 'react'
import { CompactFilterMenu } from '../components/CompactFilterMenu'
import { CompetitionScopeSelector } from '../components/CompetitionScopeSelector'
import { PlayerIdentityAction, TeamIdentityAction } from '../components/EntityActions'
import { FindPartner } from '../components/FindPartner'
import { PositionFilter } from '../components/PositionFilter'
import { RecordPreview } from '../components/RecordRows'
import { RecordsSeasonFilter } from '../components/RecordsSeasonFilter'
import { TeamFilter } from '../components/TeamFilter'
import { playerForm } from '../engine/seasonInsights'
import { teamMetrics } from '../engine/teamMetrics'
import { recordsScopedMatches } from '../engine/recordsScope'
import { normalizePositionFilters } from '../engine/positionScope'
import { seasonsFromMatches } from '../engine/stats'
import { useStore } from '../store'
import type { Match, Player, ScreenStateByView, Team, View } from '../types'
import { HallOfFame } from './HallOfFame'
import { RecordsHistory } from './RecordsHistory'
import { archiveMenus, combinationRecordSections, playerRecordSections, teamRecordSections } from './recordSections'
import { combinationBestUnitOptions, EMPTY_COMPETITION_STATES, recordsLeaderboardGroups, type RecordsLeaderboardKind, type RecordsScope } from './recordsLeaderboards'

type RecordsState = ScreenStateByView['records']
type Props = { screenState: RecordsState; onStateChange: (state: RecordsState) => void; onNavigate: (view: View) => void }
const hallPanels = ['overview', 'career', 'legendary', 'breakers']
const emptyAnalytics: NonNullable<RecordsState['analyticsFilters']> = { seasonIds: [], teamIds: [], competition: 'all' }

export function RecordsScreen({ screenState, onStateChange, onNavigate }: Props) {
  const { players, teams, matches, competitionStates = EMPTY_COMPETITION_STATES } = useStore()
  const { category, competition } = screenState
  const patch = (next: Partial<RecordsState>) => onStateChange({ ...screenState, ...next })
  const section = (key: keyof NonNullable<RecordsState['sections']>, id: string) => patch({ sections: { ...screenState.sections, [key]: id } })
  const seasons = useMemo(() => [...new Set([...seasonsFromMatches(matches), ...competitionStates.map(state => state.season)])], [matches, competitionStates])
  const analytics = screenState.analyticsFilters ?? emptyAnalytics
  const scope: RecordsScope = useMemo(() => ({
    seasons: category === 'analytics' ? analytics.seasonIds : screenState.filterSeasonIds,
    teamIds: category === 'analytics' ? analytics.teamIds : screenState.filterTeamIds,
    competition: category === 'analytics' ? analytics.competition : competition,
    positionFilter: screenState.positionFilter, positionFilters: screenState.positionFilters, rankMode: screenState.rankMode ?? 'filtered',
  }), [analytics, competition, category, screenState.filterSeasonIds, screenState.filterTeamIds, screenState.positionFilter, screenState.positionFilters, screenState.rankMode])
  const showTeamFilter = category === 'player' || category === 'team' || category === 'combination' || category === 'analytics'
  const showScope = showTeamFilter || category === 'history'
  const title = archiveMenus.find(menu => menu.id === category)?.title ?? 'Records'
  const patchAnalytics = (next: Partial<typeof analytics>) => patch({ analyticsFilters: { ...analytics, ...next } })

  return <div className="px-4 pb-8 pt-5">
    {category !== 'index' && <button type="button" onClick={() => patch({ category: 'index' })} className="min-h-9 text-xs font-semibold text-emerald-300">‹ Records</button>}
    <h1 className="mb-3 text-2xl font-semibold">{title}</h1>
    {category === 'index' && <nav aria-label="Records archive" className="grid gap-2 sm:grid-cols-2">
      {archiveMenus.map(menu => <button key={menu.id} type="button" onClick={() => patch({ category: menu.id })} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-white/5 bg-zinc-900 px-3 py-2 text-left hover:border-emerald-400/40">
        <span><strong className="block text-sm">{menu.title}</strong><span className="mt-0.5 block text-xs text-zinc-400">{menu.detail}</span></span><span aria-hidden="true" className="text-lg text-emerald-300">›</span>
      </button>)}
    </nav>}
    {showScope && <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label={`${title} filters`}>
      <RecordsSeasonFilter value={scope.seasons} seasons={seasons} onChange={seasonIds => category === 'analytics' ? patchAnalytics({ seasonIds }) : patch({ filterSeasonIds: seasonIds })} />
      {category === 'player' && <PositionFilter values={scope.positionFilters ?? normalizePositionFilters(scope.positionFilter)} onChange={positionFilters => patch({ positionFilters, positionFilter: positionFilters[0] ?? 'all' })} label="Player Records position" />}
      {showTeamFilter && <TeamFilter values={scope.teamIds} teams={teams} onChange={teamIds => category === 'analytics' ? patchAnalytics({ teamIds }) : patch({ filterTeamIds: teamIds })} label={`${title} team`} />}
      {category !== 'history' && <CompetitionScopeSelector value={scope.competition} onChange={competition => category === 'analytics' ? patchAnalytics({ competition }) : patch({ competition })} />}
    </div>}
    {(category === 'player' || category === 'team' || category === 'combination') && <RankingPreviews category={category} scope={scope} screenState={screenState} onPatch={patch} onSection={id => section(category, id)} onNavigate={onNavigate} />}
    {category === 'hall' && <HallOfFame players={players} teams={teams} matches={matches} states={competitionStates} panel={hallPanels.includes(screenState.sections?.hall ?? '') ? screenState.sections!.hall! : 'overview'} careerPlayerId={screenState.careerPlayerId} onPanel={id => section('hall', id)} onCareerPlayer={id => patch({ careerPlayerId: id })} onNavigate={onNavigate} />}
    {category === 'history' && <RecordsHistory players={players} teams={teams} matches={matches} states={competitionStates} seasonIds={scope.seasons}
      competition={screenState.historyCompetition ?? 'all'} onCompetition={historyCompetition => patch({ historyCompetition })}
      panel={screenState.historyPanel === 'awards' ? 'awards' : 'timeline'} openSeason={screenState.historySeason} awardScope={screenState.historyAwardScope}
      onPanel={value => patch({ historyPanel: value })} onSeason={value => patch({ historySeason: value })} onAwardScope={value => patch({ historyAwardScope: value })}
      onNavigate={onNavigate} onPlayerOpen={id => onNavigate({ name: 'player', id })} />}
    {category === 'analytics' && <AnalyticsRecords players={players} teams={teams} matches={matches} scope={scope} onNavigate={onNavigate} />}
  </div>
}

function RankingPreviews({ category, scope, screenState, onPatch, onSection, onNavigate }: { category: RecordsLeaderboardKind; scope: RecordsScope; screenState: RecordsState; onPatch: (value: Partial<RecordsState>) => void; onSection: (id: string) => void; onNavigate: (view: View) => void }) {
  const { players, teams, matches, competitionStates = EMPTY_COMPETITION_STATES } = useStore()
  const sections = category === 'player' ? playerRecordSections : category === 'team' ? teamRecordSections : combinationRecordSections
  const current = sections.find(part => part.id === screenState.sections?.[category]) ?? sections[0]
  const position = screenState.combinationPosition ?? 'attack'
  const size = screenState.combinationPlayers ?? 2
  const metric = screenState.combinationMetric ?? 'starts'
  const unit = screenState.bestUnitId ?? combinationBestUnitOptions[0].id
  const chosen = 'records' in current ? current.records : current.id === 'together' ? [`together:${position}:${size}:${metric}`] : current.id === 'units' ? [unit] : []
  const section = ['awards', 'trophies'].includes(current.id) || category === 'team' && current.id === 'season' ? 'awards' : 'performance'
  const groups = chosen.length ? recordsLeaderboardGroups({ category, section, scope, players, teams, matches, states: competitionStates, selectedIds: [...chosen] }) : []
  const byId = new Map(groups.map(group => [group.id, group]))
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const matchById = useMemo(() => new Map(matches.map(match => [match.id, match])), [matches])
  const picker = (label: string, value: string, options: { value: string; label: string }[], onChange: (value: string) => void) =>
    <CompactFilterMenu label={label} value={value} options={options} onChange={onChange} popupAlign="start" menuClassName="max-h-64 overflow-y-auto overscroll-contain" />
  return <section aria-label="Records leaderboard previews">
    <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto rounded-xl bg-zinc-900 p-1" aria-label="Record categories">
      {sections.map(part => <button key={part.id} type="button" aria-pressed={current.id === part.id} onClick={() => onSection(part.id)} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold ${current.id === part.id ? 'bg-emerald-500 text-black' : 'text-zinc-300'}`}>{part.title}</button>)}
    </div>
    {category === 'combination' && current.id === 'together' && <div className="mb-3 flex flex-wrap gap-1.5">
      {picker('Combination position', position, [{ value: 'attack', label: 'Attack' }, { value: 'midfield', label: 'Midfield' }, { value: 'defence', label: 'Defence' }], value => onPatch({ combinationPosition: value as RecordsState['combinationPosition'] }))}
      {picker('Combination players', String(size), ['2', '3', '4'].map(value => ({ value, label: `${value} players` })), value => onPatch({ combinationPlayers: Number(value) as RecordsState['combinationPlayers'] }))}
      {picker('Combination metric', metric, [{ value: 'starts', label: 'Starts' }, { value: 'minutes', label: 'Minutes' }, { value: 'ppg', label: 'PPG' }], value => onPatch({ combinationMetric: value as RecordsState['combinationMetric'] }))}
    </div>}
    {category === 'combination' && current.id === 'units' && <div className="mb-3">{picker('Best unit', unit, combinationBestUnitOptions.map(item => ({ value: item.id, label: item.title })), bestUnitId => onPatch({ bestUnitId }))}</div>}
    {current.id === 'find' ? <FindPartner players={players} teams={teams} matches={matches} scope={scope} playerId={screenState.partnerPlayerId} onPlayerChange={partnerPlayerId => onPatch({ partnerPlayerId })} onNavigate={onNavigate} />
      : <div className="space-y-2">{chosen.map(id => {
        const group = byId.get(id)
        return group ? <RecordPreview key={id} group={group} players={playerById} teams={teamById} matches={matchById} scope={scope} onNavigate={onNavigate} /> : null
      })}</div>}
  </section>
}

function AnalyticsRecords({ players, teams, matches, scope, onNavigate }: { players: Player[]; teams: Team[]; matches: Match[]; scope: RecordsScope; onNavigate: (view: View) => void }) {
  const { seasons, teamIds, competition } = scope
  const chart = useMemo(() => {
    const games = recordsScopedMatches(matches, { seasons, teamIds, competition }, 'insights')
    const teamRows = teams.filter(team => !teamIds.length || teamIds.includes(team.id)).map(team => ({ team, ...teamMetrics(team, games) })).filter(row => row.played)
    teamRows.sort((a, b) => b.form.filter(outcome => outcome === 'W').length - a.form.filter(outcome => outcome === 'W').length || b.ppg - a.ppg)
    const selected = teamIds.length ? new Set(teamIds) : undefined
    const playerRows = players.map(player => ({ player, form: playerForm(player, games, selected) })).filter(row => row.form.ratings.length >= 3).sort((a, b) => b.form.last5Average - a.form.last5Average)
    return { teams: teamRows.slice(0, 5), players: playerRows.slice(0, 5) }
  }, [seasons, teamIds, competition, teams, players, matches])
  return <div className="space-y-5">
    <section><h2 className="mb-2 text-sm font-semibold">Recent Team Form</h2>
      {!chart.teams.length && <p className="text-xs text-zinc-500">No recorded matches in this scope.</p>}
      <div className="grid gap-2">{chart.teams.map(row => <div key={row.team.id} className="rounded-xl bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <TeamIdentityAction team={row.team} onNavigate={id => onNavigate({ name: 'team', id })} className="min-w-0 font-semibold">{row.team.name}</TeamIdentityAction>
          <div className="flex gap-1" aria-label="Last five results, newest first">{row.form.map((result, index) => <button key={row.games[index].id} onClick={() => onNavigate({ name: 'match', id: row.games[index].id })} type="button" className={`size-8 rounded font-bold ${result === 'W' ? 'bg-emerald-500/20 text-emerald-300' : result === 'L' ? 'bg-rose-500/20 text-rose-300' : 'bg-zinc-700 text-zinc-200'}`}>{result}</button>)}</div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
          {([[row.goals, 'GF/M'], [row.conceded, 'GA/M'], [row.opponentSot, 'Opponent SOT/M']] as const).map(([total, label]) => <div key={label} className="rounded bg-black/25 p-1.5">{(total / row.played).toFixed(2)}<small className="block text-zinc-400">{label}</small></div>)}
        </div>
      </div>)}</div>
    </section>
    <section><h2 className="mb-2 text-sm font-semibold">Recent Player Ratings</h2>
      {!chart.players.length && <p className="text-xs text-zinc-500">No players with three rated matches in this scope.</p>}
      <div className="space-y-2">{chart.players.map(({ player, form }) => <div key={player.id} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900 p-3 text-xs">
        <PlayerIdentityAction player={player} onNavigate={id => onNavigate({ name: 'player', id })} className="min-w-0 font-semibold">{player.displayName ?? player.name}</PlayerIdentityAction>
        <span className="shrink-0 text-emerald-300">Last 5 · {form.last5Average.toFixed(2)}</span>
      </div>)}</div></section>
  </div>
}
