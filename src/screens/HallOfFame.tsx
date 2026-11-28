import { useMemo } from 'react'
import { Pitch } from '../components/Pitch'
import { PlayerIdentityAction, TeamIdentityAction } from '../components/EntityActions'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { TeamIcon } from '../components/TeamIcon'
import { RecordMatchLink, RecordPreview } from '../components/RecordRows'
import { VirtualRankingList } from '../components/VirtualRankingList'
import { hallOfFameCareer, PLAYER_HONOR_POINTS, TEAM_PLACEMENT_POINTS, type CareerScoreRow } from '../engine/careerScore'
import { recordBreakers } from '../engine/recordBreakers'
import type { CompetitionState, Match, Player, Team, View } from '../types'
import { EMPTY_RECORDS_SCOPE, recordsLeaderboardGroups } from './recordsLeaderboards'

const panels = [{ id: 'overview', title: 'Overview' }, { id: 'career', title: 'Career Rankings' }, { id: 'legendary', title: 'Legendary Records' }, { id: 'breakers', title: 'Record Breakers' }]
type Props = { players: Player[]; teams: Team[]; matches: Match[]; states: CompetitionState[]; panel: string; careerPlayerId?: string; onPanel: (id: string) => void; onCareerPlayer: (id: string) => void; onNavigate: (view: View) => void }
const points = (score: number) => score.toFixed(3)

export function HallOfFame({ players, teams, matches, states, panel, careerPlayerId, onPanel, onCareerPlayer, onNavigate }: Props) {
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const matchById = useMemo(() => new Map(matches.map(match => [match.id, match])), [matches])
  const career = useMemo(() => panel === 'overview' || panel === 'career' ? hallOfFameCareer(teams, players, matches, states) : undefined, [panel, teams, players, matches, states])
  const rankedCareers = useMemo(() => {
    let previous: number | undefined
    let rank = 0
    return career?.rankings.map((row, index) => {
      if (row.score !== previous) rank = index + 1
      previous = row.score
      return { ...row, rank }
    }) ?? []
  }, [career])
  const legendary = useMemo(() => panel === 'legendary' ? [
    ...recordsLeaderboardGroups({ category: 'player', teams, players, matches, states, scope: EMPTY_RECORDS_SCOPE, selectedIds: ['goals', 'assists', 'appearances', 'mom'] }),
    ...recordsLeaderboardGroups({ category: 'player', teams, players, matches, states, section: 'awards', scope: EMPTY_RECORDS_SCOPE, selectedIds: ['awards-season-mvp', 'awards-xi', 'awards-championships'] }),
  ] : [], [panel, teams, players, matches, states])
  const breakers = useMemo(() => panel === 'breakers' ? recordBreakers(players, matches, teams).map(row => ({ ...row, id: JSON.stringify([row.recordId, row.entityId, row.match.id]) })) : [], [panel, players, matches, teams])
  const greatest = career?.greatest
  const greatestPlayer = greatest ? playerById.get(greatest.playerId) : undefined
  const selected = career?.rankings.find(row => row.playerId === careerPlayerId)
  const openPlayer = (id: string) => onNavigate({ name: 'player', id })
  return <>
    <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl bg-zinc-900 p-1" aria-label="Hall of Fame sections">
      {panels.map(item => <button key={item.id} type="button" aria-pressed={panel === item.id} onClick={() => onPanel(item.id)} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold ${panel === item.id ? 'bg-emerald-500 text-black' : 'text-zinc-300'}`}>{item.title}</button>)}
    </div>
    {panel === 'overview' && career && <div className="space-y-4">
      <section className="rounded-xl border border-emerald-400/20 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold">Greatest of All Time</h2>
        {greatest ? <>
          <div className="flex items-center justify-between gap-2">
            <PlayerIdentityAction player={greatestPlayer} onNavigate={openPlayer} className="flex min-w-0 items-center gap-2 font-semibold">
              <PlayerAvatar photoUrl={greatestPlayer?.photoUrl || greatestPlayer?.image} number={greatestPlayer?.number} className="size-12 shrink-0" /><span className="min-w-0 break-words">{greatestPlayer?.displayName ?? greatestPlayer?.name}</span>
            </PlayerIdentityAction>
            <div className="shrink-0 text-right"><strong className="block text-xl tabular-nums text-emerald-300">{points(greatest.score)}</strong><small className="text-zinc-400">Career Score</small></div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-400">
            <span>{greatest.position}</span><span>Career teams</span>{greatest.playedTeamIds.map(id => <TeamIdentityAction key={id} team={teamById.get(id)} onNavigate={teamId => onNavigate({ name: 'team', id: teamId })} className="flex min-h-9 items-center gap-1"><TeamIcon team={teamById.get(id)} className="size-5" />{teamById.get(id)?.name ?? id}</TeamIdentityAction>)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Count label="Ballon d'Or" value={greatest.ballon} /><Count label="Individual honors" value={greatest.honors.length} /><Count label="Team titles" value={greatest.championships} />
          </div>
        </> : <p className="text-xs text-zinc-400">No player meets the career playing-time requirement yet.</p>}
      </section>
      <section className="rounded-xl bg-zinc-900 p-3"><h2 className="mb-3 text-sm font-semibold">All-time Best XI</h2>
        <Pitch slots={career.bestXI} players={players} teams={teams} badgeMode="position" layout="free" showAwardTeamCrest showEmptySlots onSlotClick={slot => slot.playerId && openPlayer(slot.playerId)} />
      </section>
    </div>}
    {panel === 'career' && career && <section className="space-y-2">
      {selected && <CareerBreakdown row={selected} player={playerById.get(selected.playerId)} teams={teamById} />}
      {!career.rankings.length && <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-400">No qualifying careers yet.</p>}
      <div className="overflow-hidden rounded-xl bg-zinc-900"><VirtualRankingList rows={rankedCareers} renderRow={row => <div className="grid min-h-14 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-3 text-xs">
        <b className="text-zinc-500">#{row.rank}</b><PlayerIdentityAction player={playerById.get(row.playerId)} onNavigate={openPlayer} className="min-w-0 font-semibold" avatarClassName="h-7 w-7 shrink-0">{playerById.get(row.playerId)?.displayName ?? playerById.get(row.playerId)?.name}</PlayerIdentityAction>
        <button type="button" onClick={() => onCareerPlayer(row.playerId)} className="min-h-12 px-1 text-right" aria-label={`Show Career Score breakdown for ${playerById.get(row.playerId)?.name ?? row.playerId}`}><strong className="block tabular-nums text-emerald-300">{points(row.score)}</strong><small className="text-zinc-400">Breakdown</small></button>
      </div>} /></div>
    </section>}
    {panel === 'legendary' && <div className="space-y-2">{legendary.map(group => <RecordPreview key={group.id} group={group} players={playerById} teams={teamById} matches={matchById} scope={EMPTY_RECORDS_SCOPE} onNavigate={onNavigate} />)}</div>}
    {panel === 'breakers' && <section className="overflow-hidden rounded-xl bg-zinc-900">
      {!breakers.length && <p className="p-3 text-xs text-zinc-400">No record breaks or tied records yet.</p>}
      <VirtualRankingList rows={breakers} renderRow={row => <div className="grid min-h-24 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 p-3 text-xs">
        <div className="min-w-0">
          <h3 className="mb-1 font-semibold">{row.title}</h3>
          {row.kind === 'player' ? <PlayerIdentityAction player={playerById.get(row.entityId)} onNavigate={openPlayer} avatarClassName="h-6 w-6">{playerById.get(row.entityId)?.displayName ?? playerById.get(row.entityId)?.name ?? row.entityId}</PlayerIdentityAction>
            : <TeamIdentityAction team={teamById.get(row.entityId)} onNavigate={id => onNavigate({ name: 'team', id })} iconClassName="h-6 w-6">{teamById.get(row.entityId)?.name ?? row.entityId}</TeamIdentityAction>}
          <RecordMatchLink match={row.match} teamId={row.teamId} teams={teamById} onNavigate={onNavigate} />
        </div><div className="text-right text-emerald-300"><b className="block">{row.tied ? 'Tied record' : 'New record'}</b><span className="tabular-nums">{Number(row.previous.toFixed(3))} → {Number(row.value.toFixed(3))}</span></div>
      </div>} />
    </section>}
  </>
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 rounded-lg bg-black/30 p-2"><b className="block tabular-nums">{value}</b><span className="text-[10px] text-zinc-400">{label}</span></div>
}

function CareerBreakdown({ row, player, teams }: { row: CareerScoreRow; player?: Player; teams: Map<string, Team> }) {
  return <section className="rounded-xl bg-zinc-900 p-3 text-xs">
    <h3 className="font-semibold">{player?.displayName ?? player?.name ?? row.playerId}</h3>
    <p className="mt-1 text-zinc-400">{row.minutes} / {row.availableMinutes} available minutes</p>
    <div className="my-3 grid grid-cols-3 gap-2">
      <div><b>{points(row.average)}</b><span className="block text-[10px] text-zinc-400">Match average</span></div>
      <div><b>+{points(row.individualBonus)}</b><span className="block text-[10px] text-zinc-400">Individual honors</span></div>
      <div><b>+{points(row.teamBonus)}</b><span className="block text-[10px] text-zinc-400">Team results</span></div>
    </div>
    <div className="max-h-56 space-y-2 overflow-y-auto">
      {row.honors.map(event => <div key={event.id} className="flex justify-between gap-2"><span>{event.season} · {event.label} · {teams.get(event.teamId)?.name ?? event.teamId}</span><b>+{points(PLAYER_HONOR_POINTS[event.kind] / 1000)}</b></div>)}
      {row.placements.map(result => <div key={`${result.season}:${result.competition}:${result.teamId}`} className="flex justify-between gap-2"><span>{result.season} · {result.competition} · {result.label} · {teams.get(result.teamId)?.name ?? result.teamId}</span><b>+{points(TEAM_PLACEMENT_POINTS[result.competition][result.place - 1] / 1000)}</b></div>)}
    </div>
  </section>
}
