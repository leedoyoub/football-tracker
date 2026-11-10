import { useState } from 'react'
import type { AppState, CompetitionStage, CompetitionType, Match } from '../types'
import { assignmentSnapshotForMatch, canonicalScheduleOrdinal } from '../engine/competitionContext'
import { championsCompetition } from '../engine/competition'
import { applyMatchMetadata, suggestMatchMetadataAssignment, type MatchMetadataProposal } from '../lib/matchMetadata'

export function MatchMetadataDialog({ match, data, onAccept, onCancel, onEditScore }: {
  match: Match
  data: Pick<AppState, 'matches' | 'teams' | 'players' | 'competitionStates'>
  onAccept: (proposal: MatchMetadataProposal) => void
  onCancel: () => void
  onEditScore: () => void
}) {
  const [proposal, setProposal] = useState<MatchMetadataProposal>(() => ({ assignment: assignmentSnapshotForMatch(match), date: match.date, opponentName: match.opponentName ?? '', homeAway: match.homeAway }))
  const [error, setError] = useState('')
  const assignment = proposal.assignment
  const change = (next: Partial<MatchMetadataProposal>) => { setProposal(current => ({ ...current, ...next })); setError('') }
  function changeContext(type: CompetitionType, season: string) {
    try { change({ assignment: suggestMatchMetadataAssignment(match, type, season, data) }) }
    catch (reason) {
      // Keep the requested context visible so it can be corrected, while its
      // invalid slot remains blocked by the acceptance validator.
      const stage = type === 'league' ? 'regular' : type === 'cup' ? 'stage1' : 'roundOf16'
      change({ assignment: { ...assignment, competitionType: type, season, stage, matchDay: 1, pairingId: undefined, seriesGame: type === 'champions' ? 1 : undefined } })
      setError(reason instanceof Error ? reason.message : 'No safe slot is available.')
    }
  }
  function changeStage(stage: CompetitionStage) {
    const seriesGame = stage === 'finalReplay' ? undefined : assignment.seriesGame ?? 1
    const draw = data.competitionStates?.find(state => state.kind === 'champions-draw' && state.season === assignment.season)
    const champions = assignment.competitionType === 'champions' ? championsCompetition(draw, data.matches.filter(row => row.id !== match.id), assignment.season, data.players) : undefined
    const pairing = champions?.rounds[stage === 'finalReplay' ? 'final' : stage as 'roundOf16' | 'quarterFinal' | 'semiFinal' | 'final']?.find(row => row.teamIds.includes(assignment.teamId))
    change({ assignment: { ...assignment, stage, matchDay: canonicalScheduleOrdinal(assignment.competitionType, stage, assignment.competitionType === 'champions' ? seriesGame : undefined) ?? 0, ...(assignment.competitionType === 'champions' ? { pairingId: pairing?.id, seriesGame } : {}) } })
  }
  function accept() {
    try { applyMatchMetadata(match, proposal, data); onAccept(proposal) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'These match details cannot be changed safely.') }
  }
  const field = 'mt-1 w-full rounded-lg bg-black px-3 py-2 text-sm text-white'
  return <div role="dialog" aria-modal="true" aria-label="Edit match details" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
    <div className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-zinc-900 p-4 text-white">
      <h2 className="text-lg font-black">Edit match details</h2>
      <label className="block text-xs text-zinc-300">Competition<select aria-label="Competition" className={field} value={assignment.competitionType} onChange={event => changeContext(event.target.value as CompetitionType, assignment.season)}>{(['league', 'cup', 'champions'] as const).map(type => <option key={type} value={type}>{type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'}</option>)}</select></label>
      <label className="block text-xs text-zinc-300">Season<input aria-label="Season" className={field} value={assignment.season} onChange={event => changeContext(assignment.competitionType, event.target.value)} /></label>
      {assignment.competitionType === 'league' ? <label className="block text-xs text-zinc-300">Matchday<input aria-label="Matchday" className={field} type="number" min={1} max={30} value={assignment.matchDay} onChange={event => change({ assignment: { ...assignment, matchDay: Number(event.target.value) } })} /></label> : <label className="block text-xs text-zinc-300">Stage<select aria-label="Stage" className={field} value={assignment.stage} onChange={event => changeStage(event.target.value as CompetitionStage)}>{(assignment.competitionType === 'cup' ? ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'final', 'finalReplay'] : ['roundOf16', 'quarterFinal', 'semiFinal', 'final', 'finalReplay']).map(stage => <option key={stage} value={stage}>{stage.replace(/([A-Z])/g, ' $1')}</option>)}</select></label>}
      {assignment.competitionType === 'champions' && assignment.stage !== 'finalReplay' && <>
        <label className="block text-xs text-zinc-300">Series game<input aria-label="Series game" className={field} type="number" min={1} max={assignment.stage === 'final' ? 2 : 3} value={assignment.seriesGame ?? 1} onChange={event => { const seriesGame = Number(event.target.value); change({ assignment: { ...assignment, seriesGame, matchDay: canonicalScheduleOrdinal('champions', assignment.stage, seriesGame) ?? 0 } }) }} /></label>
        <p className="text-xs text-zinc-400">Draw pairing is derived from the recorded team and selected round.</p>
      </>}
      <label className="block text-xs text-zinc-300">Match date<input aria-label="Match date" className={field} type="date" value={proposal.date} onChange={event => change({ date: event.target.value })} /></label>
      <label className="block text-xs text-zinc-300">Opponent display name<input aria-label="Opponent display name" className={field} value={proposal.opponentName ?? ''} onChange={event => change({ opponentName: event.target.value })} /></label>
      <label className="block text-xs text-zinc-300">Home / Away<select aria-label="Home / Away" className={field} value={proposal.homeAway ?? ''} onChange={event => change({ homeAway: event.target.value as 'home' | 'away' || undefined })}><option value="">Unspecified</option><option value="home">Home</option><option value="away">Away</option></select></label>
      <p className="text-xs text-zinc-400">Recorded team and fixture IDs stay fixed to preserve historical ownership. Home / Away changes the display label.</p>
      <button type="button" onClick={onEditScore} className="w-full rounded-lg border border-zinc-600 p-2 text-sm">Edit score through goal events</button>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <button type="button" onClick={accept} className="w-full rounded-lg bg-emerald-500 p-3 font-black text-black">Apply details</button>
      <button type="button" onClick={onCancel} className="w-full p-2 text-sm text-zinc-300">Cancel</button>
    </div>
  </div>
}
