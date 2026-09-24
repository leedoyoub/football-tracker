const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { STATIC_TEAMS, currentStaticTeams } = require('../src/data/teams.ts')
const { APP_VERSION } = require('../src/config.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { STORAGE_KEY } = require('../src/lib/repository.ts')

const expectedIds = ['real-madrid', 'barcelona', 'atletico-madrid', 'inter-miami', 'arsenal', 'manchester-city', 'manchester-united', 'liverpool', 'chelsea', 'tottenham-hotspur', 'bayern-munich', 'borussia-dortmund', 'ac-milan', 'inter-milan', 'juventus', 'paris-saint-germain']

test('v2.3.3 exposes exactly the approved catalog order and retains catalog identities', () => {
  assert.deepEqual(STATIC_TEAMS.map(team => team.id), expectedIds)
  const interMiami = STATIC_TEAMS[3]
  assert.deepEqual([interMiami.id, interMiami.externalTeamId, interMiami.name, interMiami.abbreviation], ['inter-miami', 9568, 'Inter Miami CF', 'MIA'])
  const saved = { ...STATIC_TEAMS[0], name: 'Saved Real Madrid', customFlag: true }
  assert.strictEqual(currentStaticTeams([saved])[0], saved)
})

test('v2.3.4 aligns version sources without changing rating revision or storage key', () => {
  assert.equal(APP_VERSION, '2.3.4')
  assert.equal(require('../package.json').version, '2.3.4')
  assert.equal(RATING_ENGINE_REVISION, 10)
  assert.equal(STORAGE_KEY, 'football-tracker-v1')
})
