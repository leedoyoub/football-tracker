const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename)
const { recentMatches, recentMatchPositions } = require('../src/screens/recentMatches.ts')
const game = (id, props = {}) => ({ id, season: 'S1', matchDay: 1, date: '2026-09-01', homeTeamId: 'A', awayTeamId: 'opponent', duration: 90, appearances: [], events: [], ...props })
const ids = matches => matches.map(match => match.id)

test('multi-team legacy matches follow creation order, independent of date, season and match day; inputs stay intact', () => {
  const matches = [game('A38', { matchDay: 38 }), game('B1', { homeTeamId: 'B', date: '2020-01-01' }), game('A2', { matchDay: 2 })]
  const before = JSON.stringify(matches)
  assert.deepEqual(ids(recentMatches(matches)), ['A2', 'B1', 'A38'])
  assert.equal(JSON.stringify(matches), before)
})

test('timestamps take priority and ties preserve newest creation order', () => {
  const matches = [game('latest', { playedAt: '2026-09-08', createdAt: '2020-01-01' }), game('old', { createdAt: '2026-09-01' }), game('tie1', { timestamp: 1788825600 }), game('tie2', { timestamp: 1788825600000 })]
  assert.deepEqual(ids(recentMatches(matches)), ['tie2', 'tie1', 'latest', 'old'])
  assert.deepEqual(ids(recentMatches([game('one', { playedAt: 'invalid', createdAt: '2026-09-08' }), game('two', { timestamp: '2026-09-01' })])), ['one', 'two'])
})

test('mixed imports keep undated records in stable creation slots', () => {
  assert.deepEqual(ids(recentMatches([game('new-time', { playedAt: '2026-09-08' }), game('legacy'), game('old-time', { playedAt: '2026-09-01' })])), ['new-time', 'legacy', 'old-time'])
})

test('position display uses match position, preserves tactical labels, and never falls back to base position', () => {
  const appearance = { playerId: 'p', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'LCM' }
  assert.equal(recentMatchPositions(game('m'), appearance), 'LCM')
  assert.equal(recentMatchPositions(game('m'), { ...appearance, matchPosition: undefined }), '-')
})

test('position history is chronological, clips to playing time, and resolves same-minute corrections without mutation', () => {
  const appearance = { playerId: 'p', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'CM', positionHistory: [{ minute: 75, position: 'RW' }, { minute: 60, position: 'ST' }, { minute: 60, position: 'CAM' }, { minute: 85, position: 'GK' }] }
  const match = game('m', { events: [{ type: 'sub', teamId: 'A', playerOutId: 'p', playerInId: 'next', minute: 80, position: 'RW' }] })
  const before = JSON.stringify(appearance)
  assert.equal(recentMatchPositions(match, appearance), 'CM → CAM → RW')
  assert.equal(JSON.stringify(appearance), before)
  const bench = { ...appearance, role: 'bench', positionHistory: [{ minute: 70, position: 'CAM' }] }
  match.events.push({ type: 'sub', teamId: 'A', playerOutId: 'first', playerInId: 'p', minute: 60, position: 'CM' })
  assert.equal(recentMatchPositions(match, bench), 'CM → CAM')
})

test('Team Main renders five matches, hides View All at five, and expands all six newest first', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const state = { teams: [{ id: 'A', name: 'A', shortName: 'A' }], players: [], matches: [] }
  const storePath = require.resolve('../src/store.tsx')
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => state } }
  const { TeamDetailScreen } = require('../src/screens/TeamDetailScreen.tsx')
  const render = () => renderToStaticMarkup(React.createElement(TeamDetailScreen, { teamId: 'A', season: 'S1', onNavigate() {}, onBack() {} })).split('Recent matches')[1]
  for (let i = 1; i <= 5; i++) state.matches.push(game(String(i), { matchDay: i }))
  assert.equal((render().match(/MD\d/g) || []).length, 5)
  assert(!render().includes('View All'))
  state.matches.push(game('6', { matchDay: 6 }))
  assert(render().includes('View All'))
  assert.deepEqual(render().match(/MD\d/g), ['MD6', 'MD5', 'MD4', 'MD3', 'MD2'])
  const original = React.useState
  try {
    React.useState = () => [JSON.stringify(['A', 'S1']), () => {}]
    assert.deepEqual(render().match(/MD\d/g), ['MD6', 'MD5', 'MD4', 'MD3', 'MD2', 'MD1'])
    assert(render().includes('Show Less'))
  } finally { React.useState = original }
})

test('Team Detail always renders an Import Squad action and routes the selected team ID', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const state = { teams: [{ id: 'arsenal', name: 'Arsenal', shortName: 'ARS', abbreviation: 'ARS', externalTeamId: 42 }], players: [], matches: [] }
  const storePath = require.resolve('../src/store.tsx')
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => state } }
  delete require.cache[require.resolve('../src/screens/TeamDetailScreen.tsx')]
  const { TeamDetailScreen } = require('../src/screens/TeamDetailScreen.tsx')
  const markup = renderToStaticMarkup(React.createElement(TeamDetailScreen, { teamId: 'arsenal', season: 'S1', onNavigate() {}, onBack() {} }))
  const source = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  assert(markup.includes('Roster management') && markup.includes('Import Squad'))
  assert(source.includes("onNavigate({ name: 'import-squad', teamId })"))
  assert(!source.includes('useAuth'))
})
