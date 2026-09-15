const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Pitch } = require('../src/components/Pitch.tsx')
const { normalizeMatchPosition, normalizePositionFamily, matchPositionSegments } = require('../src/engine/timeline.ts')
const { getMatchManOfTheMatch, momPositionPriority, ratePlayerMatch } = require('../src/engine/rating.ts')
const { buildGlobalRankingData, unifiedBestEleven } = require('../src/engine/stats.ts')

const player = (id, position = 'CAM') => ({ id, name: id, displayName: id, teamId: 'A', position, number: 1 })
const app = (player, matchPosition = player.position) => ({ playerId: player.id, teamId: 'A', position: player.position, matchPosition, role: 'starter' })
const match = (id, players, slots) => ({ id, season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances: players.map((item, index) => app(item, slots[index])), events: [] })

test('history Pitch preserves LAM/CAM/RAM labels and uses only history-mode offsets', () => {
  const players = [player('lam'), player('cam'), player('ram'), player('gk', 'GK')]
  const slots = [
    { slot: 'LCAM', position: 'CAM', matchPosition: 'CAM', playerId: 'lam', avgRating: 6.5, matches: 1, x: 30, y: 36 },
    { slot: 'CAM', position: 'CAM', matchPosition: 'CAM', playerId: 'cam', avgRating: 6.5, matches: 1, x: 50, y: 36 },
    { slot: 'RCAM', position: 'CAM', matchPosition: 'CAM', playerId: 'ram', avgRating: 6.5, matches: 1, x: 70, y: 36 },
    { slot: 'GK', position: 'GK', matchPosition: 'GK', playerId: 'gk', avgRating: 6.5, matches: 1, x: 50, y: 88 },
  ]
  const history = renderToStaticMarkup(React.createElement(Pitch, { slots, players, presentation: 'history' }))
  const editable = renderToStaticMarkup(React.createElement(Pitch, { slots, players }))
  for (const label of ['LAM', 'CAM', 'RAM']) assert.match(history, new RegExp(`>${label}<`))
  assert.match(history, /left:33%;top:36%/); assert.match(history, /left:50%;top:33%/); assert.match(history, /left:67%;top:36%/); assert.match(history, /left:50%;top:91%/)
  assert.match(editable, /left:30%;top:36%/); assert.match(editable, /left:50%;top:36%/); assert.match(editable, /left:70%;top:36%/); assert.match(editable, /left:50%;top:88%/)
})

test('LAM/RAM and legacy LCAM/RCAM normalize into the single CAM family', () => {
  for (const value of ['LAM', 'CAM', 'RAM', 'LCAM', 'RCAM']) {
    assert.equal(normalizePositionFamily(value), 'CAM')
    assert.equal(normalizeMatchPosition(value), 'CAM')
    assert.equal(momPositionPriority(value), momPositionPriority('CAM'))
  }
  assert.equal(normalizePositionFamily('LCB'), 'CB')
  assert.equal(normalizePositionFamily('RDM'), 'CDM')
  assert.equal(normalizePositionFamily('RCM'), 'CM')
})

test('CAM tactical aliases use identical ratings, MOM family priority, ranking filter, and Best XI eligibility', () => {
  const players = [player('lam'), player('cam'), player('ram')]
  const matches = ['lam-match', 'cam-match', 'ram-match'].map(id => match(id, players, ['LAM', 'CAM', 'RAM']))
  const ratings = players.map(item => ratePlayerMatch(matches[0], item))
  assert.deepEqual(ratings.map(row => row.position), ['CAM', 'CAM', 'CAM'])
  assert.deepEqual(ratings.map(row => row.raw), [6.5, 6.5, 6.5])
  assert.deepEqual(matchPositionSegments(matches[0], matches[0].appearances[0]).map(row => row.position), ['CAM'])

  const tied = match('mom-tie', players.slice(0, 2), ['LAM', 'CAM'])
  assert.equal(getMatchManOfTheMatch(tied, players.slice(0, 2)), getMatchManOfTheMatch(tied, [...players.slice(0, 2)].reverse()))

  const ranking = buildGlobalRankingData(players, matches, { seasons: ['S1'], teams: [], positions: ['CAM'] }, 'rating')
  assert.deepEqual(ranking.map(row => row.playerId).sort(), ['cam', 'lam', 'ram'])
  const best = unifiedBestEleven(players, matches, 'S1')
  assert.equal(best.slots.filter(slot => slot.playerId).length, 3)
})

test('historical Match Detail forwards tactical display labels into the shared history Pitch', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  assert(source.includes('displayPosition: slot.displayPosition'))
  assert(source.includes('presentation="history"'))
})
