const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { APP_VERSION } = require('../src/config.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { LOCAL_MODE_PREFERENCE_KEY, loadLocalModePreference, saveLocalModePreference } = require('../src/lib/localMode.ts')
const { leagueCompetition } = require('../src/engine/competition.ts')

test('v2.2.4 retains the durable football namespace and isolates local-mode preference', () => {
  const repository = fs.readFileSync(require.resolve('../src/lib/repository.ts'), 'utf8')
  const auth = fs.readFileSync(require.resolve('../src/lib/auth.tsx'), 'utf8')
  assert.equal(APP_VERSION, '2.2.4'); assert.equal(require('../package.json').version, '2.2.4'); assert.equal(RATING_ENGINE_REVISION, 8)
  assert(repository.includes("STORAGE_KEY = 'football-tracker-v1'"))
  assert(repository.includes('BACKUP_KEY') && repository.includes('EMERGENCY_PREFIX'))
  assert(!repository.includes('APP_VERSION'))
  assert(auth.includes('saveLocalModePreference()'))
  assert.notEqual(LOCAL_MODE_PREFERENCE_KEY, 'football-tracker-v1')
})

test('local mode preference survives a new app instance without modifying football data', () => {
  const oldWindow = global.window; const values = new Map([['football-tracker-v1', '{"matches":[{"id":"m"}]}']])
  global.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
  try { assert.equal(loadLocalModePreference(), false); saveLocalModePreference(); assert.equal(loadLocalModePreference(), true); assert.equal(values.get('football-tracker-v1'), '{"matches":[{"id":"m"}]}') } finally { global.window = oldWindow }
})

test('league progress uses the least-played team and never advances to MD31', () => {
  const teams = Array.from({ length: 4 }, (_, index) => ({ id: String(index), name: String(index), shortName: String(index) }))
  const matches = [...Array.from({ length: 3 }, (_, index) => ({ id: `a${index}`, season: 'S', matchDay: index + 1, homeTeamId: '0', awayTeamId: '1', duration: 90, appearances: [], events: [] })), ...Array.from({ length: 2 }, (_, index) => ({ id: `b${index}`, season: 'S', matchDay: index + 1, homeTeamId: '2', awayTeamId: '3', duration: 90, appearances: [], events: [] }))]
  assert.equal(leagueCompetition(teams, matches, 'S').matchdayProgress, 3)
})
