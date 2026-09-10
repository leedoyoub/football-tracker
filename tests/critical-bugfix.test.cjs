const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { buildGlobalRankingData, unifiedBestEleven } = require('../src/engine/stats.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { combinationStats, onPitchStats } = require('../src/engine/analytics.ts')
const { getMatchManOfTheMatch, rateMatch, ratePlayerMatch, tracePlayerMatchRating } = require('../src/engine/rating.ts')
const { competitionRevision, reconcileCompetitionRevisions, reviseChangedMatch } = require('../src/engine/competitionRevision.ts')
const { selectLeagueCompetition } = require('../src/engine/competitionSelectors.ts')

const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const cb = { id: 'cb', name: 'Defender', displayName: 'Defender', teamId: 'A', position: 'CB', number: 4, rating: 9.9 }
const opponentGoal = (id, minute, sequence) => ({ id, type: 'goal', minute, teamId: 'B', ...(sequence === undefined ? {} : { sequence }) })
const substitution = (id, minute, playerInId = 'cb', playerOutId = 'out', position = 'CB', sequence) => ({ id, type: 'sub', minute, teamId: 'A', playerInId, playerOutId, position, ...(sequence === undefined ? {} : { sequence }) })
const match = (events, extra = {}) => ({ id: 'm', season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: [{ playerId: 'cb', teamId: 'A', role: 'bench', position: 'CB', matchPosition: 'CB' }], events, ...extra })

test('realistic 17-minute CB fixture produces the exact shared raw rating and diagnostic trace', () => {
  const fixture = match([substitution('on', 73), opponentGoal('g75', 75), opponentGoal('g88', 88)])
  const rating = ratePlayerMatch(fixture, cb)
  const trace = tracePlayerMatchRating(fixture, cb)
  near(rating.raw, 6.08615)
  assert.equal(rating.rating.toFixed(1), '6.1')
  assert.equal(trace.minutes, 17)
  assert.deepEqual(trace.concededGoals.map(goal => [goal.minute, goal.onPitch, goal.position, goal.penalty]), [[75, true, 'CB', -.25], [88, true, 'CB', -.25]])
  assert.equal(trace.opponentSot, 2)
  assert.equal(trace.sotMultiplier, .73)
  near(trace.sotBonus, .18615)
  near(trace.componentSum, trace.raw)
  assert.equal(trace.display, '6.1')
  assert.equal(trace.cacheHit, false)
  assert.equal(trace.legacyStoredPlayerRating, 9.9)
  assert.equal(trace.legacyStoredRatingUsed, false)
})

test('a pre-entry goal is SOT but not an on-pitch conceded penalty', () => {
  const fixture = match([opponentGoal('g60', 60), substitution('on', 73), opponentGoal('g88', 88)])
  const trace = tracePlayerMatchRating(fixture, cb)
  assert.deepEqual(trace.concededGoals.map(goal => [goal.minute, goal.onPitch]), [[60, false], [88, true]])
  near(trace.raw, 6.33615)
})

test('same-minute legacy saved order decides whether the entering CB concedes', () => {
  const substitutionFirst = match([substitution('on', 73), opponentGoal('g73', 73), opponentGoal('g88', 88)])
  const goalFirst = match([opponentGoal('g73', 73), substitution('on', 73), opponentGoal('g88', 88)])
  assert.deepEqual(tracePlayerMatchRating(substitutionFirst, cb).concededGoals.map(goal => goal.onPitch), [true, true])
  assert.deepEqual(tracePlayerMatchRating(goalFirst, cb).concededGoals.map(goal => goal.onPitch), [false, true])
  near(ratePlayerMatch(substitutionFirst, cb).raw, 6.08615)
  near(ratePlayerMatch(goalFirst, cb).raw, 6.33615)
})

test('on-pitch and combination consumers use the same saved-order boundary rule', () => {
  const mate = { id: 'mate', name: 'Mate', teamId: 'A', position: 'CB', number: 5 }
  const appearances = [
    { playerId: 'cb', teamId: 'A', role: 'bench', position: 'CB', matchPosition: 'CB' },
    { playerId: 'mate', teamId: 'A', role: 'starter', position: 'CB', matchPosition: 'CB' },
  ]
  const before = match([opponentGoal('g73', 73), substitution('on', 73)], { appearances })
  const after = match([substitution('on', 73), opponentGoal('g73', 73)], { appearances })
  assert.equal(onPitchStats([cb], [before], {}).find(row => row.playerId === 'cb').goalsAgainst, 0)
  assert.equal(onPitchStats([cb], [after], {}).find(row => row.playerId === 'cb').goalsAgainst, 1)
  assert.equal(combinationStats([cb, mate], [before], {}, 'duo')[0].goalsAgainst, 0)
  assert.equal(combinationStats([cb, mate], [after], {}, 'duo')[0].goalsAgainst, 1)
})

test('explicit sequence overrides array order at the same minute', () => {
  const fixture = match([opponentGoal('g73', 73, 2), substitution('on', 73, 'cb', 'out', 'CB', 1), opponentGoal('g88', 88, 3)])
  assert.deepEqual(tracePlayerMatchRating(fixture, cb).concededGoals.map(goal => goal.onPitch), [true, true])
})

test('event-time position applies CB then CDM penalties and suppression intervals', () => {
  const fixture = match([substitution('on', 73), opponentGoal('g75', 75), opponentGoal('g88', 88)], { appearances: [{ playerId: 'cb', teamId: 'A', role: 'bench', position: 'CB', matchPosition: 'CB', positionHistory: [{ minute: 80, position: 'CDM' }] }] })
  const trace = tracePlayerMatchRating(fixture, cb)
  assert.deepEqual(trace.concededGoals.map(goal => [goal.position, goal.penalty]), [['CB', -.25], ['CDM', -.1]])
  near(trace.raw, 6.167205555555556)
})

test('an exit before the second goal ends both minutes and conceded attribution', () => {
  const fixture = match([substitution('on', 73), opponentGoal('g75', 75), substitution('off', 82, 'replacement', 'cb'), opponentGoal('g88', 88)])
  const trace = tracePlayerMatchRating(fixture, cb)
  assert.equal(trace.minutes, 9)
  assert.deepEqual(trace.concededGoals.map(goal => goal.onPitch), [true, false])
  near(trace.raw, 6.24855)
})

test('legacy unsequenced substitution and minimal conceded-goal records remain compatible', () => {
  const fixture = match([
    { id: 'legacy-on', type: 'sub', minute: 73, teamId: 'A', playerOutId: 'out', playerInId: 'cb', position: 'CB' },
    { id: 'legacy-goal', type: 'goal', minute: 75, teamId: 'B' },
    { id: 'legacy-goal-2', type: 'goal', minute: 88, teamId: 'B' },
  ])
  near(ratePlayerMatch(fixture, cb).raw, 6.08615)
})

test('edited Match arrays invalidate derived player values while all consumers share one match rating', () => {
  const oneGoal = match([substitution('on', 73), opponentGoal('g75', 75)])
  const twoGoals = { ...oneGoal, events: [...oneGoal.events, opponentGoal('g88', 88)] }
  const before = derivePlayerScope(cb, [cb], [oneGoal], { season: 'Season 1', competition: 'league' })
  const after = derivePlayerScope(cb, [cb], [twoGoals], { season: 'Season 1', competition: 'league' })
  assert.notEqual(before.averageRating, after.averageRating)
  const shared = ratePlayerMatch(twoGoals, cb)
  near(rateMatch(twoGoals, [cb])[0].raw, shared.raw)
  near(after.appearances[0].rating.raw, shared.raw)
  assert.equal(getMatchManOfTheMatch(twoGoals, [cb]), 'cb')
  const ranking = buildGlobalRankingData([cb], [twoGoals], { seasons: ['Season 1'], teams: [], positions: [] }, 'rating')[0]
  assert.equal(ranking.avgRating, Math.round(shared.rating * 100) / 100)
  near(shared.base + shared.result + shared.goals + shared.assists + shared.teamGoals + shared.conceded + shared.noConceded + shared.concededCause + shared.saves, shared.raw)
})

test('player derivation reports cache MISS then HIT and a Match edit reports MISS', () => {
  const oneGoal = match([substitution('on', 73), opponentGoal('g75', 75)])
  const players = [cb]
  const matches = [oneGoal]
  const diagnostics = []
  derivePlayerScope(cb, players, matches, { season: 'Season 1' }, value => diagnostics.push(value.cacheHit))
  derivePlayerScope(cb, players, matches, { season: 'Season 1' }, value => diagnostics.push(value.cacheHit))
  const edited = [{ ...oneGoal, events: [...oneGoal.events, opponentGoal('g88', 88)] }]
  derivePlayerScope(cb, players, edited, { season: 'Season 1' }, value => diagnostics.push(value.cacheHit))
  assert.deepEqual(diagnostics, [false, true, false])
})

test('League selector is O(1), stable on re-entry, and ignores a Cup-only mutation', () => {
  const owner = {}
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const league = match([substitution('on', 73)])
  const diagnostics = []
  const first = selectLeagueCompetition(owner, teams, [league], 'Season 1', 0, 0, value => diagnostics.push(value))
  const second = selectLeagueCompetition(owner, teams, [league], 'Season 1', 0, 0, value => diagnostics.push(value))
  assert.strictEqual(second, first)
  assert.deepEqual(diagnostics.map(row => [row.hit, row.reason]), [[false, 'cold'], [true, 'unchanged-revision']])

  const cup = { ...league, id: 'cup', competitionType: 'cup' }
  const cupOnlyRevision = reviseChangedMatch({}, undefined, cup)
  assert.equal(competitionRevision(cupOnlyRevision, 'Season 1', 'league'), 0)
  const afterCup = selectLeagueCompetition(owner, teams, [league, cup], 'Season 1', 0, 0)
  assert.strictEqual(afterCup, first)

  const leagueRevision = reviseChangedMatch(cupOnlyRevision, undefined, league)
  const changed = selectLeagueCompetition(owner, teams, [league], 'Season 1', competitionRevision(leagueRevision, 'Season 1', 'league'), 0)
  assert.notStrictEqual(changed, first)
})

test('semantic sync copies and UI-only state preserve revision tokens', () => {
  const fixture = match([substitution('on', 73)])
  const revisions = { 'Season 1': { league: 4, cup: 2 } }
  assert.strictEqual(reconcileCompetitionRevisions(revisions, [fixture], [{ ...fixture, events: fixture.events.map(event => ({ ...event })) }]), revisions)
  assert.equal(competitionRevision(revisions, 'Season 1', 'league'), 4)
})

test('unchanged League ranking and Best XI derivations return stable cached references', () => {
  const fixture = match([substitution('on', 73), opponentGoal('g75', 75), opponentGoal('g88', 88)])
  const players = [cb]
  const matches = [fixture]
  const filters = { seasons: ['Season 1'], teams: [], positions: [] }
  assert.strictEqual(buildGlobalRankingData(players, matches, filters, 'rating'), buildGlobalRankingData(players, matches, filters, 'rating'))
  assert.strictEqual(unifiedBestEleven(players, matches, 'Season 1'), unifiedBestEleven(players, matches, 'Season 1'))
})

test('League immediate render contains no lower stats, Best XI, integrity, or combination derivation', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const immediate = source.slice(source.indexOf('export function CompetitionScreen'), source.indexOf('function DeferredCompetitionPanels'))
  assert(!/competitionSeasonStatus\(/.test(immediate))
  assert(!/buildGlobalRankingData\(/.test(immediate))
  assert(!/unifiedBestEleven\(/.test(immediate))
  assert(!source.includes('auditDataIntegrity') && !source.includes('combinationStats') && !source.includes('playerChemistry'))
  assert(source.includes('stage >= 1 && <DeferredCompetitionRankings'))
  assert(source.includes('stage >= 2 && <DeferredCompetitionBestElevens'))
  assert(source.includes('stage >= 3 && <DeferredSeasonCompletion'))
  const selector = fs.readFileSync(require.resolve('../src/engine/competitionSelectors.ts'), 'utf8')
  assert(!selector.includes('JSON.stringify') && !selector.includes('.filter(') && !selector.includes('.sort('))
})
