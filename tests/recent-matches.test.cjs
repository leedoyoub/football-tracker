const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename)
const { recentMatches, recentMatchPositions } = require('../src/screens/recentMatches.ts')
const { derivedResults } = require('../src/lib/results.ts')
const { preserveRecordedAt, recordNewMatch } = require('../src/engine/matchRecording.ts')
const { getMostRecentStartingLineup } = require('../src/engine/recentLineup.ts')
const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')
const { teamSeasonStats, lastMatchDays } = require('../src/engine/stats.ts')
const { playerForm } = require('../src/engine/seasonInsights.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const game = (id, props = {}) => ({ id, season: 'S1', matchDay: 1, date: '2026-09-01', homeTeamId: 'A', awayTeamId: 'opponent', duration: 90, appearances: [], events: [], ...props })
const ids = matches => matches.map(match => match.id)

test('date-only legacy matches use persisted array order only after calendar date; inputs stay intact', () => {
  const matches = [game('A38', { matchDay: 38 }), game('B1', { homeTeamId: 'B', date: '2020-01-01' }), game('A2', { matchDay: 2 })]
  const before = JSON.stringify(matches)
  assert.deepEqual(ids(recentMatches(matches)), ['A2', 'A38', 'B1'])
  assert.equal(JSON.stringify(matches), before)
})

test('same-date recent chronology prefers immutable recordedAt over random UUID text', () => {
  const older = game('zzzz-random-id', { date: '2026-09-14', recordedAt: 1000 })
  const newer = game('aaaa-random-id', { date: '2026-09-14', recordedAt: 2000 })
  assert.deepEqual(ids(recentMatches([older, newer])), ['aaaa-random-id', 'zzzz-random-id'])
})

test('new commits receive one recording instant and edits preserve it', () => {
  const first = recordNewMatch({ ...game('A'), id: 'A' }, 1000)
  const second = recordNewMatch({ ...game('B'), id: 'B' }, 2000)
  const editedFirst = preserveRecordedAt(first, { ...first, recordedAt: 9000, events: [{ id: 'goal', type: 'goal', minute: 1, teamId: 'A' }] })
  assert.equal(first.recordedAt, 1000)
  assert.equal(editedFirst.recordedAt, 1000)
  assert.deepEqual(ids(recentMatches([editedFirst, second])), ['B', 'A'])
})

test('indistinguishable legacy same-date records use later persisted array position as newer', () => {
  const older = game('z-legacy', { date: '2026-09-14' })
  const newer = game('a-legacy', { date: '2026-09-14' })
  assert.deepEqual(ids(recentMatches([older, newer])), ['a-legacy', 'z-legacy'])
})

test('Home result projection takes its first five from canonical date and recording order', () => {
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const matches = [
    game('old', { date: '2026-09-10', teamId: 'A' }),
    game('same-early', { date: '2026-09-14', recordedAt: 1000, teamId: 'A' }),
    game('same-late', { date: '2026-09-14', recordedAt: 3000, teamId: 'A' }),
    game('third', { date: '2026-09-13', teamId: 'A' }),
    game('fourth', { date: '2026-09-12', teamId: 'A' }),
    game('fifth', { date: '2026-09-11', teamId: 'A' }),
  ]
  assert.deepEqual(ids(derivedResults(matches, teams).slice(0, 5).map(row => row.match)), ['same-late', 'same-early', 'third', 'fourth', 'fifth'])
})

test('team form and Best XI matchday selection filter first, then use canonical recent chronology', () => {
  const goal = (id, teamId) => ({ id, type: 'goal', minute: 10, teamId })
  // Matchday is deliberately unrelated to calendar order: it must not decide recency.
  const oldLoss = game('old-loss', { date: '2026-09-10', matchDay: 99, events: [goal('old-goal', 'opponent')] })
  const middleLoss = game('middle-loss', { date: '2026-09-13', matchDay: 40, events: [goal('middle-goal', 'opponent')] })
  const sameDateDraw = game('same-date-draw', { date: '2026-09-14', matchDay: 2, recordedAt: 1000 })
  const sameDateWin = game('same-date-win', { date: '2026-09-14', matchDay: 1, recordedAt: 3000, events: [goal('latest-goal', 'A')] })
  const shuffled = [sameDateDraw, oldLoss, sameDateWin, middleLoss]

  assert.deepEqual(teamSeasonStats('A', shuffled, 'S1').recentForm, ['W', 'D', 'L', 'L'])
  assert.deepEqual(lastMatchDays(shuffled, 'S1', 3), [1, 2, 40])
})

test('lineup restoration chooses the canonically newest same-date match, not a UUID or raw ID order', () => {
  const assignments = (tag) => ({ GK: `gk-${tag}`, LB: `lb-${tag}`, LCB: `lcb-${tag}`, RCB: `rcb-${tag}`, RB: `rb-${tag}`, LCM: `lcm-${tag}`, CM: `cm-${tag}`, RCM: `rcm-${tag}`, LW: `lw-${tag}`, ST: `st-${tag}`, RW: `rw-${tag}` })
  const older = game('zzzz-legacy-id', { date: '2026-09-14', kickoffLineup: kickoffFromAssignments(assignments('old')) })
  const newer = game('aaaa-legacy-id', { date: '2026-09-14', kickoffLineup: kickoffFromAssignments(assignments('new')) })

  assert.equal(getMostRecentStartingLineup([older, newer], 'A').GK, 'gk-new')
})

test('player form and scoped Player Detail appearance history retain the shared chronology after filtering', () => {
  const player = { id: 'p', name: 'P', displayName: 'P', position: 'ST', number: 9, teamId: 'A' }
  const appearance = { playerId: 'p', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }
  const leagueOld = game('league-old', { date: '2026-09-10', matchDay: 30, appearances: [appearance] })
  const leagueMiddle = game('league-middle', { date: '2026-09-13', matchDay: 20, appearances: [appearance] })
  const leagueSameEarly = game('league-same-early', { date: '2026-09-14', matchDay: 10, recordedAt: 1000, appearances: [appearance] })
  const leagueSameLate = game('league-same-late', { date: '2026-09-14', matchDay: 1, recordedAt: 2000, appearances: [appearance] })
  const excludedCup = game('cup-newest', { date: '2026-09-15', competitionType: 'cup', appearances: [appearance] })
  const shuffled = [leagueSameEarly, excludedCup, leagueOld, leagueSameLate, leagueMiddle]

  assert.deepEqual(playerForm(player, shuffled.filter(match => (match.competitionType ?? 'league') === 'league')).ratings.map(row => row.matchId), ['league-old', 'league-middle', 'league-same-early', 'league-same-late'])
  assert.deepEqual(derivePlayerScope(player, [player], shuffled, { competition: 'league' }).appearances.map(row => row.match.id), ['league-old', 'league-middle', 'league-same-early', 'league-same-late'])
})

test('same-date timestamps break ties and preserve deterministic creation ordering', () => {
  const matches = [game('latest', { playedAt: '2026-09-08', createdAt: '2020-01-01' }), game('old', { createdAt: '2026-09-01' }), game('tie1', { timestamp: 1788825600 }), game('tie2', { timestamp: 1788825600000 })]
  assert.deepEqual(ids(recentMatches(matches)), ['tie2', 'tie1', 'latest', 'old'])
  assert.deepEqual(ids(recentMatches([game('one', { playedAt: 'invalid', createdAt: '2026-09-08' }), game('two', { timestamp: '2026-09-01' })])), ['one', 'two'])
})

test('mixed imports use actual date-time then the date-only fallback', () => {
  assert.deepEqual(ids(recentMatches([game('new-time', { playedAt: '2026-09-08' }), game('legacy'), game('old-time', { playedAt: '2026-09-01' })])), ['new-time', 'old-time', 'legacy'])
})

test('the canonical match date outranks unrelated metadata timestamps', () => {
  const matches = [game('dated-newer', { date: '2026-09-08', createdAt: '2020-01-01' }), game('dated-older', { date: '2026-09-01', playedAt: '2030-01-01' })]
  assert.deepEqual(ids(recentMatches(matches)), ['dated-newer', 'dated-older'])
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

test('Team Detail reserves roster and lineup management for the Players tab', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  assert(source.includes("value: 'overview', label: 'Overview'") && source.includes("value: 'matches', label: 'Matches'"))
  assert(source.includes("value: 'players', label: 'Players'"))
  assert(source.includes("tab === 'players' && <section aria-label=\"Roster management\"") && source.includes('Latest XI') && source.includes('Bench'))
  assert(source.includes("tab === 'matches' && <section"))
})

test('Team Detail keeps Import Squad in the Players-only roster section', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  assert(source.includes("tab === 'players' && <section aria-label=\"Roster management\"") && source.includes('Import Squad'))
  assert(source.includes("onNavigate({ name: 'import-squad', teamId })"))
  assert(!source.includes('useAuth'))
})
