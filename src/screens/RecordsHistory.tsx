import { useMemo, type ReactNode } from 'react'
import { historyAwardResultForScope, historySeasons, historyTimelineForSeason } from '../engine/historyReadModels'
import { awardsForCompetition, seasonAwards, type AwardScope } from '../engine/awards'
import { currentStaticTeams } from '../data/teams'
import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { playerFullName } from '../components/ui'
import { AwardBestXI } from '../components/AwardBestXI'
import { SegmentedControl } from '../components/SeasonUI'
import { officialSeasonModel } from '../engine/officialAwards'
import { TeamIdentityAction } from '../components/EntityActions'
import { TeamIcon } from '../components/TeamIcon'
import { CompetitionScopeSelector } from '../components/CompetitionScopeSelector'
import { RecordPreview } from '../components/RecordRows'
import { recordsLeaderboardGroups, EMPTY_RECORDS_SCOPE } from './recordsLeaderboards'
import type { View } from '../types'

type Props = { players: Player[]; teams: Team[]; matches: Match[]; states: CompetitionState[]; competition?: CompetitionType | 'all' }
type ControlledProps = Props & { seasonIds?: string[]; panel: 'timeline' | 'awards'; openSeason: string | null; awardScope: AwardScope; onPanel: (panel: 'timeline' | 'awards') => void; onSeason: (season: string | null) => void; onAwardScope: (scope: AwardScope) => void; onCompetition?: (scope: CompetitionType | 'all') => void; onPlayerOpen: (id: string) => void; onNavigate?: (view: View) => void }
const AWARD_SCOPES = [
  { value: 'first-half', label: 'First Half' }, { value: 'second-half', label: 'Second Half' },
  { value: 'league', label: 'League' }, { value: 'cup', label: 'Cup' },
  { value: 'champions', label: 'Champions' }, { value: 'season', label: 'Season' },
] as const

export function RecordsHistory({ players, teams, matches, states, seasonIds, panel, openSeason, awardScope, competition = 'all', onPanel, onSeason, onAwardScope, onCompetition, onPlayerOpen, onNavigate }: ControlledProps) {
  const seasons = useMemo(() => historySeasons(matches, states).filter(season => !seasonIds?.length || seasonIds.includes(season)).reverse(), [matches, states, seasonIds])
  return <section aria-label="Records history">
    <div role="tablist" aria-label="History view" className="mb-4 flex w-fit rounded-xl bg-zinc-900 p-1">
      <button role="tab" aria-selected={panel === 'timeline'} type="button" onClick={() => onPanel('timeline')} className={`rounded-lg px-3 py-2 text-xs font-bold ${panel === 'timeline' ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}>Timeline</button>
      <button role="tab" aria-selected={panel === 'awards'} type="button" onClick={() => onPanel('awards')} className={`rounded-lg px-3 py-2 text-xs font-bold ${panel === 'awards' ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}>Awards</button>
    </div>
    {panel === 'awards' && <div className="mb-3"><SegmentedControl label="Award history scope" value={awardScope} options={[...AWARD_SCOPES]} columns={3} onChange={value => onAwardScope(value as AwardScope)} /></div>}
    {panel === 'timeline' && onCompetition && <div className="mb-3"><CompetitionScopeSelector value={competition} onChange={onCompetition} /></div>}
    {panel === 'timeline'
      ? <Timeline seasons={seasons} openSeason={openSeason} onToggle={onSeason} onPlayerOpen={onPlayerOpen} onNavigate={onNavigate} players={players} teams={teams} matches={matches} states={states} competition={competition} />
      : <Awards seasons={seasons} openSeason={openSeason} awardScope={awardScope} onToggle={onSeason} onPlayerOpen={onPlayerOpen} players={players} teams={teams} matches={matches} states={states} />}
  </section>
}

function Timeline({ seasons, openSeason, onToggle, onPlayerOpen, onNavigate, players, teams, matches, states, competition }: Props & { seasons: string[]; openSeason: string | null; onToggle: (season: string | null) => void; onPlayerOpen: (id: string) => void; onNavigate?: (view: View) => void }) {
  return <><h2 className="mb-2 text-sm font-semibold">Season Archive</h2><div className="space-y-2">{seasons.map(season => <section key={season} className="rounded-2xl bg-zinc-900"><button type="button" aria-expanded={openSeason === season} onClick={() => onToggle(openSeason === season ? null : season)} className="flex min-h-12 w-full items-center justify-between px-3 text-left text-sm font-black"><span>{season}</span><span className="text-xs text-zinc-400">{openSeason === season ? 'Hide' : 'Open'}</span></button>{openSeason === season && <TimelineDetail season={season} onPlayerOpen={onPlayerOpen} onNavigate={onNavigate} players={players} teams={teams} matches={matches} states={states} competition={competition} />}</section>)}</div>{!seasons.length && <p className="text-xs text-zinc-500">No recorded seasons yet.</p>}</>
}

function TimelineDetail({ season, onPlayerOpen, onNavigate, players, teams, matches, states, competition = 'all' }: Props & { season: string; onPlayerOpen: (id: string) => void; onNavigate?: (view: View) => void }) {
  const model = useMemo(() => historyTimelineForSeason(teams, players, matches, states, season, competition), [teams, players, matches, states, season, competition])
  const official = useMemo(() => officialSeasonModel(teams, players, matches, states, season), [teams, players, matches, states, season])
  const scope = useMemo(() => ({ ...EMPTY_RECORDS_SCOPE, seasons: [season], competition }), [season, competition])
  const groups = useMemo(() => recordsLeaderboardGroups({ category: 'team', teams, players, matches, states, scope, selectedIds: ['biggest-win', 'biggest-comeback', 'team-goals'] }), [teams, players, matches, states, scope])
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const matchById = useMemo(() => new Map(matches.map(match => [match.id, match])), [matches])
  const playerName = (id: string) => playerFullName(playerById.get(id))
  const playerLinks = (ids: string[], value?: number | string) => ids.length ? <>{ids.map(id => <button key={id} type="button" onClick={() => onPlayerOpen(id)} className="block min-h-8 text-left text-emerald-300">{playerName(id)}</button>)}{value}</> : '—'
  const competitions: CompetitionType[] = competition === 'all' ? ['league', 'cup', 'champions'] : [competition]
  const xiTitle = competition === 'all' ? 'Season Best XI' : `${competition} Best XI`
  const completed = competition === 'all' ? official.status.complete : competition === 'league' ? official.status.league.complete : Boolean(official.status[competition].championId)
  return <div className="border-t border-white/5 px-3 pb-3 pt-2">
    <p className="mb-2 text-xs font-semibold text-zinc-400">{completed ? competition === 'all' ? 'Season complete' : 'Competition complete' : 'In progress'}</p>
    <div className="mb-2 space-y-1">
      {competitions.map(competition => {
        const championId = official.status[competition].championId
        const runnerUpId = official.teamResults.find(result => result.competition === competition && result.runnerUp)?.teamId
        return <div key={competition} className="rounded-lg bg-black/30 p-2 text-xs">
          <h3 className="mb-1 font-semibold capitalize">{competition}</h3>
          {!championId ? <span className="text-zinc-400">Result pending</span> : <div className="flex flex-wrap gap-3">
            {[['Champion', championId], ['Runner-up', runnerUpId]].flatMap(([label, id]) => id ? [<div key={label} className="text-[10px] text-zinc-400"><span className="block">{label}</span><TeamIdentityAction team={teamById.get(id)} onNavigate={teamId => onNavigate?.({ name: 'team', id: teamId })} className="flex min-h-8 items-center gap-1 text-zinc-200"><TeamIcon team={teamById.get(id)} className="size-5" />{teamById.get(id)?.name ?? id}</TeamIdentityAction></div>] : [])}
          </div>}
        </div>
      })}
    </div>
    <div className="grid grid-cols-3 gap-1 text-[10px]">
      <Fact label="Golden Boot" value={playerLinks(model.scorers.map(winner => winner.playerId), model.scorers[0]?.goals)} />
      <Fact label="Assist Leader" value={playerLinks(model.assistLeaders.map(winner => winner.playerId), model.assistLeaders[0]?.assists)} />
      <Fact label="Best Rating" value={playerLinks(model.rating ? [model.rating.playerId] : [], model.rating?.avgRating.toFixed(2))} />
    </div>
    {model.bestXI.length > 0 && <div className="mt-3 text-[10px] text-zinc-400"><b className="capitalize text-zinc-200">{xiTitle}</b> {model.bestXI.map(id => <button key={id} type="button" onClick={() => onPlayerOpen(id)} className="mr-2 py-1 text-emerald-300">{playerName(id)}</button>)}</div>}
    {onNavigate && groups.some(group => group.rows.length) && <div className="mt-3 space-y-1.5">
      <h3 className="text-xs font-semibold">Team Records</h3>{groups.map(group => <RecordPreview key={group.id} group={group} players={playerById} teams={teamById} matches={matchById} scope={scope} onNavigate={onNavigate} />)}
    </div>}
  </div>
}

function Awards({ seasons, openSeason, awardScope, onToggle, players, teams, matches, states, onPlayerOpen }: Props & { seasons: string[]; openSeason: string | null; awardScope: AwardScope; onToggle: (season: string | null) => void; onPlayerOpen: (id: string) => void }) {
  return <><h2 className="mb-2 text-sm font-semibold">Award History</h2><p className="mb-3 text-[10px] text-zinc-500">Open a season to view its finalized awards.</p><div className="space-y-2">{seasons.map(season => <section key={season} className="rounded-2xl bg-zinc-900"><button type="button" onClick={() => onToggle(openSeason === season ? null : season)} className="flex min-h-12 w-full items-center justify-between px-3 text-left text-sm font-black"><span>{season}</span><span className="text-xs text-zinc-400">{openSeason === season ? 'Hide' : 'Open'}</span></button>{openSeason === season && <AwardsDetail season={season} awardScope={awardScope} onPlayerOpen={onPlayerOpen} players={players} teams={teams} matches={matches} states={states} />}</section>)}</div></>
}

function AwardsDetail({ season, players, teams, matches, states, awardScope, onPlayerOpen }: Props & { season: string; awardScope: AwardScope; onPlayerOpen: (id: string) => void }) {
  const award = useMemo(() => historyAwardResultForScope(teams, players, matches, states, season, awardScope), [teams, players, matches, states, season, awardScope])
  const statFallback = useMemo(() => {
    if (award || awardScope === 'first-half' || awardScope === 'second-half') return undefined
    if (awardScope === 'season') {
      const result = seasonAwards(season, teams, players, matches, states)
      return { complete: result.complete, scorers: result.goldenBootWinners, assistLeaders: result.assistLeaderWinners, goalkeepers: result.goalkeeper ? [result.goalkeeper] : [] }
    }
    return awardsForCompetition(awardScope, season, awardScope === 'league' ? teams : currentStaticTeams(teams), players, matches, states)
  }, [award, awardScope, season, teams, players, matches, states])
  if (!award?.complete && !statFallback?.complete) return <p className="border-t border-white/5 p-3 text-xs text-zinc-500">No finalized official awards in this scope.</p>
  const individual = award?.individualAwards ?? statFallback
  const statAwards = individual ? [
    { label: 'Top Scorer', winners: individual.scorers, suffix: 'goals' },
    { label: 'Assist King', winners: individual.assistLeaders, suffix: 'assists' },
    { label: individual.goalkeepers[0]?.label ?? 'Goalkeeper', winners: individual.goalkeepers, suffix: awardScope === 'league' ? 'clean sheets' : 'rating' },
  ] : []
  return <div className="space-y-3 border-t border-white/5 px-3 pb-3 pt-2">
    <p className="text-[10px] text-emerald-400">{award?.scopeLabel ?? `${season} · ${AWARD_SCOPES.find(scope => scope.value === awardScope)?.label}`} · Finalized</p>
    {award && <><div className="rounded-xl bg-black/30 p-3"><h3 className="text-xs font-semibold">{award.playerLabel}</h3><button type="button" onClick={() => onPlayerOpen(award.bestPlayerId)} className="mt-2 text-left text-xs text-emerald-300">{playerFullName(players.find(player => player.id === award.bestPlayerId))} · {award.statsByPlayer[award.bestPlayerId]?.avgRating?.toFixed(2) ?? '—'}</button></div>
    <AwardBestXI title={award.teamLabel} result={award} players={players} teams={teams} onPlayerOpen={onPlayerOpen} /></>}
    {statAwards.filter(group => group.winners.length).map(group => <section key={group.label} className="rounded-xl bg-black/30 p-3"><h3 className="text-xs font-semibold">{group.label}</h3><div className="mt-2 space-y-1">{group.winners.map(winner => <button key={winner.playerId} type="button" onClick={() => onPlayerOpen(winner.playerId)} className="block py-1 text-left text-xs text-emerald-300">{playerFullName(players.find(player => player.id === winner.playerId))} · {group.suffix === 'rating' ? winner.value.toFixed(2) : winner.value} {group.suffix}</button>)}</div></section>)}
  </div>
}

function Fact({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-lg bg-black/30 p-2"><small className="block text-zinc-500">{label}</small><div className="mt-1 break-words font-bold">{value}</div></div> }
