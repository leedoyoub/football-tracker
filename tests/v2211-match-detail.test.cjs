const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { orderMatchDetailAppearances } = require('../src/engine/matchDetail.ts')

const appearance = playerId => ({ playerId, teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' })

test('Match Detail orders exact raw ratings, deterministic ties, then unused players', () => {
  const appearances = ['unused', 'lower', 'tie-b', 'higher', 'tie-a'].map(appearance)
  const ratings = {
    lower: { playerId: 'lower', raw: 8.41 },
    higher: { playerId: 'higher', raw: 8.44 },
    'tie-a': { playerId: 'tie-a', raw: 8.2 },
    'tie-b': { playerId: 'tie-b', raw: 8.2 },
  }
  assert.deepEqual(orderMatchDetailAppearances(appearances, ratings).map(row => row.playerId), ['higher', 'lower', 'tie-a', 'tie-b', 'unused'])
})

test('historical Starting XI uses Pitch slot clicks and retains the MOM ratings marker', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  assert(source.includes("onSlotClick={(slot) => { if (slot.playerId) onNavigate({ name: 'player', id: slot.playerId }) }}"))
  assert.match(source, /appearance\.playerId === momId/)
})
