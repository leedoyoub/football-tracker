const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { positionFilterFamilies, scopedPositionFamilyByPlayer, scopedAwardFamilyByPlayer } = require('../src/engine/positionScope.ts')

const player = { id: 'p1', teamId: 'A', name: 'Moved Player', position: 'ST', number: 10 }
const match = {
  id: 'm1', season: 'Season 1', matchDay: 1, date: '2025-01-01', duration: 90,
  homeTeamId: 'A', awayTeamId: 'B', events: [],
  appearances: [{ playerId: 'p1', teamId: 'A', position: 'CAM', matchPosition: 'LAM', role: 'starter', positionHistory: [{ minute: 70, position: 'RB' }] }],
}

test('historical position family comes from credited participation rather than current registration', () => {
  const families = scopedPositionFamilyByPlayer([player], [match], { seasons: ['Season 1'], teams: [] })
  assert.equal(families.get('p1'), 'CAM')
})

test('approved compact filter families normalize tactical aliases', () => {
  assert.deepEqual(positionFilterFamilies('st-ss'), ['ST', 'SS'])
  assert.deepEqual(positionFilterFamilies('cam'), ['CAM'])
  assert.deepEqual(positionFilterFamilies('fb'), ['FB'])
})

test('historical award family preserves the dominant award role without reading current player position', () => {
  const families = scopedAwardFamilyByPlayer([player], [match], { seasons: ['Season 1'], teams: [] })
  assert.equal(families.get('p1'), 'MID')
})
