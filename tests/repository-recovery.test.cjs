const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const memoryStorage = entries => ({ getItem: key => entries[key] ?? null, setItem: (key, value) => { entries[key] = value }, removeItem: key => { delete entries[key] } })
const validState = { teams: [{ id: 'a', name: 'Alpha' }], players: [], matches: [{ id: 'saved-match', appearances: [], events: [] }], competitionStates: [] }

test('valid local Match history hydrates even when IndexedDB cannot mirror it', async () => {
  const previousStorage = global.localStorage
  const previousIndexedDB = global.indexedDB
  global.localStorage = memoryStorage({ 'football-tracker-v1': JSON.stringify(validState) })
  delete global.indexedDB
  const { LocalRepository } = require('../src/lib/repository.ts')
  try {
    const restored = await LocalRepository.getAppState()
    assert.equal(restored.matches[0].id, 'saved-match')
  } finally {
    global.localStorage = previousStorage
    global.indexedDB = previousIndexedDB
  }
})

test('legacy aliases are recovery-only and APP_VERSION never becomes a Match storage key', () => {
  const source = fs.readFileSync(require.resolve('../src/lib/repository.ts'), 'utf8')
  for (const key of ['football-tracker-data', 'football-tracker', 'football-tracker-v2']) assert(source.includes(key), key)
  assert(source.includes("STORAGE_KEY = 'football-tracker-v1'"))
  assert(!source.includes('APP_VERSION'))
})
