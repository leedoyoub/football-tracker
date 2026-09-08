import { useState } from 'react'
import { recentMatches, recentMatchPositions } from './recentMatches'
import { AssistIcon, formatDate, GoalIcon, ratingTone } from '../components/ui'
import { TeamIcon } from '../components/TeamIcon'
import { matchScore, ratePlayerMatch, getMatchManOfTheMatch } from '../engine/rating'
import { playerSeasonStats, seasonsFromMatches } from '../engine/stats'
import { useStore } from '../store'
import type { Match, View } from '../types'

function ResultPill({ match, teamId }: { match: Match; teamId: string }) {
  const score = matchScore(match)
  const ours = match.homeTeamId === teamId ? score.home : score.away
  const theirs = match.homeTeamId === teamId ? score.away : score.home
  const result = ours > theirs ? 'WIN' : ours === theirs ? 'DRAW' : 'LOSS'
  return <span className={`text-[10px] font-black ${result === 'WIN' ? 'text-emerald-400' : result === 'DRAW' ? 'text-yellow-400' : 'text-red-400'}`}>{result}</span>
}

export function PlayerDetailScreen({ playerId, season, onNavigate, onBack }: { playerId: string; season: string; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches } = useStore()
  const player = players.find((item) => item.id === playerId)
  const seasons = seasonsFromMatches(matches)
  const active = seasons.includes(season) ? season : seasons[0] ?? season
  const statsBase = player ? playerSeasonStats(player, players, matches, active) : null
  if (!player || !statsBase) return <div className="p-6 text-sm text-zinc-400">Player not found.</div>

  const recordedTeamIds = [...new Set(matches.filter((match) => match.season === active).flatMap((match) => match.appearances.filter((appearance) => appearance.playerId === player.id).map((appearance) => appearance.teamId)))]
  
  // 기본 선택 로직: 진입 Context가 있는 경우 해당 팀 우선, 없으면 모든 기록 팀 선택
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(
    recordedTeamIds.length > 0 ? recordedTeamIds : (player.teamIds?.filter(id => recordedTeamIds.includes(id)) ?? (player.teamId ? [player.teamId] : []))
  )

  const records = recentMatches(matches.filter((match) => match.season === active && match.appearances.some((appearance) => appearance.playerId === player.id && selectedTeamIds.includes(appearance.teamId))))
  const rated = records.flatMap((match) => { const rating = ratePlayerMatch(match, player); return rating ? [{ match, rating, appearance: match.appearances.find((item) => item.playerId === player.id)! }] : [] })
  
  const goals = records.reduce((total, match) => total + match.events.filter((event) => event.type === 'goal' && !event.ownGoal && event.playerId === player.id).length, 0)
  const assists = records.reduce((total, match) => total + match.events.filter((event) => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id).length, 0)
  const minutes = rated.reduce((total, item) => total + item.rating.minutes, 0)
  const starts = rated.filter((item) => item.rating.starter).length
  const subApps = rated.length - starts
  const average = rated.length ? rated.reduce((total, item) => total + item.rating.raw, 0) / rated.length : 0
  const results = rated.reduce((total, item) => {
    const score = matchScore(item.match)
    const ours = item.match.homeTeamId === item.appearance.teamId ? score.home : score.away
    const theirs = item.match.homeTeamId === item.appearance.teamId ? score.away : score.home
    if (ours > theirs) total.wins += 1
    else if (ours === theirs) total.draws += 1
    else total.losses += 1
    return total
  }, { wins: 0, draws: 0, losses: 0 })
  const mom = records.filter((match) => getMatchManOfTheMatch(match, players) === player.id).length

  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button>
    <div className="mb-4">
      <p className="text-xs text-zinc-400">{player.teamId ? teams.find((team) => team.id === player.teamId)?.name : 'No Team'} · #{player.number} · {player.position}</p>
      <h1 className="text-2xl font-semibold">{player.fullName ?? player.name}</h1>
      <button type="button" onClick={() => onNavigate({ name: 'edit-player', id: player.id })} className="mt-2 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-bold">Edit player</button>
    </div>

    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {recordedTeamIds.map((teamId) => {
        const team = teams.find((item) => item.id === teamId)
        const selected = selectedTeamIds.includes(teamId)
        return <button
          key={teamId}
          type="button"
          onClick={() => setSelectedTeamIds((ids) => selected ? ids.filter((id) => id !== teamId) : [...ids, teamId])}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black transition-all ${selected ? '' : 'bg-zinc-800 text-zinc-500'}`}
        >
          {selected ? <TeamIcon team={team} className="h-4 w-12 text-[8px] uppercase">{team?.shortName}</TeamIcon> : team?.shortName}
        </button>
      })}
    </div>

    <div className="mb-3 grid grid-cols-4 gap-2">{[['Avg', average > 0 ? average.toFixed(2) : '—'], ['Apps', String(rated.length)], ['G', String(goals)], ['A', String(assists)]].map(([label, value]) => <div key={label} className="rounded-2xl bg-zinc-900 px-2 py-3 text-center"><div className="text-lg font-bold">{value}</div><div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div></div>)}</div>
    <div className="mb-5 grid grid-cols-4 gap-2">{[['Starts', starts], ['Subs', subApps], ['Min', minutes], ['MOM', mom], ['G/90', minutes > 0 ? (goals / minutes * 90).toFixed(2) : '0.00'], ['A/90', minutes > 0 ? (assists / minutes * 90).toFixed(2) : '0.00'], ['G+A/90', minutes > 0 ? ((goals + assists) / minutes * 90).toFixed(2) : '0.00'], ['W-D-L', `${results.wins}-${results.draws}-${results.losses}`]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-zinc-900 px-1 py-2 text-center"><div className="text-sm font-bold">{value}</div><div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div></div>)}</div>
    
    <h2 className="mb-2 text-sm font-semibold">Previous matches · {active}</h2>
    <div className="space-y-3">
      {records.length === 0 && <p className="text-xs text-zinc-500">No match records this season for selected teams.</p>}
      {records.map((match) => {
        const appearance = match.appearances.find((item) => item.playerId === player.id)!
        const rating = ratePlayerMatch(match, player)
        const team = teams.find(t => t.id === appearance.teamId)
        const matchGoals = match.events.filter((event) => event.type === 'goal' && !event.ownGoal && event.playerId === player.id).length
        const matchAssists = match.events.filter((event) => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id).length
        const score = matchScore(match); const home = teams.find((team) => team.id === match.homeTeamId); const away = teams.find((team) => team.id === match.awayTeamId)
        const isMom = getMatchManOfTheMatch(match, players) === player.id
        return <button key={match.id} type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="w-full rounded-2xl bg-zinc-900 p-3 text-left">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-zinc-400">
              <TeamIcon team={team} className="h-4 w-4 text-[6px]" />
              MD {match.matchDay} · {formatDate(match.date)} · {rating ? `${rating.minutes}' ${rating.starter ? 'XI' : 'Sub'}` : 'Unused substitute'}
            </span>
            <span className={`text-lg font-bold ${isMom ? 'text-blue-400' : rating ? ratingTone(rating.rating) : 'text-zinc-500'}`}>
              {rating ? rating.raw.toFixed(1) : '—'}
            </span>
          </div>
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>{home?.shortName} {score.home}–{score.away} {away?.shortName}</span>
            <ResultPill match={match} teamId={appearance.teamId} />
          </div>
          <div className="mb-2 text-xs font-semibold text-zinc-300" aria-label="Match positions">{recentMatchPositions(match, appearance)}</div>
          {rating && <div className="flex items-center gap-1 text-zinc-300">
            {Array.from({ length: matchGoals }).map((_, index) => <GoalIcon key={`g${index}`} />)}
            {Array.from({ length: matchAssists }).map((_, index) => <AssistIcon key={`a${index}`} />)}
          </div>}
        </button>
      })}
    </div>
  </div>
}
