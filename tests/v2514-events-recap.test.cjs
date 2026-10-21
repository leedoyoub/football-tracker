require('./helpers/register-ts.cjs')
const { test, after } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { baselineSource } = require('./helpers/v2514-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness, sourceModule } = require('./helpers/v259-harness.cjs')
const { assertRecapAwardPolicy } = require('./helpers/v261-award-policy-comparison.cjs')
const b = baselineSource(); after(b.cleanup); const root = path.resolve(__dirname, '..')
test('Match Changes skips the unused catalog instead of reading each player for each match', () => {
  const s = performanceFixture(1); let reads = 0
  const players = s.players.map(p => ({ ...p, get id() { reads++; return p.id } }))
  const current = sourceModule(root, 'engine/matchChangeIndex.ts', { './rating': { getMatchManOfTheMatch: () => undefined } })
  current.buildMatchChangeIndex(players, s.teams, s.matches, [])
  assert(reads < players.length * s.matches.length, `catalog reads ${reads}`)
})
test('all Match Changes IDs, groups and ordering equal v2.5.13 after legacy/duplicate/zero-minute/edit/delete histories', () => {
  const s = performanceFixture(2), old = require(path.join(b.directory, 'src/engine/matchChangeIndex.ts')), current = require('../src/engine/matchChangeIndex.ts')
  s.matches[0].appearances.unshift({ ...s.matches[0].appearances[0], role: 'bench' })
  s.matches[1].appearances.push({ ...s.matches[1].appearances[9], role: 'bench' })
  s.matches[2].events.push({ id: 'zero-sub', type: 'sub', minute: 90, teamId: s.teams[0].id, playerOutId: s.players[9].id, playerInId: s.players[15].id })
  for (const matches of [s.matches, s.matches.slice(1), s.matches.map((m, i) => i === 0 ? { ...m, events: [] } : m)]) assert.deepEqual(current.buildMatchChangeIndex(s.players, s.teams, matches, s.competitionStates), old.buildMatchChangeIndex(s.players, s.teams, matches, s.competitionStates))
})
test('locked Recap renders without calling statistics or XI calculators', () => {
  const s = performanceFixture(1), actual = require('../src/engine/seasonInsights.ts')
  const fail = () => { throw Error('locked Recap performed expensive work') }
  const h = screenHarness(root, 'screens/SeasonRecapScreen.tsx', 'SeasonRecapScreen', s, { '../engine/seasonInsights': { ...actual, seasonRecap: fail, startingXILeaders: fail } })
  assert.doesNotThrow(() => h.render({ season: 'Season 1', onNavigate() {}, onBack() {} }))
})
test('completed Recap shares one Starting XI result and equals baseline awards', () => {
  const s = performanceFixture(1), actual = require('../src/engine/seasonInsights.ts'), old = require(path.join(b.directory, 'src/engine/seasonInsights.ts'))
  s.competitionStates.push({ id: 'complete', kind: 'season-complete', season: 'Season 1' })
  assertRecapAwardPolicy(actual.seasonRecap(s.players, s.matches, 'Season 1', s.competitionStates, s.teams), old.seasonRecap(s.players, s.matches, 'Season 1', s.competitionStates, s.teams), s.players, s.matches, 'Season 1')
  let shared
  const h = screenHarness(root, 'screens/SeasonRecapScreen.tsx', 'SeasonRecapScreen', s, { '../engine/seasonInsights': { ...actual, startingXILeaders: (...args) => shared = actual.startingXILeaders(...args), seasonRecap: (...args) => { assert.equal(args[5], shared); assert(shared); return actual.seasonRecap(...args) } } })
  h.render({ season: 'Season 1', onNavigate() {}, onBack() {} })
})
