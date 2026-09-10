const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { combinationStats, sortCombinationsByOnPitch } = require('../src/engine/analytics.ts')
const { auditDataIntegrity } = require('../src/engine/integrity.ts')
const { matchStory } = require('../src/engine/matchStory.ts')
const { substituteImpact } = require('../src/engine/substituteImpact.ts')

const player = (id, position = 'ST') => ({ id, name: id, displayName: id, fullName: id, position, number: 1, teamId: 'A' })
const sub = player('sub')
const scorer = player('scorer')
const baseMatch = (id, events, appearances, overrides = {}) => ({ id, season: 'S1', matchDay: 1, date: '2026-02-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', events, appearances, ...overrides })

test('substitute impact uses event ordering for score at entry and on-pitch production', () => {
  const match = baseMatch('sub-impact', [
    { id: 'away-20', type: 'goal', minute: 20, sequence: 1, teamId: 'B' },
    { id: 'away-60-before', type: 'goal', minute: 60, sequence: 1, teamId: 'B' },
    { id: 'sub-on', type: 'sub', minute: 60, sequence: 2, teamId: 'A', playerOutId: 'replaced', playerInId: 'sub', position: 'ST' },
    { id: 'sub-goal', type: 'goal', minute: 70, sequence: 3, teamId: 'A', playerId: 'sub' },
    { id: 'sub-assist', type: 'goal', minute: 75, sequence: 4, teamId: 'A', playerId: 'scorer', assistPlayerId: 'sub' },
    { id: 'away-80', type: 'goal', minute: 80, sequence: 5, teamId: 'B' },
  ], [
    { playerId: 'replaced', teamId: 'A', role: 'starter', position: 'ST' },
    { playerId: 'scorer', teamId: 'A', role: 'starter', position: 'ST' },
    { playerId: 'sub', teamId: 'A', role: 'bench', position: 'ST' },
  ])
  const impact = substituteImpact(sub, [match])
  assert.equal(impact.appearances.length, 1)
  assert.deepEqual(impact.appearances[0].scoreAtEntry, { home: 0, away: 2 })
  assert.deepEqual([impact.appearances[0].minutes, impact.appearances[0].goalsFor, impact.appearances[0].goalsAgainst, impact.appearances[0].goals, impact.appearances[0].assists], [30, 2, 1, 1, 1])
  assert.equal(impact.summary.gaPer90, 6)
  assert.equal(impact.summary.gdPer90, 3)
})

test('combination on-pitch rates use only shared positional overlap and sort deterministically', () => {
  const left = player('left', 'CB')
  const right = player('right', 'CB')
  const match = baseMatch('combination-impact', [
    { id: 'for-overlap', type: 'goal', minute: 20, teamId: 'A' },
    { id: 'against-overlap', type: 'goal', minute: 50, teamId: 'B' },
    { id: 'after-overlap', type: 'goal', minute: 70, teamId: 'A' },
  ], [
    { playerId: 'left', teamId: 'A', role: 'starter', position: 'CB' },
    { playerId: 'right', teamId: 'A', role: 'starter', position: 'CB', positionHistory: [{ minute: 60, position: 'CDM' }] },
  ])
  const rows = combinationStats([left, right], [match], { season: 'S1', teamId: 'A' }, 'cb')
  const row = rows[0]
  assert.deepEqual([row.togetherMinutes, row.onPitchGoalsFor, row.onPitchGoalsAgainst, row.onPitchGoalDifference], [60, 1, 1, 0])
  assert.equal(row.onPitchGoalsForPer90, 1.5)
  assert.equal(row.onPitchGoalsAgainstPer90, 1.5)
  assert.equal(sortCombinationsByOnPitch(rows, 'onPitchGF90')[0].key, row.key)
})

test('match story identifies comeback and late-winner evidence from the recorded score flow', () => {
  const match = baseMatch('story', [
    { id: 'behind', type: 'goal', minute: 10, teamId: 'B' },
    { id: 'level', type: 'goal', minute: 60, teamId: 'A', playerId: 'scorer' },
    { id: 'winner', type: 'goal', minute: 89, teamId: 'A', playerId: 'scorer' },
  ], [{ playerId: 'scorer', teamId: 'A', role: 'starter', position: 'ST' }])
  const story = matchStory(match, [scorer])
  assert.deepEqual(story.scoreFlow.map(row => [row.minute, row.home, row.away]), [[10, 0, 1], [60, 1, 1], [89, 2, 1]])
  assert(story.tags.includes('Comeback Win'))
  assert(story.tags.includes('Late Winner'))
})

test('data integrity audit is non-mutating and reports invalid event references', () => {
  const match = baseMatch('audit', [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'scorer' }], [{ playerId: 'scorer', teamId: 'A', role: 'starter', position: 'ST' }])
  const teams = [{ id: 'A' }, { id: 'B' }]
  const before = JSON.stringify(match)
  assert.equal(auditDataIntegrity([match], [scorer], teams).issues.length, 0)
  assert.equal(JSON.stringify(match), before)
  const invalid = { ...match, events: [...match.events, { id: 'goal', type: 'goal', minute: 40, teamId: 'A', playerId: 'unknown' }] }
  const report = auditDataIntegrity([invalid], [scorer], teams)
  assert(report.errors >= 2)
  assert(report.issues.some(issue => issue.message.includes('Duplicate stable event ID')))
  assert(report.issues.some(issue => issue.message.includes('unknown player')))
})

test('v2.1 feature surfaces are exposed in the intended focused screens', () => {
  const detail = fs.readFileSync(require.resolve('../src/screens/PlayerDetailScreen.tsx'), 'utf8')
  const chemistry = fs.readFileSync(require.resolve('../src/screens/ChemistryScreen.tsx'), 'utf8')
  const match = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  const records = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  assert(detail.includes('Substitute Impact'))
  assert(chemistry.includes('On-pitch') && chemistry.includes('sortCombinationsByOnPitch'))
  assert(match.includes('Match Story'))
  assert(records.includes('Data Integrity') && records.includes('Read-only diagnostics'))
})
