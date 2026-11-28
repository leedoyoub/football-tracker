import { PlayerIdentityAction, TeamIdentityAction } from './EntityActions'
import { CombinationPairIdentity } from './CombinationPairIdentity'
import { PlayerAvatar } from './PlayerAvatar'
import { TeamIcon } from './TeamIcon'
import { resultCompetitionLabel } from '../lib/competitionResults'
import { matchScore } from '../engine/rating'
import { recordedTeamId } from '../engine/matchPerspective'
import type { Match, Player, Team, View } from '../types'
import { recordRowKey, type RecordsLeaderboardGroup, type RecordsLeaderboardRow, type RecordsScope } from '../screens/recordsLeaderboards'

type Props = {
  row: RecordsLeaderboardRow
  group: RecordsLeaderboardGroup
  players: Map<string, Player>
  teams: Map<string, Team>
  matches: Map<string, Match>
  scope: RecordsScope
  onNavigate: (view: View) => void
}

export function RecordRow({ row, group, players, teams, matches, scope, onNavigate }: Props) {
  const player = players.get(row.id)
  const team = teams.get(row.id)
  const playerIds = row.playerIds ?? row.combinationPair?.playerIds
  const partnership = () => playerIds && onNavigate({ name: 'partnership', playerIds, teamId: row.combinationTeamId, teamIds: scope.teamIds, seasonIds: scope.seasons, competition: scope.competition, recordId: group.id })
  const playerAction = (id: string, label?: string) => {
    const item = players.get(id)
    return <PlayerIdentityAction key={id} player={item} onNavigate={() => onNavigate({ name: 'player', id, ...(row.season ? { season: row.season } : {}) })} className="flex min-w-0 items-center gap-1.5 font-semibold">
      <PlayerAvatar photoUrl={item?.photoUrl || item?.image} number={item?.number} className="size-6 shrink-0 text-[8px]" /><span className="truncate">{label ?? item?.displayName ?? item?.name ?? id}</span>
    </PlayerIdentityAction>
  }
  const match = row.matchId ? matches.get(row.matchId) : undefined
  return <div className="grid min-h-14 grid-cols-[1.6rem_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2 text-xs">
    <b className="pt-1 tabular-nums text-zinc-500">#{row.rank}</b>
    <div className="min-w-0">
      {row.combinationPair ? <CombinationPairIdentity pair={row.combinationPair} playerById={players} onNavigate={onNavigate} />
        : playerIds ? <div className="flex min-w-0 flex-wrap gap-1">{playerIds.map(id => playerAction(id))}</div>
          : group.kind === 'team' ? <TeamIdentityAction team={team} onNavigate={id => onNavigate({ name: 'team', id })} className="flex min-w-0 items-center gap-1.5 font-semibold"><TeamIcon team={team} className="size-6 shrink-0 text-[8px]" /><span className="truncate">{team?.name ?? row.name}</span></TeamIdentityAction>
            : playerAction(row.id, player?.displayName ?? row.name)}
      {match ? <RecordMatchLink match={match} teamId={group.kind === 'team' ? row.id : row.teamIds?.[0]} teams={teams} onNavigate={onNavigate} />
        : row.totals ? <div className="flex flex-wrap gap-x-2 text-[10px] tabular-nums text-zinc-400">{([['played', 'P'], ['wins', 'W'], ['draws', 'D'], ['losses', 'L']] as const).map(([key, label]) => <span key={key} className={group.id === key ? 'font-bold text-emerald-300' : undefined}>{label} {row.totals![key]}</span>)}</div>
          : <span className="block truncate text-[10px] text-zinc-400" title={row.detail}>{row.detail}{row.inProgress ? ' · In progress' : ''}</span>}
      {!!row.streakMatchIds?.length && <div className="no-scrollbar mt-1 flex gap-2 overflow-x-auto text-[10px]" aria-label="Longest runs">
        {row.streakMatchIds.map((run, runIndex) => <div key={run[0]} className="flex shrink-0 gap-1 rounded bg-white/5" role="group" aria-label={`Streak ${runIndex + 1} matches`}>
          {run.map((id, index) => <button key={id} type="button" onClick={() => onNavigate({ name: 'match', id })} className="min-h-8 shrink-0 rounded px-2 text-emerald-300">{run.length === 1 ? 'Match' : index === 0 ? 'Start' : index === run.length - 1 ? 'End' : matches.get(id)?.date || `Match ${index + 1}`}</button>)}
        </div>)}
      </div>}
      {playerIds && <button type="button" onClick={partnership} className="min-h-8 text-[10px] font-semibold text-emerald-300">Partnership details</button>}
    </div>
    <b className="pt-1 text-right tabular-nums text-emerald-300">{row.value}</b>
  </div>
}

export function RecordMatchLink({ match, teamId = recordedTeamId(match), teams, onNavigate }: { match: Match; teamId?: string; teams: Map<string, Team>; onNavigate: (view: View) => void }) {
  const score = matchScore(match)
  const home = teamId === match.homeTeamId
  const opponentId = home ? match.awayTeamId : match.homeTeamId
  const opponent = teams.get(opponentId)
  const opponentName = teamId === recordedTeamId(match) && match.opponentName ? match.opponentName : opponent?.name ?? opponentId
  return <div className="mt-0.5 min-w-0 text-[10px] text-zinc-400">
    <div className="flex min-w-0 items-center gap-1">
      {opponent ? <TeamIdentityAction team={opponent} onNavigate={id => onNavigate({ name: 'team', id })} className="flex min-w-0 items-center gap-1"><TeamIcon team={opponent} className="size-4 shrink-0 text-[6px]" /><span className="truncate">{opponentName}</span></TeamIdentityAction> : <span className="truncate">{opponentName}</span>}
      <button type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="min-h-8 shrink-0 rounded px-1.5 font-bold tabular-nums text-emerald-300" aria-label={`Open match against ${opponentName}, ${home ? score.home : score.away} to ${home ? score.away : score.home}`}>{home ? score.home : score.away} : {home ? score.away : score.home}</button>
    </div>
    <div className="truncate" title={`${match.season} · ${resultCompetitionLabel(match)}`}>{match.season} · {resultCompetitionLabel(match)}</div>
  </div>
}

export function RecordPreview({ group, players, teams, matches, scope, onNavigate }: Omit<Props, 'row'>) {
  const leaders = group.rows.filter(row => row.rank === 1)
  const preview = leaders.length ? leaders : group.rows.slice(0, 1)
  const open = () => onNavigate({ name: 'records-leaderboard', category: group.kind, leaderboardId: group.id, competition: scope.competition, seasonIds: scope.seasons, teamIds: scope.teamIds, positionFilter: scope.positionFilter, positionFilters: scope.positionFilters, rankMode: scope.rankMode })
  return <section className="overflow-hidden rounded-xl bg-zinc-900">
    <button type="button" onClick={open} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left">
      <h3 className="text-xs font-semibold">{group.title}</h3>
      <span className="secondary-view-all shrink-0">{leaders.length > 1 ? `${leaders.length} leaders · View All` : 'View All'}</span>
    </button>
    {preview.length ? preview.map(row => <div key={recordRowKey(row)} className="border-t border-white/5"><RecordRow row={row} group={group} players={players} teams={teams} matches={matches} scope={scope} onNavigate={onNavigate} /></div>)
      : <p className="px-3 pb-3 text-[10px] text-zinc-500">No qualifying records in this scope.</p>}
  </section>
}
