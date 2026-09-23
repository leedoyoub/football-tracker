const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { buildMatchChangeIndex } = require('../src/engine/matchChangeIndex.ts')

const teams = ['A', 'B'].map((id, index) => ({ id, name: id, shortName: id, abbreviation: id, visualStyle: 'solid', primaryColor: index ? 'blue' : 'red', jerseyNumberColor: 'white' }))
const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, displayName: id, teamId, position, number: 9 })
const game = (id, day, events, appearances) => ({ id, season: 'Season 1', competitionType: 'league', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances, events })
const appearance = (id, teamId = 'A', position = 'ST') => ({ playerId: id, teamId, position, role: 'starter' })
const changesFor = (players, matches, id) => buildMatchChangeIndex(players, teams, matches, []).get(id) ?? []
const labels = rows => rows.flatMap(row => row.items.map(item => item.label))

test('ordinary 1G, 1A, and 1G1A never create Match Changes', () => {
  const p = player('p')
  const matches = [game('one', 1, [{ id: 'g', type: 'goal', minute: 1, teamId: 'A', playerId: 'p', assistPlayerId: 'p' }], [appearance('p')])]
  assert.deepEqual(changesFor([p], matches, 'one'), [])
})

test('strict personal bests are excluded from milestone-only What Changed', () => {
  const p = player('p')
  const matches = [game('first', 1, [], [appearance('p')]), game('second', 2, [{ id: 'g1', type: 'goal', minute: 1, teamId: 'A', playerId: 'p' }, { id: 'g2', type: 'goal', minute: 2, teamId: 'A', playerId: 'p' }], [appearance('p')])]
  const output = labels(changesFor([p], matches, 'second'))
  assert.equal(output.some(label => /Personal best/i.test(label)), false)
})

test('a player who takes Global and League #1 gets no What Changed ranking event', () => {
  const p = player('p', 'A'); const r = player('r', 'B')
  const matches = [
    game('first', 1, [{ id: 'r', type: 'goal', minute: 1, teamId: 'B', playerId: 'r' }], [appearance('p'), appearance('r', 'B')]),
    game('take', 2, [{ id: 'p1', type: 'goal', minute: 1, teamId: 'A', playerId: 'p' }, { id: 'p2', type: 'goal', minute: 2, teamId: 'A', playerId: 'p' }], [appearance('p'), appearance('r', 'B')]),
  ]
  const output = labels(changesFor([p, r], matches, 'take'))
  assert.equal(output.some(label => /TAKES #1|Top 10|climb|Top 3/i.test(label)), false)
})

test('the Match Changes source does not import or invoke the News derivation', () => {
  const source = fs.readFileSync(require.resolve('../src/engine/matchChangeIndex.ts'), 'utf8')
  assert.equal(source.includes("from './news'"), false)
  assert.equal(source.includes('deriveFootballEvents'), false)
})

test('milestone-only index has no ranking accumulator or prefix ranking rebuild', () => {
  const source = fs.readFileSync(require.resolve('../src/engine/matchChangeIndex.ts'), 'utf8')
  assert.equal(source.includes('compareCoreLeaderboardRows'), false)
  assert.equal(source.includes('globalRanking'), false)
  assert.equal(source.includes('buildGlobalRankingData'), false)
  assert.equal(source.includes('rankGlobalRankingRows'), false)
  assert.equal(source.includes('rows.slice()'), false)
})

test('Match Detail only asks for Match Changes from its opened Facts details panel', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  const baseReadModel = source.slice(source.indexOf('const derived = useMemo'), source.indexOf('if (!match || !derived)'))
  assert.equal(baseReadModel.includes('matchChangesForMatch'), false)
  assert.match(source, /function MatchChangesPanel[\s\S]*onToggle={[\s\S]*setOpen\(event\.currentTarget\.open\)/)
  assert.match(source, /open \? presentMatchChanges\(matchChangesForMatch/)
})
