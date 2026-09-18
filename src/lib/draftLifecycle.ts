import type { AppState, CompetitionType, Match } from '../types'

export type DraftContext = { teamId: string; season: string; competitionType: CompetitionType }

/** A draft can only resume while its ID is not already a durable match. */
export function isResumableDraft(state: Pick<AppState, 'matches' | 'draftMatch'>): boolean {
  const draft = state.draftMatch
  return Boolean(draft?.id) && !state.matches.some(match => match.id === draft!.id)
}

/** The route identity for a draft always comes from its accepted/frozen match fields. */
export function draftContext(draft: Match | undefined): DraftContext | undefined {
  if (!draft) return undefined
  const teamId = draft.teamId ?? draft.homeTeamId
  const competitionType = draft.competitionAssignment?.competitionType ?? draft.competitionType ?? 'league'
  const season = draft.competitionAssignment?.season ?? draft.season
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
