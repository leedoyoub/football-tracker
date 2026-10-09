const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  filename,
)

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('commit evaluates its reducer once and publishes a value', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const published = []
  const saved = []
  let reducerCalls = 0
  const transactions = createStoreTransactions(2, async value => { saved.push(value); return value }, value => published.push(value))

  const result = transactions.commit(current => { reducerCalls++; return current + 3 })

  assert.equal(reducerCalls, 1)
  assert.deepEqual(transactions.read(), { revision: 1, snapshot: 5 })
  assert.deepEqual(published, [5])
  await result.persisted
  assert.deepEqual(saved, [5])
})

test('rapid commits compose from the latest snapshot and persist in order', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const firstWrite = deferred()
  const started = deferred()
  const saved = []
  const transactions = createStoreTransactions(0, async value => {
    saved.push(value)
    if (value === 1) { started.resolve(); await firstWrite.promise }
    return value
  }, () => {})

  const first = transactions.commit(value => value + 1)
  await started.promise
  const second = transactions.commit(value => value + 1)
  assert.equal(second.snapshot, 2)
  firstWrite.resolve()
  await Promise.all([first.persisted, second.persisted])
  assert.deepEqual(saved, [1, 2])
  assert.deepEqual(transactions.read(), { revision: 2, snapshot: 2 })
})

test('a player update during a delayed match save survives a fresh restart', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const firstWrite = deferred()
  const started = deferred()
  let disk = { matches: [], players: [] }
  const transactions = createStoreTransactions(disk, async value => {
    if (value.matches.length === 1 && value.players.length === 0) { started.resolve(); await firstWrite.promise }
    disk = structuredClone(value)
    return value
  }, () => {})
  const matchSave = transactions.commit(current => ({ ...current, matches: [{ id: 'M1' }] }))
  await started.promise
  const playerUpdate = transactions.commit(current => ({ ...current, players: [{ id: 'P1' }] }))
  firstWrite.resolve()
  await Promise.all([matchSave.persisted, playerUpdate.persisted])
  const restarted = createStoreTransactions(structuredClone(disk), async value => value, () => {})
  assert.deepEqual(restarted.read().snapshot, { matches: [{ id: 'M1' }], players: [{ id: 'P1' }] })
})

test('a failed latest snapshot remains available for retry and later writes recover', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const attempts = []
  let fail = true
  const transactions = createStoreTransactions(0, async value => {
    attempts.push(value)
    if (fail) { fail = false; throw new Error('quota') }
    return value
  }, () => {})

  const failed = transactions.commit(() => 7)
  await assert.rejects(failed.persisted, /quota/)
  assert.deepEqual(transactions.read(), { revision: 1, snapshot: 7 })
  assert.equal(await transactions.retryLatest(), 7)
  const later = transactions.commit(value => value + 1)
  await later.persisted
  assert.deepEqual(attempts, [7, 7, 8])
})

test('a newer commit repairs a previously failed durable snapshot with its full state', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const saved = []
  let failOnce = true
  const transactions = createStoreTransactions({ matches: [], players: [] }, async value => {
    if (failOnce) { failOnce = false; throw new Error('temporary storage failure') }
    saved.push(structuredClone(value))
    return value
  }, () => {})
  const first = transactions.commit(current => ({ ...current, matches: [{ id: 'M1' }] }))
  await assert.rejects(first.persisted, /temporary storage failure/)
  const second = transactions.commit(current => ({ ...current, players: [{ id: 'P1' }] }))
  await second.persisted
  assert.deepEqual(saved, [{ matches: [{ id: 'M1' }], players: [{ id: 'P1' }] }])
})

test('durable replacement fences old queued work and publishes only after save', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const inFlight = deferred()
  const started = deferred()
  const events = []
  const transactions = createStoreTransactions(0, async value => {
    events.push(`save:${value}`)
    if (value === 1) { started.resolve(); await inFlight.promise }
    return value
  }, value => events.push(`publish:${value}`))

  const earlier = transactions.commit(value => value + 1)
  await started.promise
  let fenced = 0
  const importing = transactions.replaceDurably(() => 40, () => { fenced++ })
  const afterImport = transactions.commit(value => value + 2)
  assert.equal(fenced, 1)
  assert.equal(transactions.read().snapshot, 1)
  assert.equal(events.includes('publish:40'), false)
  inFlight.resolve()
  await Promise.all([earlier.persisted, importing, afterImport.persisted])
  assert.deepEqual(events, ['publish:1', 'save:1', 'save:40', 'publish:40', 'publish:42', 'save:42'])
  assert.deepEqual(transactions.read(), { revision: 3, snapshot: 42 })
})

test('failed durable replacement does not publish and replays buffered commits on prior state', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const published = []
  const saved = []
  let failImport = true
  const transactions = createStoreTransactions(3, async value => {
    saved.push(value)
    if (value === 100 && failImport) { failImport = false; throw new Error('primary write failed') }
    return value
  }, value => published.push(value))

  const importing = transactions.replaceDurably(() => 100, () => {})
  const update = transactions.commit(value => value + 4)
  await assert.rejects(importing, /primary write failed/)
  await update.persisted
  assert.deepEqual(published, [7])
  assert.deepEqual(saved, [100, 7])
  assert.deepEqual(transactions.read(), { revision: 1, snapshot: 7 })
})

test('a reducer stays single execution under repeated React StrictMode renders', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  let reducerCalls = 0
  let renderCalls = 0
  const transactions = createStoreTransactions(0, async value => value, value => { renderCalls++; void value })
  const result = transactions.commit(value => { reducerCalls++; return value + 1 })
  await result.persisted
  renderCalls += 2 // React may render a published snapshot more than once.
  assert.equal(reducerCalls, 1)
  assert.equal(transactions.read().snapshot, 1)
  assert.equal(renderCalls, 3)
})

test('a draft queued during import is discarded after its generation is fenced', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const saved = []
  const transactions = createStoreTransactions({ value: 1, draft: 'old' }, async value => { saved.push(value); return value }, () => {})
  let generation = 0
  const importing = transactions.replaceDurably(() => ({ value: 10 }), () => { generation++ })
  const oldGeneration = generation - 1
  const draft = transactions.commit(current => ({ ...current, draft: 'stale' }), { valid: () => oldGeneration === generation })
  await importing
  await draft.persisted
  assert.deepEqual(transactions.read().snapshot, { value: 10 })
  assert.deepEqual(saved, [{ value: 10 }])
})

test('a newly created coordinator hydrates the last durable snapshot after restart', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  let disk = { matches: [] }
  const firstRun = createStoreTransactions(disk, async value => { disk = structuredClone(value); return value }, () => {})
  await firstRun.commit(current => ({ ...current, matches: [{ id: 'M1' }] })).persisted
  const restarted = createStoreTransactions(structuredClone(disk), async value => value, () => {})
  assert.deepEqual(restarted.read().snapshot, { matches: [{ id: 'M1' }] })
})

test('a delayed Draft flush saves the latest unrelated state with the Draft', async () => {
  const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
  const saved = []
  const transactions = createStoreTransactions({ players: [], draft: null }, async value => { saved.push(structuredClone(value)); return value }, () => {})
  transactions.commit(current => ({ ...current, draft: { id: 'D1', minute: 30 } }), { persist: false })
  transactions.commit(current => ({ ...current, players: [{ id: 'P1' }] }), { persist: false })
  await transactions.persistCurrent()
  assert.deepEqual(saved, [{ players: [{ id: 'P1' }], draft: { id: 'D1', minute: 30 } }])
})
