const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

test('Rank Trend displays its canonical rank for one actual appearance', () => {
  const player = { id: 'p', name: 'P', teamId: 'A', position: 'ST', number: 9 }
  const match = { id: 'only', season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }], events: [] }
  const storePath = require.resolve('../src/store.tsx')
  const priorStore = require.cache[storePath]
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => ({}) } }
  try {
    const { RankTrend } = require('../src/screens/PlayerDetailScreen.tsx')
    const html = renderToStaticMarkup(React.createElement(RankTrend, { playerId: 'p', players: [player], matches: [match], season: 'S1', competition: 'league' }))
    assert.match(html, /aria-label="Rank Trend horizontal plot"/)
    assert.match(html, />#1<\/text>/)
  } finally {
    if (priorStore) require.cache[storePath] = priorStore
    else delete require.cache[storePath]
    delete require.cache[require.resolve('../src/screens/PlayerDetailScreen.tsx')]
  }
})
