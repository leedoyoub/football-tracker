const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')
const { performAtomicImport } = require('../src/lib/importTransaction.ts')

const state = id => ({ teams: [{ id: 'A', name: 'A' }], players: [], matches: [{ id, homeTeamId: 'A', awayTeamId: 'B', appearances: [], events: [] }], competitionStates: [] })

test('Store import transaction fences stale queued writes, replaces live state, invalidates derived state, and permits post-import writes', async () => {
  const writes = []; let live = state('old'); let durable = live; let epoch = 0; let backup; let derivedInvalidations = 0
  let releaseBlocker
  const blocker = new Promise(resolve => { releaseBlocker = resolve })
  const transactions = createStoreTransactions(live, async next => { if (next.matches[0].id === 'blocker') await blocker; writes.push(next.matches[0].id); durable = next; return next }, next => { live = next })
  const blocked = transactions.commit(() => state('blocker'))
  const stale = transactions.commit(() => state('stale'), { valid: () => epoch === 0 })
  const imported = performAtomicImport(JSON.stringify(state('imported')), {
    prepare: JSON.parse,
    preserveBackup: () => { backup = durable },
    prior: () => live,
    cancelDraft: () => {},
    invalidateDraft: () => {},
    replaceDurably: (next, fence) => transactions.replaceDurably(() => next, () => { epoch++; fence() }),
    invalidateDerived: () => { derivedInvalidations++ },
    replaceLive: next => { live = next },
  })
  releaseBlocker(); await blocked.persisted; await assert.rejects(() => stale.persisted, /Obsolete/); await imported; await transactions.drain()
  assert.deepEqual([backup.matches[0].id, durable.matches[0].id, live.matches[0].id, derivedInvalidations], ['old', 'imported', 'imported', 1])
  assert.deepEqual(writes, ['blocker', 'imported'])
  await transactions.commit(() => state('post-import')).persisted
  assert.equal(durable.matches[0].id, 'post-import')
})

test('invalid import changes neither live state nor durable state and never takes a backup', async () => {
  const original = state('old'); let live = original; let durable = original; let backedUp = false; let epoch = 0
  await assert.rejects(() => performAtomicImport('{', {
    prepare: JSON.parse,
    preserveBackup: () => { backedUp = true },
    prior: () => live,
    cancelDraft: () => {}, invalidateDraft: () => {},
    replaceDurably: async next => { durable = next }, invalidateDerived: () => {}, replaceLive: next => { live = next },
  }))
  assert.deepEqual([live, durable, backedUp, epoch], [original, original, false, 0])
})
