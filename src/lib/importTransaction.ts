import type { AppState } from '../types'

type AtomicImportDependencies = {
  prepare: (json: string) => AppState
  preserveBackup: () => void
  prior: () => AppState
  cancelDraft: () => void
  invalidateDraft: () => void
  replaceDurably: (next: AppState, fence: () => void) => Promise<unknown>
  invalidateDerived: () => void
  replaceLive: (next: AppState) => void
  sync?: (prior: AppState, next: AppState) => void
}

/**
 * The Store's import boundary. Parsing happens before any mutation; successful
 * imports fence older queue entries, become durable, then replace live state.
 */
export async function performAtomicImport(json: string, dependencies: AtomicImportDependencies): Promise<AppState> {
  const next = dependencies.prepare(json)
  const prior = dependencies.prior()
  dependencies.preserveBackup()
  dependencies.cancelDraft()
  await dependencies.replaceDurably(next, dependencies.invalidateDraft)
  dependencies.invalidateDerived()
  dependencies.replaceLive(next)
  dependencies.sync?.(prior, next)
  return next
}
