import type { AppState, CompetitionType, Match } from '../types'
import { assignmentSnapshotForMatch, type CompetitionIdentity } from '../engine/competitionContext'

export type DraftContext = { teamId: string; season: string; competitionType: CompetitionType }
export type EditorLifecycleMode = 'fresh' | 'resume' | 'edit'

/** A checkpoint only becomes an editor source after the user explicitly resumes it. */
export function editorLifecycleMode(input: { editingMatch?: Match; draft?: Match; resumeRequested?: boolean }): EditorLifecycleMode {
  if (input.editingMatch) return 'edit'
  return input.draft && input.resumeRequested ? 'resume' : 'fresh'
}

/** A mounted fresh editor owns the checkpoint it creates during autosave. */
export function isFreshCheckpointForSession(draft: Match | undefined, freshSessionDraftId: string | undefined): boolean {
  return Boolean(draft && freshSessionDraftId && draft.id === freshSessionDraftId)
}

/** Fresh mode deliberately ignores every field in a prior autosave checkpoint. */
export function activeEditorIdentity(mode: EditorLifecycleMode, source: Match | undefined, proposal: CompetitionIdentity): CompetitionIdentity {
  return mode === 'fresh' || !source ? proposal : assignmentSnapshotForMatch(source)
}

/** A draft can only resume while its ID is not already a durable match. */
export function isResumableDraft(state: Pick<AppState, 'matches' | 'draftMatch'>): boolean {
  const draft = state.draftMatch
  return Boolean(draft?.id) && !state.matches.some(match => match.id === draft!.id)
}

/** The route identity for a draft always comes from its accepted/frozen match fields. */
export function draftContext(draft: Match | undefined): DraftContext | undefined {
  if (!draft) return undefined
  const identity = assignmentSnapshotForMatch(draft)
  const teamId = identity.teamId
  const competitionType = identity.competitionType
  const season = identity.season
  return teamId && season ? { teamId, season, competitionType } : undefined
}

/**
 * Remove only an impossible draft. This deliberately never alters durable
 * matches: a stale draft is recoverable UI state, not match history.
 */
export function sanitizeDraftLifecycle<T extends AppState>(state: T): T {
  return isResumableDraft(state) ? state : state.draftMatch ? { ...state, draftMatch: undefined } : state
}

export function draftMatchesContext(draft: Match | undefined, requested: DraftContext): boolean {
  const context = draftContext(draft)
  return !!context && context.teamId === requested.teamId && context.season === requested.season && context.competitionType === requested.competitionType
}
