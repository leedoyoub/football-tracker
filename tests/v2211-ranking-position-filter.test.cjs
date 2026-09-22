const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { buildGlobalRankingData } = require('../src/engine/stats.ts')

test('ranking position filter applies to the historical eligible pool before ranking', () => {
  const player = { id: 'p1', teamId: 'A', name: 'Moved Player', position: 'ST', number: 10 }
  const match = {
    id: 'm1', season: 'Season 1', matchDay: 1, date: '2025-01-01', duration: 90,
    homeTeamId: 'A', awayTeamId: 'B', events: [],
    appearances: [{ playerId: 'p1', teamId: 'A', position: 'CAM', matchPosition: 'LAM', role: 'starter' }],
  }

  const rows = buildGlobalRankingData(
    [player],
    [match],
    { seasons: ['Season 1'], teams: [], positions: ['CAM'] },
    'rating',
  )

  assert.deepEqual(rows.map(row => row.playerId), ['p1'])
})
