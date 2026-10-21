require('./helpers/register-ts.cjs')
const fs = require('node:fs'), assert = require('node:assert/strict')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { teamHistoryRecords, teamHistoryBestXI, teamHistoryHonors } = require('../src/engine/teamHistory.ts')
const { scopedIndividualAwardEvents, teamIndividualAwardRecordGroups } = require('../src/engine/teamAwardRecords.ts')
const s = performanceFixture(1), scope = { teamId: s.teams[0].id, season: 'Season 1', competition: 'all' }
const measure = fn => { const start = performance.now(), value = fn(); return { value, ms: performance.now() - start } }
const records = measure(() => teamHistoryRecords(s.players, s.matches, scope))
const xi = measure(() => teamHistoryBestXI(s.players, s.matches, scope))
const honors = measure(() => teamHistoryHonors(s.teams, s.players, s.matches, s.competitionStates, scope.teamId, 'all'))
const events = scopedIndividualAwardEvents(s.teams, s.players, s.matches, s.competitionStates, { seasons: [], teamIds: [], competition: 'all' })
const rankings = measure(() => teamIndividualAwardRecordGroups(events, s.teams))
const warm = measure(() => { for (let i = 0; i < 100; i++) {
  assert.strictEqual(teamHistoryRecords(s.players, s.matches, scope), records.value)
  assert.strictEqual(teamHistoryBestXI(s.players, s.matches, scope), xi.value)
  assert.strictEqual(teamHistoryHonors(s.teams, s.players, s.matches, s.competitionStates, scope.teamId, 'all'), honors.value)
} })
const report = { version: '2.6.1', fixture: { matches: s.matches.length, players: s.players.length, teams: s.teams.length }, coldMs: { records: records.ms, bestXI: xi.ms, honors: honors.ms, teamAwardRankings: rankings.ms }, warm100RecordsXIHonorsMs: warm.ms, eventCount: events.length, note: 'Synthetic local Node benchmark; immutable cached results asserted identical. Not a mobile browser frame-time measurement.' }
fs.mkdirSync('docs/performance', { recursive: true })
fs.writeFileSync('docs/performance/v2.6.1.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
