require('./helpers/register-ts.cjs')
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const current = require('../src/engine/seasonAnalytics.ts')
const currentOfficial = require('../src/engine/officialAwards.ts')
const root = path.resolve(__dirname, '..')
const temporaryRoot = path.resolve(os.tmpdir())
const directory = fs.mkdtempSync(path.join(temporaryRoot, 'football-v264-analytics-baseline-'))
const verifyTemporary = () => assert.ok(path.resolve(directory).startsWith(temporaryRoot + path.sep))
verifyTemporary()
after(() => { verifyTemporary(); fs.rmSync(directory, { recursive: true, force: true }) })
execFileSync('tar', ['-xf', '-', '-C', directory], { input: execFileSync('git', ['archive', 'e97d391fc763f5f146cc116e25fb2aad60189fd9', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const baseline = require(path.join(directory, 'src/engine/seasonAnalytics.ts'))
const baselineOfficial = require(path.join(directory, 'src/engine/officialAwards.ts'))

function mapOrder(value) {
  if (value instanceof Map) return { entries: [...value].map(([key, item]) => [key, mapOrder(item)]) }
  if (Array.isArray(value)) return value.map(mapOrder)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapOrder(item)]))
  return value
}

function compare(fixture, season, label, official = false) {
  const { teams, players, matches, competitionStates } = fixture
  const args = [teams, players, matches, season]
  assert.deepEqual(current.buildLeagueHistory(...args), baseline.buildLeagueHistory(...args), `${label}: all History matches, completion, standings and movements`)
  assert.deepEqual(current.latestLeagueStandings(...args), baseline.latestLeagueStandings(...args), `${label}: latest standings`)
  const actual = current.buildSeasonAnalytics(...args), expected = baseline.buildSeasonAnalytics(...args)
  // Check all player snapshots, metric order, monthly candidates/Best XI,
  // form rows and review fields, then explicitly check Map insertion order.
  assert.deepEqual(actual, expected, `${label}: complete SeasonAnalytics`)
  assert.deepEqual(mapOrder(actual), mapOrder(expected), `${label}: Map insertion order`)
  for (const [day, snapshot] of actual.playerSnapshots) for (const metric of ['rating', 'goals', 'assists', 'g+a', 'minutes', 'mom']) {
    assert.deepEqual(current.rankingMovement(snapshot, actual.playerSnapshots.get(day - 1), metric), baseline.rankingMovement(expected.playerSnapshots.get(day), expected.playerSnapshots.get(day - 1), metric), `${label}: ${day} ${metric} trends`)
    const rows = snapshot.rows.get(metric), oldRows = expected.playerSnapshots.get(day).rows.get(metric)
    for (const playerId of [rows[0]?.playerId, rows.at(-1)?.playerId, 'deleted-player']) {
      assert.deepEqual(current.scopedPlayerRanks(rows, players, playerId), baseline.scopedPlayerRanks(oldRows, players, playerId))
      assert.deepEqual(current.scopedMetricRanks(rows, players, playerId), baseline.scopedMetricRanks(oldRows, players, playerId))
    }
  }
  for (let block = 1; block <= 10; block++) {
    assert.deepEqual(current.monthlyAwardForBlock(...args, block), baseline.monthlyAwardForBlock(...args, block), `${label}: finalized monthly block ${block}`)
    assert.deepEqual(current.monthlyAwardForStartedBlock(...args, block), baseline.monthlyAwardForStartedBlock(...args, block), `${label}: started monthly block ${block}`)
  }
  if (official) assert.deepEqual(currentOfficial.officialSeasonModel(teams, players, matches, competitionStates, season).events, baselineOfficial.officialSeasonModel(teams, players, matches, competitionStates, season).events, `${label}: official event IDs, order, winners and historical teams`)
}

test('complete three-season analytics and official events match v2.6.3 structurally', () => {
  const fixture = performanceFixture(3)
  for (const season of ['Season 1', 'Season 2', 'Season 3']) compare(fixture, season, season, true)
})

test('unsorted, incomplete, duplicate and malformed day histories preserve every baseline field', () => {
  const fixture = performanceFixture(1)
  fixture.teams = fixture.teams.slice(0, 2)
  const ids = new Set(fixture.teams.map(team => team.id))
  fixture.matches = fixture.matches.filter(match => ids.has(match.teamId) && match.competitionType === 'league' && match.matchDay <= 6).reverse()
  const seed = fixture.matches[0]
  for (const [index, matchDay] of [-1, 0, 1.5, 31, NaN, Infinity].entries()) fixture.matches.splice(index * 2, 0, { ...seed, id: `invalid-${index}`, matchDay })
  fixture.matches.push(fixture.matches[0], { ...seed, id: seed.id, matchDay: 2 })
  const legacy = { ...seed, id: 'legacy-both-teams', homeTeamId: fixture.teams[0].id, awayTeamId: fixture.teams[1].id, matchDay: 3, appearances: [...seed.appearances, { ...seed.appearances[0], teamId: fixture.teams[0].id }] }
  delete legacy.teamId
  fixture.matches.unshift(legacy)
  fixture.matches.push({ ...seed, id: 'frozen-day', matchDay: 30, competitionAssignment: { competitionType: 'league', season: seed.season, teamId: seed.teamId, stage: 'regular', matchDay: 4 } })
  fixture.players.push({ ...fixture.players[0], name: 'Duplicate legacy ID', position: 'ST' })
  compare(fixture, 'Season 1', 'adversarial', true)
  compare(fixture, 'Missing Season', 'empty')
  compare({ ...fixture, teams: [] }, 'Season 1', 'no active teams')
})

test('same-array edits, deletion, addition, transfers, release and roster removal invalidate prefix facts', () => {
  const fixture = performanceFixture(1)
  fixture.teams = fixture.teams.slice(0, 2)
  const ids = new Set(fixture.teams.map(team => team.id))
  fixture.matches = fixture.matches.filter(match => ids.has(match.teamId) && match.competitionType === 'league' && match.matchDay <= 6)
  const check = label => compare(fixture, 'Season 1', label, true)
  check('initial')
  fixture.matches[0] = { ...fixture.matches[0], events: fixture.matches[0].events.filter(event => event.type !== 'goal') }
  check('past result edited')
  fixture.matches.splice(1, 1)
  check('past result deleted')
  fixture.matches.push({ ...fixture.matches[0], id: 'new-duplicate-slot' })
  check('duplicate slot added')
  fixture.players[8] = { ...fixture.players[8], teamId: fixture.teams[1].id, teamIds: [fixture.teams[1].id], position: 'RB' }
  check('transferred')
  fixture.players[8] = { ...fixture.players[8], teamId: '', teamIds: [] }
  check('released')
  fixture.players.splice(8, 1)
  check('player deleted')
  fixture.teams[0] = { ...fixture.teams[0], name: 'Renamed active team' }
  check('team replaced')
  fixture.teams.pop()
  check('team removed')
})
