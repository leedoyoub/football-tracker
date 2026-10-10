const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { createPersistenceQueue } = require('../src/lib/persistenceQueue.ts')
const { performAtomicImport } = require('../src/lib/importTransaction.ts')

const state = id => ({ teams: [{ id: 'A', name: 'A' }], players: [], matches: [{ id, homeTeamId: 'A', awayTeamId: 'B', appearances: [], events: [] }], competitionStates: [] })

test('Store import transaction fences stale queued writes, replaces live state, invalidates derived state, and permits post-import writes', async () => {
  const writes = []; let live = state('old'); let durable = live; let epoch = 0; let backup; let derivedInvalidations = 0
  let releaseBlocker
  const blocker = new Promise(resolve => { releaseBlocker = resolve })
  const queue = createPersistenceQueue(async next => { if (next.matches[0].id === 'blocker') await blocker; writes.push(next.matches[0].id); durable = next })
  const blocked = queue.enqueue(state('blocker'))
  const stale = queue.enqueue(state('stale'), () => epoch === 0)
  const imported = performAtomicImport(JSON.stringify(state('imported')), {
    prepare: JSON.parse,
    preserveBackup: () => { backup = durable },
    prior: () => live,
    cancelDraft: () => {},
    invalidateDraft: () => {},
    nextPersistenceEpoch: () => ++epoch,
    currentPersistenceEpoch: () => epoch,
    enqueue: (next, valid) => queue.enqueue(next, valid),
    invalidateDerived: () => { derivedInvalidations++ },
    replaceLive: next => { live = next },
  })
  releaseBlocker(); await blocked; await assert.rejects(() => stale, /Obsolete/); await imported; await queue.drain()
  assert.deepEqual([backup.matches[0].id, durable.matches[0].id, live.matches[0].id, derivedInvalidations], ['old', 'imported', 'imported', 1])
  assert.deepEqual(writes, ['blocker', 'imported'])
  await queue.enqueue(state('post-import'), () => epoch === 1)
  assert.equal(durable.matches[0].id, 'post-import')
})

test('invalid import changes neither live state nor durable state and never takes a backup', async () => {
  const original = state('old'); let live = original; let durable = original; let backedUp = false; let epoch = 0
  await assert.rejects(() => performAtomicImport('{', {
    prepare: JSON.parse,
    preserveBackup: () => { backedUp = true },
    prior: () => live,
    cancelDraft: () => {}, invalidateDraft: () => {}, nextPersistenceEpoch: () => ++epoch, currentPersistenceEpoch: () => epoch,
    enqueue: async next => { durable = next }, invalidateDerived: () => {}, replaceLive: next => { live = next },
  }))
  assert.deepEqual([live, durable, backedUp, epoch], [original, original, false, 0])
})
