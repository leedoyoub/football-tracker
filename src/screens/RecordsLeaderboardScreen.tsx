import { useMemo } from 'react'
import { PlayerIdentityAction, TeamIdentityAction } from '../components/EntityActions'
import { CombinationPairIdentity } from '../components/CombinationPairIdentity'
import { PositionFilter } from '../components/PositionFilter'
import { TeamFilter } from '../components/TeamFilter'
import { RecordsSeasonFilter } from '../components/RecordsSeasonFilter'
import { CompetitionScopeSelector } from '../components/CompetitionScopeSelector'
import { useStore } from '../store'
import { recordsLeaderboardGroups, type RecordsLeaderboardRow } from './recordsLeaderboards'
import { seasonsFromMatches } from '../engine/stats'
import type { ScreenStateByView, View } from '../types'

export function RecordsLeaderboardScreen({ screenState, onStateChange, onNavigate, onBack }: { screenState: ScreenStateByView['records-leaderboard']; onStateChange: (state: ScreenStateByView['records-leaderboard']) => void; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches } = useStore()
  const patch = (next: Partial<ScreenStateByView['records-leaderboard']>) => onStateChange({ ...screenState, ...next })
  const groups = useMemo(() => recordsLeaderboardGroups({
    category: screenState.category,
    players,
    teams,
    matches,
    scope: { seasons: screenState.filterSeasonIds, teamIds: screenState.filterTeamIds, competition: screenState.competition, positionFilter: screenState.positionFilter },
  }), [screenState, players, teams, matches])
  const group = groups.find(item => item.id === screenState.leaderboardId)
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const seasons = useMemo(() => seasonsFromMatches(matches), [matches])
  if (!group) return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="text-xs text-emerald-300">Back to Records</button><p className="mt-5 text-sm text-zinc-400">This leaderboard is not available for the current Records scope.</p></div>
  return <div className="px-4 pb-8 pt-6"><div className="mb-4 flex items-start justify-between gap-3"><div><button type="button" onClick={onBack} className="mb-2 text-xs text-emerald-300">Back to Records</button><h1 className="text-xl font-semibold">{group.title}</h1><p className="text-[10px] text-zinc-500">Full Records leaderboard</p></div><div className="flex shrink-0 flex-wrap justify-end gap-1.5"><RecordsSeasonFilter value={screenState.filterSeasonIds} seasons={seasons} onChange={filterSeasonIds => patch({ filterSeasonIds })} label="Records leaderboard seasons" />{group.applicableFilters.position && <PositionFilter value={screenState.positionFilter} onChange={positionFilter => patch({ positionFilter })} label="Records leaderboard position" />}{group.applicableFilters.team && <TeamFilter value={screenState.filterTeamIds[0] ?? null} teams={teams} onChange={teamId => patch({ filterTeamIds: teamId ? [teamId] : [] })} label="Records leaderboard team" />}</div></div><div className="sticky top-0 z-20 -mx-4 mb-4 border-y border-white/5 bg-black/95 px-4 py-2"><CompetitionScopeSelector value={screenState.competition} onChange={competition => patch({ competition })} /></div><div className="overflow-hidden rounded-xl bg-zinc-900">{group.rows.map(row => <div key={row.id} className="grid min-h-12 grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-white/5 px-3 text-xs last:border-0"><b className="text-zinc-500">#{row.rank}</b><LeaderboardIdentity row={row} playerById={playerById} teamById={teamById} onNavigate={onNavigate} /><b className="text-emerald-300">{row.value}</b></div>)}</div>{!group.rows.length && <p className="py-5 text-center text-sm text-zinc-500">No qualifying records in this scope.</p>}</div>
}

function LeaderboardIdentity({ row, playerById, teamById, onNavigate }: { row: RecordsLeaderboardRow; playerById: Map<string, import('../types').Player>; teamById: Map<string, import('../types').Team>; onNavigate: (view: View) => void }) {
  if (row.combinationPair) return <span className="min-w-0 overflow-hidden"><CombinationPairIdentity pair={row.combinationPair} playerById={playerById} onNavigate={onNavigate} />{row.detail !== 'Combination record' && <small className="block truncate text-[9px] text-zinc-500">{row.detail}</small>}</span>
  if (row.playerIds) return <span className="min-w-0 overflow-hidden"><span className="flex min-w-0 items-center gap-1 overflow-hidden">{row.playerIds.map(id => { const player = playerById.get(id); return <PlayerIdentityAction key={id} player={player} onNavigate={player ? playerId => onNavigate({ name: 'player', id: playerId }) : undefined} className="min-w-0 truncate text-left font-semibold" avatarClassName="hidden">{player?.displayName ?? player?.name ?? 'Unknown player'}</PlayerIdentityAction> })}</span><small className="block truncate text-[9px] text-zinc-500">{row.detail}</small></span>
  const team = teamById.get(row.id)
  if (team) return <TeamIdentityAction team={team} onNavigate={teamId => onNavigate({ name: 'team', id: teamId })} className="min-w-0 truncate text-left font-semibold">{team.name}</TeamIdentityAction>
  const player = playerById.get(row.id)
  return <PlayerIdentityAction player={player} onNavigate={player ? playerId => onNavigate({ name: 'player', id: playerId }) : undefined} className="min-w-0 truncate text-left font-semibold" avatarClassName="hidden">{row.name}</PlayerIdentityAction>
}
