const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { combinationPairPresentation, recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')

const player = (id, position = 'ST') => ({ id, name: id, displayName: id, fullName: id, teamId: 'A', position, number: 9 })
const appearance = (entry) => ({ playerId: entry.id, teamId: 'A', role: 'starter', position: entry.position, matchPosition: entry.position })
const match = (id, events) => ({ id, season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: events.length ? [appearance(assist), appearance(scorer), appearance(other), appearance(cb1), appearance(cb2)] : [], events })
const assist = player('Zulu Assist')
const scorer = player('Alpha Scorer')
const other = player('Bravo Other')
const cb1 = player('CB One', 'CB')
const cb2 = player('CB Two', 'CB')
const players = [assist, scorer, other, cb1, cb2]
const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }

test('all six Records combination leaderboards use their exact shared connector mapping', () => {
  assert.deepEqual(combinationPairPresentation('goal-combinations', ['assist', 'scorer']), { playerIds: ['assist', 'scorer'], connector: '→', directional: true })
  assert.equal(combinationPairPresentation('mutual-goal-combinations', ['a', 'b']).connector, '↔')
  assert.equal(combinationPairPresentation('both-scored', ['a', 'b']).connector, '&')
  assert.equal(combinationPairPresentation('both-ga', ['a', 'b']).connector, '&')
  assert.equal(combinationPairPresentation('duo-ga', ['a', 'b']).connector, '+')
  assert.equal(combinationPairPresentation('cb-suppression', ['a', 'b']).connector, '&')
})

test('Most Goal Combinations preserves assist-to-scorer direction rather than alphabetizing', () => {
  const matches = [
    match('a-to-b', [{ id: 'g1', type: 'goal', minute: 20, teamId: 'A', playerId: scorer.id, assistPlayerId: assist.id }]),
    match('b-to-a', [{ id: 'g2', type: 'goal', minute: 30, teamId: 'A', playerId: assist.id, assistPlayerId: scorer.id }]),
  ]
  const groups = recordsLeaderboardGroups({ category: 'combination', players, teams: [], matches, scope })
  const direct = groups.find(group => group.id === 'goal-combinations').rows
  assert.deepEqual(direct.map(row => row.combinationPair.playerIds), [[assist.id, scorer.id], [scorer.id, assist.id]])
  assert.equal(direct[0].combinationPair.connector, '→')
  assert.notEqual(direct[0].id, direct[1].id)
})

test('preview and View All use the same structured pair renderer with independent player actions', () => {
  const preview = fs.readFileSync('src/screens/RecordsScreen.tsx', 'utf8')
  const full = fs.readFileSync('src/screens/RecordsLeaderboardScreen.tsx', 'utf8')
  const pair = fs.readFileSync('src/components/CombinationPairIdentity.tsx', 'utf8')
  assert.match(preview, /CombinationPairIdentity/)
  assert.match(full, /CombinationPairIdentity/)
  assert.match(pair, /data-combination-connector/)
  assert.match(pair, /PlayerIdentityAction/)
  assert.doesNotMatch(pair, /<button[^>]*>[^]*<button/)
})

test('combination leaderboard values, Top 3 cap, and View All full rows remain structurally intact', () => {
  const preview = fs.readFileSync('src/screens/RecordsScreen.tsx', 'utf8')
  const full = fs.readFileSync('src/screens/RecordsLeaderboardScreen.tsx', 'utf8')
  assert.match(preview, /rows\.slice\(0, 3\)/)
  assert.match(full, /group\.rows\.map/)
  assert.match(full, /#\{row\.rank\}/)
})
