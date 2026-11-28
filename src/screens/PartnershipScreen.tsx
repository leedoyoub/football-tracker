import { useMemo, useState } from 'react'
import { PlayerIdentityAction } from '../components/EntityActions'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { TeamLink } from '../components/TeamLink'
import { formatDate, playerFullName } from '../components/ui'
import { combinationPairPresentation, defensivePairRecordIds, partnershipRecordIds } from '../engine/combinationLeaderboards'
import { assignmentSnapshotForMatch, formatCompetitionContext } from '../engine/competitionContext'
import { partnershipDetail, type PartnershipGame } from '../engine/partnershipRecords'
import { matchScore } from '../engine/rating'
import { useStore } from '../store'
import type { Team, View } from '../types'

const MATCH_PAGE_SIZE = 20
const duration = (minutes: number) => `${Number(minutes.toFixed(2))}′`
const decimal = (value: number | null) => value?.toFixed(2) ?? '—'

export function PartnershipScreen({ view, onNavigate, onBack }: {
  view: Extract<View, { name: 'partnership' }>
  onNavigate: (view: View) => void
  onBack?: () => void
}) {
  const { players, teams, matches } = useStore()
  const [visible, setVisible] = useState(MATCH_PAGE_SIZE)
  const detail = useMemo(() => partnershipDetail(matches, {
    seasons: view.seasonIds ?? [],
    teamIds: view.teamId ? [view.teamId] : view.teamIds ?? [],
    competition: view.competition ?? 'all',
  }, view.playerIds, view.recordId), [matches, view])
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const team = view.teamId ? teamById.get(view.teamId) : undefined
  const centreBacks = view.recordId !== undefined && defensivePairRecordIds.includes(view.recordId)
  const defensiveUnit = view.recordId?.startsWith('best-unit:defence:')
  const hasConnector = centreBacks || (view.recordId !== undefined && partnershipRecordIds.includes(view.recordId))
  const connector = hasConnector ? combinationPairPresentation(view.recordId!, detail.playerIds).connector : detail.playerIds.length === 2 ? '&' : '+'
  const assistedGoals = detail.directions.reduce((sum, row) => sum + row.goals, 0)
  const nameOf = (id: string) => playerFullName(playerById.get(id))
  const directions = detail.playerIds.length === 2 ? [detail.playerIds, detail.playerIds.slice().reverse()].map(([assisterId, scorerId]) => ({
    assisterId,
    scorerId,
    goals: detail.directions.find(row => row.assisterId === assisterId && row.scorerId === scorerId)?.goals ?? 0,
  })) : detail.directions

  return <div className="space-y-5 px-4 pb-8 pt-6">
    <header>
      {onBack && <button type="button" onClick={onBack} className="mb-1 min-h-10 rounded-md text-xs font-semibold text-emerald-300 focus-visible:outline focus-visible:outline-emerald-300">Back to Combinations</button>}
      <h1 className="text-2xl font-semibold">{detail.playerIds.length === 2 ? 'Partnership' : 'Combination'}</h1>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        {detail.playerIds.map((id, index) => {
          const player = playerById.get(id)
          return <div key={id} className="flex min-w-0 max-w-full items-center gap-2">
            {index > 0 && <span aria-hidden="true" className="text-xs font-semibold text-zinc-500">{connector}</span>}
            <PlayerIdentityAction player={player} onNavigate={playerId => onNavigate({ name: 'player', id: playerId })} className="flex min-h-11 min-w-0 items-center gap-2 text-sm font-semibold">
              <PlayerAvatar photoUrl={player?.photoUrl || player?.image} number={player?.number} className="h-8 w-8 text-[9px]" />
              <span className="min-w-0 break-words">{nameOf(id)}</span>
            </PlayerIdentityAction>
          </div>
        })}
      </div>
      {team && <div className="mt-1 text-xs text-zinc-300"><TeamLink team={team} onNavigate={id => onNavigate({ name: 'team', id })} /></div>}
    </header>

    {detail.games.length ? <>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5 sm:grid-cols-3">
        <Metric label="Matches together" value={detail.matchesTogether} />
        <Metric label="Starts together" value={detail.startsTogether} />
        <Metric label="Shared minutes" value={duration(detail.minutesTogether)} />
        <Metric label="Combined G+A" value={detail.combinedGA} />
        <Metric label="Starting PPG" value={decimal(detail.ppg)} />
      </dl>

      {(directions.length > 0 || assistedGoals > 0) && <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Goal combinations</h2>
          <p className="text-xs font-semibold text-emerald-300">{assistedGoals} {assistedGoals === 1 ? 'assisted goal' : 'assisted goals'}</p>
        </div>
        <dl className="divide-y divide-white/5 rounded-xl border border-white/5 bg-zinc-900 px-3">
          {directions.map(row => <div key={JSON.stringify([row.assisterId, row.scorerId])} className="flex min-h-10 items-center justify-between gap-3 py-2 text-xs">
            <dt className="min-w-0 break-words">{nameOf(row.assisterId)} → {nameOf(row.scorerId)}</dt>
            <dd className="shrink-0 font-semibold tabular-nums">{row.goals}</dd>
          </div>)}
        </dl>
      </section>}

      {detail.defensiveMinutes > 0 && <section>
        <h2 className="mb-2 text-sm font-semibold">{centreBacks ? 'Centre-back partnership' : defensiveUnit ? 'Defensive unit record' : 'Shared defensive play'}</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5">
          <Metric label="GA/90" value={decimal(detail.defensiveGA90)} />
          <Metric label="Opponent SOT/90" value={decimal(detail.defensiveSot90)} />
          <Metric label="Matches in sample" value={detail.defensiveMatches} />
          <Metric label={defensiveUnit ? 'Shared minutes' : 'Shared defensive minutes'} value={duration(detail.defensiveMinutes)} />
        </dl>
      </section>}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Match evidence</h2>
        <ol className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5 bg-zinc-900">
          {detail.games.slice(0, visible).map(game => <li key={JSON.stringify([game.match.id, game.teamId])}><EvidenceRow game={game} teams={teamById} onNavigate={onNavigate} /></li>)}
        </ol>
        {detail.games.length > visible && <button type="button" onClick={() => setVisible(number => number + MATCH_PAGE_SIZE)} className="mt-2 min-h-11 w-full rounded-xl bg-zinc-900 text-xs font-semibold text-emerald-300">Show more matches</button>}
      </section>
    </> : <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">These players have no recorded same-team appearances in this scope.</p>}
  </div>
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="min-w-0 bg-zinc-900 px-3 py-2.5">
    <dt className="text-[10px] font-medium text-zinc-400">{label}</dt>
    <dd className="mt-0.5 text-base font-semibold tabular-nums text-emerald-300">{value}</dd>
  </div>
}

function EvidenceRow({ game, teams, onNavigate }: { game: PartnershipGame; teams: ReadonlyMap<string, Team>; onNavigate: (view: View) => void }) {
  const { match, teamId } = game
  const atHome = teamId === match.homeTeamId
  const opponent = teams.get(atHome ? match.awayTeamId : match.homeTeamId)
  const ours = teams.get(teamId)?.shortName ?? teams.get(teamId)?.name ?? teamId
  const theirs = opponent?.shortName ?? opponent?.name ?? match.opponentName ?? 'Opponent'
  const score = matchScore(match)
  const scoreText = atHome ? `${score.home}–${score.away}` : `${score.away}–${score.home}`
  const goals = game.directions.reduce((sum, row) => sum + row.goals, 0)
  const info = `${formatCompetitionContext(assignmentSnapshotForMatch(match))} · ${formatDate(match.date)}`
  return <button type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-3 py-2 text-left focus-visible:outline focus-visible:outline-emerald-300">
    <span className="min-w-0">
      <span className="block break-words text-xs font-semibold">{ours} vs {theirs}</span>
      <span className="mt-0.5 block text-[10px] text-zinc-400">{info}</span>
      <span className="mt-0.5 block text-[10px] text-zinc-400">{duration(game.minutesTogether)} together{game.startedTogether ? ' · Joint start' : ''}{goals > 0 ? ` · ${goals} assisted ${goals === 1 ? 'goal' : 'goals'}` : ''}</span>
    </span>
    <span className="font-semibold tabular-nums text-emerald-300">{scoreText}</span>
  </button>
}
