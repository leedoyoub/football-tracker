import type { Match } from '../types'

/** Assign a durable recording instant exactly once for a newly committed Match. */
export function recordNewMatch(match: Omit<Match, 'id'> & { id: string }, now = Date.now()): Match {
  return { ...match, recordedAt: match.recordedAt ?? now }
}

/**
 * Editing is never a new recording. A legacy record stays legacy and a modern
 * record retains its original instant even when a caller submits another one.
 */
export function preserveRecordedAt(previous: Match, replacement: Match): Match {
  const { recordedAt: _ignored, ...withoutIncomingRecordedAt } = replacement
  return previous.recordedAt === undefined
    ? withoutIncomingRecordedAt
    : { ...withoutIncomingRecordedAt, recordedAt: previous.recordedAt }
}
