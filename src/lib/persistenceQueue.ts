export function createPersistenceQueue<T, R>(save: (state: T) => Promise<R>) {
  let tail: Promise<void> = Promise.resolve()
  let running = false
  const waiting: Array<() => void> = []
  const enqueueLatest = (read: () => T, valid?: () => boolean, onSaved?: (state: T, result: R) => void, immediate = true) => {
    let resolve!: (result: R) => void
    let reject!: (error: unknown) => void
    const operation = new Promise<R>((yes, no) => { resolve = yes; reject = no })
    const finish = () => {
      const next = waiting.shift()
      if (next) next()
      else running = false
    }
    const run = () => {
      running = true
      try {
        if (valid && !valid()) throw new Error('Obsolete draft checkpoint')
        const state = read()
        // Start an idle primary write in the mutation's own event turn. In
        // particular, navigation/app termination cannot precede localStorage.
        Promise.resolve(save(state)).then(result => {
          try { onSaved?.(state, result); resolve(result) } catch (error) { reject(error) }
          finish()
        }, error => { reject(error); finish() })
      } catch (error) { reject(error); finish() }
    }
    tail = operation.then(() => undefined, () => undefined)
    if (running) waiting.push(run)
    else { running = true; if (immediate) run(); else void Promise.resolve().then(run) }
    return operation
  }
  return {
    enqueue: (state: T, valid?: () => boolean, onSaved?: (state: T, result: R) => void) => enqueueLatest(() => state, valid, onSaved, false),
    enqueueLatest,
    drain: () => tail,
  }
}
