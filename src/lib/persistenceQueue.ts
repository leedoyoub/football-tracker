export function createPersistenceQueue<T, R>(save: (state: T) => Promise<R>) {
  let tail: Promise<void> = Promise.resolve()
  return {
    enqueue(state: T, valid?: () => boolean) {
      const operation = tail.then(() => {
        if (valid && !valid()) throw new Error('Obsolete draft checkpoint')
        return save(state)
      })
      tail = operation.then(() => undefined, () => undefined)
      return operation as Promise<R>
    },
    drain: () => tail,
  }
}
