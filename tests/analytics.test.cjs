const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const analytics = require('../src/engine/analytics.ts')

const player = (id, position) => ({ id, name: id, displayName: id, fullName: id, position, number: 1, teamId: 'A' })
const A = player('A', 'ST'), B = player('B', 'ST'), C = player('C', 'LW'), D = player('D', 'RW'), M1 = player('M1', 'CM'), M2 = player('M2', 'CAM'), M3 = player('M3', 'CDM'), LB = player('LB', 'LB'), CB1 = player('CB1', 'CB'), CB2 = player('CB2', 'CB'), RB = player('RB', 'RB')
const players = [A, B, C, D, M1, M2, M3, LB, CB1, CB2, RB]
const appearance = (p, role = 'starter', position = p.position) => ({ playerId: p.id, teamId: 'A', role, position: p.position, matchPosition: position })
const match = (id, events = [], appearances = [appearance(A), appearance(C), appearance(D), appearance(M1), appearance(M2), appearance(M3), appearance(LB), appearance(CB1), appearance(CB2), appearance(RB)]) => ({ id, season: 'S1', matchDay: Number(id.replace(/\D/g, '')) || 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances, events })
const goal = (id, minute, props = {}) => ({ id, type: 'goal', minute, teamId: 'A', ...props })
const sub = (id, minute, playerOutId, playerInId, position) => ({ id, type: 'sub', minute, teamId: 'A', playerOutId, playerInId, position })

test('together minutes use intersected on-pitch intervals rather than shared matches', () => {
  const game = match('m1', [sub('Aoff', 60, 'A', 'B', 'ST'), sub('Bon', 70, 'C', 'B', 'ST')], [appearance(A), appearance(B, 'bench'), appearance(C)])
  const duo = analytics.combinationStats(players, [game], { season: 'S1' }, 'duo').find(row => row.playerIds.includes('A') && row.playerIds.includes('B'))
  assert.equal(duo, undefined)
  const overlap = match('m2', [sub('Don', 60, 'A', 'D', 'RW')], [appearance(A), appearance(C), appearance(D, 'bench')])
  const CAndD = analytics.combinationStats(players, [overlap], { season: 'S1' }, 'duo').find(row => row.playerIds.includes('C') && row.playerIds.includes('D'))
  assert.equal(CAndD.togetherMinutes, 30); assert.equal(CAndD.matches, 1)
})

test('duo, goal partnerships, trios, CB pairs and back fours only count shared eligible intervals', () => {
  const games = [1, 2, 3].map(day => match(`m${day}`, [goal(`gf${day}`, 70, { playerId: 'C', assistPlayerId: 'D' }), goal(`ga${day}`, 80, { teamId: 'B' })], [appearance(A), appearance(C), appearance(D), appearance(M1), appearance(M2), appearance(M3), appearance(LB), appearance(CB1), appearance(CB2), appearance(RB)]))
  const duo = analytics.combinationStats(players, games, { season: 'S1', teamId: 'A' }, 'duo').find(row => row.playerIds.join(':') === 'C:D')
  assert.deepEqual([duo.togetherMinutes, duo.matches, duo.goalsFor, duo.goalsAgainst, duo.goalDifference, duo.combinedGoals, duo.combinedAssists, duo.eligible], [270, 3, 3, 3, 0, 3, 3, true])
  const directional = analytics.goalPartnerships(players, games, { season: 'S1' }).find(row => row.assisterId === 'D' && row.scorerId === 'C')
  assert.equal(directional.assistedGoals, 3); assert.equal(directional.eligible, true)
  const attack = analytics.combinationStats(players, games, { season: 'S1' }, 'attack').find(row => row.playerIds.includes('A') && row.playerIds.includes('C') && row.playerIds.includes('D'))
  assert.equal(attack.togetherMinutes, 270)
  const midfield = analytics.combinationStats(players, games, { season: 'S1' }, 'midfield').find(row => row.playerIds.includes('M1') && row.playerIds.includes('M2') && row.playerIds.includes('M3'))
  assert.equal(midfield.togetherMinutes, 270)
  const cb = analytics.combinationStats(players, games, { season: 'S1' }, 'cb').find(row => row.playerIds.includes('CB1') && row.playerIds.includes('CB2'))
  assert.deepEqual([cb.togetherMinutes, cb.goalsAgainst, cb.cleanSheets], [270, 3, 0])
  const backFour = analytics.combinationStats(players, games, { season: 'S1' }, 'backFour').find(row => row.playerIds.includes('LB') && row.playerIds.includes('CB1') && row.playerIds.includes('CB2') && row.playerIds.includes('RB'))
  assert.deepEqual([backFour.togetherMinutes, backFour.matches, backFour.goalsAgainst], [270, 3, 3])
})

test('sample eligibility requires three matches or 180 shared minutes', () => {
  const long = match('long', [], [appearance(A), appearance(C)]); long.duration = 180
  const eligible = analytics.combinationStats(players, [long], { season: 'S1' }, 'duo').find(row => row.playerIds.join(':') === 'A:C')
  assert.equal(eligible.eligible, true)
  const short = match('short', [], [appearance(A), appearance(C)])
  assert.equal(analytics.combinationStats(players, [short], { season: 'S1' }, 'duo').find(row => row.playerIds.join(':') === 'A:C').eligible, false)
})

test('on-pitch plus-minus, position splits and starter/substitute splits respect intervals', () => {
  const first = match('one', [goal('g1', 20, { playerId: 'M1' }), goal('a1', 60, { playerId: 'C', assistPlayerId: 'M1' }), goal('against', 70, { teamId: 'B' })], [appearance(M1, 'starter', 'CM'), appearance(C)])
  first.appearances[0].positionHistory = [{ minute: 45, position: 'CAM' }]
  const second = match('two', [sub('on', 60, 'A', 'M1', 'CM'), goal('subGoal', 70, { playerId: 'M1' })], [appearance(A), appearance(M1, 'bench', 'CM')])
  const plus = analytics.onPitchStats([M1], [first, second], { season: 'S1' })[0]
  assert.deepEqual([plus.minutes, plus.goalsFor, plus.goalsAgainst, plus.plusMinus], [120, 3, 1, 2])
  const positions = analytics.positionSplits(M1, [first], { season: 'S1' })
  assert.deepEqual(positions.map(row => [row.position, row.minutes, row.goals, row.assists]), [['CM', 45, 1, 0], ['CAM', 45, 0, 1]])
  const roles = analytics.starterSubstituteSplits(M1, [first, second], { season: 'S1' })
  assert.deepEqual([roles.starter.apps, roles.starter.minutes, roles.starter.goals, roles.starter.assists], [1, 90, 1, 1])
  assert.deepEqual([roles.substitute.apps, roles.substitute.minutes, roles.substitute.goals, roles.substitute.assists], [1, 30, 1, 0])
})

test('analytics source and UI expose season/team filters, comparison and Player Detail splits', () => {
  const chemistry = fs.readFileSync(require.resolve('../src/screens/ChemistryScreen.tsx'), 'utf8'); const comparison = fs.readFileSync(require.resolve('../src/screens/ComparisonScreen.tsx'), 'utf8'); const detail = fs.readFileSync(require.resolve('../src/screens/PlayerDetailScreen.tsx'), 'utf8')
  assert(chemistry.includes('Chemistry team filter') && chemistry.includes('combinationStats') && chemistry.includes('goalPartnerships'))
  assert(comparison.includes('Comparison team filter') && comparison.includes('On-pitch +/-'))
  assert(detail.includes('Position splits') && detail.includes('Starter / Substitute'))
  const nav = fs.readFileSync(require.resolve('../src/components/BottomNav.tsx'), 'utf8')
  assert(nav.includes("id: 'chemistry'") && nav.includes('grid-cols-4'))
})
