import { Pitch } from '../components/Pitch'
import { MatchTimeline } from '../components/MatchTimeline'
import { formatDate, SubstitutePlayerCard } from '../components/ui'
import { getMatchManOfTheMatch, matchScore, rateMatch } from '../engine/rating'
import { assignmentSnapshotForMatch, formatCompetitionContext } from '../engine/competitionContext'
import { matchStory } from '../engine/matchStory'
import { matchChangesForMatch } from '../engine/matchChanges'
import { presentMatchChanges } from '../lib/matchChangePresentation'
import { measureInDevelopment } from '../lib/developmentMeasurement'
import { useStore } from '../store'
import { useMemo, useState } from 'react'
import { SegmentedControl } from '../components/SeasonUI'
import type { Best11Slot, CompetitionState, MatchEvent, Player, ScreenStateByView, Team, View } from '../types'
import { kickoffLineupForMatch } from '../engine/kickoffLineup'
import { orderMatchDetailAppearances } from '../engine/matchDetail'

const positionOrder: Record<string, number> = { ST: 0, LST: 0, RST: 0, SS: 0, LW: 1, RW: 1, CAM: 2, LM: 3, RM: 3, LCM: 4, CM: 4, RCM: 4, LDM: 5, CDM: 5, RDM: 5, LB: 6, RB: 6, CB: 7, LCB: 7, RCB: 7, GK: 8 }
const statsFor = (events: MatchEvent[], id: string) => ({ goals: events.filter(e => e.type === 'goal' && !e.ownGoal && e.playerId === id).length, assists: events.filter(e => e.type === 'goal' && !e.ownGoal && e.assistPlayerId === id).length })

function MatchChangesPanel({ matchId, players, teams, matches, competitionStates }: { matchId: string; players: Player[]; teams: Team[]; matches: ReturnType<typeof useStore>['matches']; competitionStates: CompetitionState[] }) {
  const [open, setOpen] = useState(false)
  const changes = useMemo(() => open ? presentMatchChanges(matchChangesForMatch(players, teams, matches, competitionStates, matchId)) : [], [open, players, teams, matches, competitionStates, matchId])
  return <details className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-10 cursor-pointer text-sm font-black text-emerald-300">What Changed{open && ` · ${changes.length}`}</summary>
    {open && <div className="mt-2 space-y-2">{changes.length ? changes.map(change => <article key={change.id} className={`rounded-lg border p-2 ${change.fallback ? 'border-white/10 bg-black/20' : 'border-emerald-400/15 bg-black/10'}`}><div className="flex items-center justify-between gap-2"><b className="truncate text-xs">{change.title}</b><span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-zinc-300">milestone</span></div><p className="mt-1 text-xs font-black text-emerald-200">{change.primary}</p>{change.secondary.map((detail, index) => <p key={`${change.id}:${index}`} className="mt-1 text-[10px] text-zinc-400">{detail}</p>)}</article>) : <p className="rounded-lg bg-black/20 px-2 py-2 text-xs text-zinc-400">No milestones reached in this match.</p>}</div>}
  </details>
}

export function MatchDetailScreen({ matchId, screenState, onStateChange, onNavigate, onBack, onBackToTeam, onReplace }: { matchId: string; screenState: ScreenStateByView['match']; onStateChange: (state: ScreenStateByView['match']) => void; onNavigate: (view: View) => void; onBack: () => void; onBackToTeam: (teamId: string) => void; onReplace: (view: View) => void }) {
  const { teams, players, matches, competitionStates = [], deleteMatch } = useStore()
  const [deleteConfirmationStep, setDeleteConfirmationStep] = useState(0);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [deleteError, setDeleteError] = useState('')
  const tab = screenState.tab
  const setTab = (next: ScreenStateByView['match']['tab']) => onStateChange({ ...screenState, tab: next })
  
  const match = matches.find(item => item.id === matchId)
  const derived = useMemo(() => measureInDevelopment('Match Detail base read model', () => {
    if (!match) return null
    const teamId = match.teamId ?? (teams.some(team => team.id === match.homeTeamId) ? match.homeTeamId : match.awayTeamId)
    const team = teams.find(item => item.id === teamId)
    const opponent = match.opponentName ?? teams.find(item => item.id === (match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId))?.shortName ?? 'OPP'
    const score = matchScore(match); const isHome = match.homeTeamId === teamId
    const byId = Object.fromEntries(players.map(player => [player.id, player])) as Record<string, Player>
    const ratings = Object.fromEntries(rateMatch(match, players).map(rating => [rating.playerId, rating]))
    const starters = match.appearances.filter(appearance => appearance.teamId === teamId && appearance.role === 'starter')
    const bench = match.appearances.filter(appearance => appearance.teamId === teamId && appearance.role === 'bench').sort((a, b) => (positionOrder[a.position] ?? 99) - (positionOrder[b.position] ?? 99))
    const substitutions = match.events.filter((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub' && event.teamId === teamId)
    const kickoff = kickoffLineupForMatch(match, teamId)
    return { teamId, team, opponent, ours: isHome ? score.home : score.away, theirs: isHome ? score.away : score.home, byId, ratings, sortedRatings: Object.values(ratings).sort((a, b) => b.raw - a.raw || a.playerId.localeCompare(b.playerId)), momId: getMatchManOfTheMatch(match, players), story: matchStory(match, players), starters, bench, substitutions, orderedRatingAppearances: orderMatchDetailAppearances([...starters, ...bench], ratings), outMinutesByPlayer: Object.fromEntries(substitutions.map(event => [event.playerOutId, event.minute])), slots: kickoff.map((slot): Best11Slot => ({ slot: slot.id, position: slot.ratingPosition ?? slot.matchPosition, matchPosition: slot.ratingPosition ?? slot.matchPosition, displayPosition: slot.displayPosition, playerId: slot.playerId, teamId, avgRating: ratings[slot.playerId ?? '']?.rating ?? 0, matches: ratings[slot.playerId ?? ''] ? 1 : 0, x: slot.x, y: slot.y })) }
  }), [match, players, teams])
  if (!match || !derived) return <div className="p-6 text-sm text-zinc-400">Match not found.</div>
  const { teamId, team, opponent, ours, theirs, byId, ratings, sortedRatings, momId, story, starters, bench, substitutions, orderedRatingAppearances, outMinutesByPlayer, slots } = derived
  const savesFor = (id: string) => match.events.reduce((total, event) => total + (event.type === 'save' && event.playerId === id ? event.count ?? 1 : 0), 0)

  const card = (id: string, position: string) => {
    const player = byId[id]; if (!player) return null
    const on = substitutions.find(event => event.playerInId === id); const off = substitutions.find(event => event.playerOutId === id)
    return <SubstitutePlayerCard key={id} player={player} team={team} position={position} rating={on ? ratings[id]?.raw : undefined} stats={statsFor(match.events, id)} inMinute={on?.minute} outMinute={off?.minute} isMotm={id === momId} onClick={() => onNavigate({ name: 'player', id })} />
  }
  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">Back</button>
    {/*
    <p className="text-xs text-zinc-400">{formatCompetitionContext(assignmentSnapshotForMatch(match))} · {formatDate(match.date)}</p>
    */}
    <p className="text-xs text-zinc-400">{formatCompetitionContext(assignmentSnapshotForMatch(match))} · {formatDate(match.date)}</p>
    <h1 className="mb-4 text-2xl font-semibold">{team?.shortName} {ours}-{theirs} {opponent}</h1>
    <SegmentedControl sticky label="Match detail section" value={tab} onChange={setTab} options={[{ value: 'facts', label: 'Match Facts' }, { value: 'lineup', label: 'Lineup' }, { value: 'ratings', label: 'Ratings' }]} />
    {tab === 'facts' && <div className="mt-4"><section className="mb-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-zinc-900 p-3"><small className="text-[9px] uppercase text-zinc-500">Man of the Match</small><button type="button" disabled={!momId} onClick={() => momId && onNavigate({ name: 'player', id: momId })} className="mt-1 block w-full truncate text-left text-sm font-black text-emerald-300">{momId ? byId[momId]?.displayName ?? byId[momId]?.name : 'No rated players'}</button></div><div className="rounded-xl bg-zinc-900 p-3"><small className="text-[9px] uppercase text-zinc-500">Top 3 Ratings</small><div className="mt-1 space-y-0.5 text-xs">{sortedRatings.slice(0, 3).map(row => <p key={row.playerId} className="flex justify-between gap-1"><span className="truncate">{byId[row.playerId]?.displayName ?? byId[row.playerId]?.name}</span><b>{row.raw.toFixed(1)}</b></p>)}{!sortedRatings.length && <p>No ratings</p>}</div></div></section><MatchChangesPanel matchId={match.id} players={players} teams={teams} matches={matches} competitionStates={competitionStates} /><section className="mb-5"><h2 className="mb-2 text-sm font-semibold">Goals, assists & timeline</h2><MatchTimeline events={match.events} players={players} teamId={teamId} match={match} /></section>{(story.tags.length > 0 || story.scoreFlow.length > 1) && <section className="mb-5 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Match Story</h2>{story.scoreFlow.length > 1 && <p className="mt-2 text-sm font-black text-zinc-200">{story.scoreFlow.map(item => `${item.home}-${item.away}`).join(' to ')}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{story.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300">{tag}</span>)}</div>{story.superSubs.slice(0, 2).map(row => <p key={row.playerId} className="mt-2 text-xs text-zinc-300"><b>{byId[row.playerId]?.displayName ?? byId[row.playerId]?.name}</b> entered {row.entryMinute}' - Super Sub - {row.goals}G {row.assists}A</p>)}</section>}</div>}
    {tab === 'lineup' && <div className="mt-4"><h2 className="mb-2 text-sm font-semibold">Starting XI</h2><Pitch slots={slots} players={players} teams={teams} statsByPlayer={Object.fromEntries(starters.map(appearance => [appearance.playerId, { ...statsFor(match.events, appearance.playerId), saves: savesFor(appearance.playerId) }]))} showGoalkeeperSaves motmPlayerId={momId} outMinutesByPlayer={outMinutesByPlayer} presentation="history" onSlotClick={(slot) => { if (slot.playerId) onNavigate({ name: 'player', id: slot.playerId }) }} /><h2 className="mb-2 mt-6 text-sm font-semibold">Bench / Substitutes</h2><div className="grid grid-cols-4 gap-2">{bench.map(appearance => card(appearance.playerId, appearance.position))}</div></div>}
    {tab === 'ratings' && <section className="mt-4 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">All Player Ratings</h2><p className="mt-1 text-[10px] text-zinc-500">Player minutes use official regulation time; stoppage-time events remain in the timeline.</p><div className="mt-3 divide-y divide-white/5">{orderedRatingAppearances.map((appearance, index) => <button type="button" onClick={() => onNavigate({ name: 'player', id: appearance.playerId })} key={appearance.playerId} className="flex min-h-11 w-full items-center gap-2 py-2 text-left text-xs"><span className="w-5 text-zinc-500">{index + 1}</span><span className="min-w-0 flex-1 truncate">{byId[appearance.playerId]?.displayName ?? byId[appearance.playerId]?.name}</span><span className="text-zinc-500">{ratings[appearance.playerId] ? `${ratings[appearance.playerId].minutes}'` : 'Unused'}</span><b className={appearance.playerId === momId ? 'text-blue-300' : 'text-emerald-300'}>{ratings[appearance.playerId]?.raw.toFixed(1) ?? '—'}{appearance.playerId === momId && ratings[appearance.playerId] ? ' ★' : ''}</b></button>)}</div></section>}
    <button type="button" onClick={() => onBackToTeam(teamId)} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-xs font-black text-black">BACK TO TEAM</button>
    <button type="button" onClick={() => onNavigate({ name: 'edit-match', id: match.id })} className="mt-3 w-full rounded-xl bg-zinc-800 py-3 text-xs font-black text-zinc-300">EDIT MATCH</button>
    <button type="button" onClick={() => setDeleteConfirmationStep(1)} className="mt-3 w-full rounded-xl border border-red-500/30 py-2 text-xs font-semibold text-red-400">Delete match</button>
    {deleteError && <p role="alert" className="mt-2 text-xs font-semibold text-amber-300">{deleteError}</p>}
    {deleteConfirmationStep === 1 && (
      <div role="dialog" aria-modal="true" aria-label="Delete Match?" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6">
          <h2 className="text-lg font-bold">Delete Match?</h2>
          <p className="mt-2 text-sm text-zinc-400">This action cannot be undone. Are you sure you want to delete this match?</p>
          <div className="mt-6 flex gap-2">
            <button className="flex-1 rounded-xl bg-zinc-800 p-3 text-sm font-bold" onClick={() => setDeleteConfirmationStep(0)}>Cancel</button>
            <button className="flex-1 rounded-xl bg-red-900 p-3 text-sm font-bold text-red-100" onClick={() => setDeleteConfirmationStep(2)}>Delete</button>
          </div>
        </div>
      </div>
    )}
    {deleteConfirmationStep === 2 && (
      <div role="dialog" aria-modal="true" aria-label="Confirm Deletion" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6">
          <h2 className="text-lg font-bold">For safety, enter 1001 to confirm.</h2>
          <input type="text" placeholder="Enter 1001" value={deleteConfirmationInput} onChange={e => setDeleteConfirmationInput(e.target.value)} className="mt-4 w-full rounded-xl bg-black p-3 text-center text-lg font-black tracking-widest text-white outline-none ring-1 ring-zinc-700 focus:ring-red-500" />
          <div className="mt-6 flex gap-2">
            <button className="flex-1 rounded-xl bg-zinc-800 p-3 text-sm font-bold" onClick={() => { setDeleteConfirmationStep(0); setDeleteConfirmationInput(''); }}>Cancel</button>
            <button disabled={deleteConfirmationInput !== '1001'} className="flex-1 rounded-xl bg-red-900 p-3 text-sm font-bold text-red-100 disabled:opacity-50" onClick={() => { try { deleteMatch(match.id); onReplace({ name: 'home' }) } catch (error) { setDeleteError(error instanceof Error ? error.message : 'This match cannot be deleted safely.'); setDeleteConfirmationStep(0); setDeleteConfirmationInput('') } }}>Delete Match</button>
          </div>
        </div>
      </div>
    )}
  </div>
}
