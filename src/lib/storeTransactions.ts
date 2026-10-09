export type StoreRead<T> = { revision: number; snapshot: T }
export type StoreCommit<T, R = unknown> = { revision: number; snapshot: T; result?: R; persisted: Promise<unknown> }

type BufferedCommit<T> = {
  reducer: (current: T) => T
  resolve: (commit: StoreCommit<T>) => void
  reject: (error: unknown) => void
  persist: boolean
  valid?: () => boolean
}

/** Owns the authoritative in-memory snapshot and serializes durable writes. */
export function createStoreTransactions<T, R>(
  initial: T,
  save: (snapshot: T) => Promise<R>,
  publish: (snapshot: T) => void,
) {
  let current = initial
  let revision = 0
  let tail: Promise<void> = Promise.resolve()
  let replacement = false
  let buffered: BufferedCommit<T>[] = []

  const enqueue = (snapshot: T, valid?: () => boolean): Promise<R> => {
    const operation = tail.then(() => {
      if (valid && !valid()) throw new Error('Obsolete draft checkpoint')
      return save(snapshot)
    })
    tail = operation.then(() => undefined, () => undefined)
    return operation
  }

  const apply = (reducer: (current: T) => T, persist = true, valid?: () => boolean): StoreCommit<T> => {
    if (valid && !valid()) return { revision, snapshot: current, persisted: Promise.resolve(undefined) }
    const before = current
    const next = reducer(before)
    if (next !== before) {
      current = next
      revision++
      publish(next)
    }
    const persisted = persist && next !== before ? enqueue(next, valid) : Promise.resolve(undefined)
    return { revision, snapshot: current, persisted }
  }

  return {
    read: (): StoreRead<T> => ({ revision, snapshot: current }),
    commit(reducer: (current: T) => T, options?: { persist?: boolean; valid?: () => boolean }): StoreCommit<T> {
      if (!replacement) return apply(reducer, options?.persist !== false, options?.valid)
      let complete!: (value: unknown) => void
      let reject!: (error: unknown) => void
      const persisted = new Promise<unknown>((res, rej) => { complete = res; reject = rej })
      buffered.push({ reducer, resolve: commit => { void commit.persisted.then(complete, reject) }, reject, persist: options?.persist !== false, valid: options?.valid })
      return { revision, snapshot: current, persisted }
    },
    persistCurrent(valid?: () => boolean) {
      return enqueue(current, valid)
    },
    retryLatest() {
      return enqueue(current)
    },
    drain() { return tail },
    isReplacing() { return replacement },
    async replaceDurably(reducer: (current: T) => T, fence: () => void): Promise<R> {
      if (replacement) throw new Error('A durable replacement is already in progress')
      replacement = true
      let imported: T | undefined
      try {
        fence()
        await tail
        imported = reducer(current)
        const result = await enqueue(imported)
        current = imported
        revision++
        publish(imported)
        const pending = buffered
        buffered = []
        replacement = false
        for (const item of pending) {
          try { item.resolve(apply(item.reducer, item.persist, item.valid)) } catch (error) { item.reject(error) }
        }
        return result
      } catch (error) {
        const pending = buffered
        buffered = []
        replacement = false
        for (const item of pending) {
          try { item.resolve(apply(item.reducer, item.persist, item.valid)) } catch (replayError) { item.reject(replayError) }
        }
        throw error
      }
    },
  }
}
