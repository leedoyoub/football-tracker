const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { getMatchManOfTheMatch, ratePlayerMatch } = require('../src/engine/rating.ts')
const { buildMatchChangeIndex } = require('../src/engine/matchChangeIndex.ts')
const { deriveNews } = require('../src/engine/news.ts')
const { buildGlobalRankingData, unifiedBestEleven } = require('../src/engine/stats.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const { buildSeasonAnalytics } = require('../src/engine/seasonAnalytics.ts')
const { historyTimelineForSeason, historyAwardsForSeason, historyMonthlyAward } = require('../src/engine/historyReadModels.ts')

const teams = [{ id: 'A', name: 'A', shortName: 'A' }, { id: 'B', name: 'B', shortName: 'B' }]
const cdm = { id: 'cdm', name: 'cdm', displayName: 'cdm', fullName: 'cdm', teamId: 'A', position: 'CDM', number: 6, rating: 1 }
const cam = { id: 'cam', name: 'cam', displayName: 'cam', fullName: 'cam', teamId: 'A', position: 'CAM', number: 8 }
const players = [cdm, cam]
const app = p => ({ playerId: p.id, teamId: 'A', role: 'starter', position: p.position, matchPosition: p.position })
const game = (id, day, events = []) => ({ id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: players.map(app), events })
const labels = (index, id) => (index.get(id) ?? []).flatMap(group => group.items.map(item => item.label))

test('revision-10 personal-best and rare performance remain News-only while Match Changes stays milestone-only', () => {
  const first = game('first', 1)
  const improved = game('improved', 2, [{ id: 'team-goal', type: 'goal', minute: 20, teamId: 'A', assistPlayerId: cam.id }])
  const high = game('high', 3, [{ id: 'g1', type: 'goal', minute: 10, teamId: 'A', playerId: cdm.id }, { id: 'g2', type: 'goal', minute: 20, teamId: 'A', playerId: cdm.id }])
  const index = buildMatchChangeIndex(players, teams, [first, improved, high], [])
  assert(ratePlayerMatch(improved, cdm).raw > ratePlayerMatch(first, cdm).raw)
  assert.equal(labels(index, 'improved').some(label => /Personal best .* rating/.test(label)), false)
  assert.equal(labels(index, 'high').some(label => /rare rating/.test(label)), false)
  assert(deriveNews(players, teams, [first, improved, high], []).some(item => item.id === 'rare:high:cdm:performance' && item.detail === ratePlayerMatch(high, cdm).rating.toFixed(1)))
})

test('equal canonical rating does not create a strict personal-best event', () => {
  const index = buildMatchChangeIndex(players, teams, [game('one', 1), game('equal', 2)], [])
  assert.equal(labels(index, 'equal').some(label => /Personal best .* rating/.test(label)), false)
})

test('rating-dependent caches distinguish revision and raw collection identity without persistence', () => {
  const first = game('cache', 1)
  const next = game('cache', 1, [{ id: 'goal', type: 'goal', minute: 20, teamId: 'A', assistPlayerId: cam.id }])
  const rating = ratePlayerMatch(first, cdm)
  const alternate = ratePlayerMatch(first, cdm, RATING_ENGINE_REVISION + 1)
  assert.notStrictEqual(rating, alternate)
  assert.strictEqual(ratePlayerMatch(first, cdm, RATING_ENGINE_REVISION + 1), alternate)
  assert.notStrictEqual(buildMatchChangeIndex(players, teams, [first], []), buildMatchChangeIndex(players, teams, [next], []))
  assert.notStrictEqual(deriveNews(players, teams, [first], []), deriveNews(players, teams, [next], []))
})

test('every revision-keyed rating projection rebuilds on revision or raw collection identity changes', () => {
  const revision = require('../src/engine/ratingRevision.ts')
  const first = game('all-caches', 1)
  const edited = game('all-caches', 1, [{ id: 'goal', type: 'goal', minute: 20, teamId: 'A', assistPlayerId: cam.id }])
  const matches = [first]
  const editedMatches = [edited]
  const monthlyMatches = [1, 2, 3].map(day => ({ ...game(`monthly-cache-${day}`, day), teamId: undefined }))
  const filters = { seasons: ['S1'], teams: [], positions: [] }
  const states = []
  const original = revision.RATING_ENGINE_REVISION
  const initial = {
    ranking: buildGlobalRankingData(players, matches, filters, 'rating'),
    derived: derivePlayerScope(cdm, players, matches, { season: 'S1' }),
    records: buildPlayerRecordLeaderboards(players, matches),
    season: buildSeasonAnalytics(teams, players, matches, 'S1'),
    history: historyTimelineForSeason(teams, players, matches, states, 'S1'),
    awards: historyAwardsForSeason(teams, players, matches, states, 'S1', 'all'),
    monthly: historyMonthlyAward(teams, players, monthlyMatches, 'S1', 1),
    news: deriveNews(players, teams, matches, states),
    changes: buildMatchChangeIndex(players, teams, matches, states),
    xi: unifiedBestEleven(players, matches, 'S1'),
  }
  assert.strictEqual(buildGlobalRankingData(players, matches, filters, 'rating'), initial.ranking)
  assert.strictEqual(derivePlayerScope(cdm, players, matches, { season: 'S1' }), initial.derived)
  assert.strictEqual(buildPlayerRecordLeaderboards(players, matches), initial.records)
  assert.strictEqual(buildSeasonAnalytics(teams, players, matches, 'S1'), initial.season)
  assert.strictEqual(historyTimelineForSeason(teams, players, matches, states, 'S1'), initial.history)
  assert.strictEqual(historyAwardsForSeason(teams, players, matches, states, 'S1', 'all'), initial.awards)
  assert.strictEqual(historyMonthlyAward(teams, players, monthlyMatches, 'S1', 1), initial.monthly)
  assert.strictEqual(deriveNews(players, teams, matches, states), initial.news)
  assert.strictEqual(buildMatchChangeIndex(players, teams, matches, states), initial.changes)
  assert.strictEqual(unifiedBestEleven(players, matches, 'S1'), initial.xi)
  try {
    revision.RATING_ENGINE_REVISION = original + 1
    assert.notStrictEqual(buildGlobalRankingData(players, matches, filters, 'rating'), initial.ranking)
    assert.notStrictEqual(derivePlayerScope(cdm, players, matches, { season: 'S1' }), initial.derived)
    assert.notStrictEqual(buildPlayerRecordLeaderboards(players, matches), initial.records)
    assert.notStrictEqual(buildSeasonAnalytics(teams, players, matches, 'S1'), initial.season)
    assert.notStrictEqual(historyTimelineForSeason(teams, players, matches, states, 'S1'), initial.history)
    assert.notStrictEqual(historyAwardsForSeason(teams, players, matches, states, 'S1', 'all'), initial.awards)
    assert.notStrictEqual(historyMonthlyAward(teams, players, monthlyMatches, 'S1', 1), initial.monthly)
    assert.notStrictEqual(deriveNews(players, teams, matches, states), initial.news)
    assert.notStrictEqual(buildMatchChangeIndex(players, teams, matches, states), initial.changes)
    assert.notStrictEqual(unifiedBestEleven(players, matches, 'S1'), initial.xi)
  } finally {
    revision.RATING_ENGINE_REVISION = original
  }
  assert.notStrictEqual(buildGlobalRankingData(players, editedMatches, filters, 'rating'), initial.ranking)
  assert.notEqual(buildGlobalRankingData(players, editedMatches, filters, 'rating')[0].avgRating, initial.ranking[0].avgRating)
  assert.notStrictEqual(derivePlayerScope(cdm, players, editedMatches, { season: 'S1' }), initial.derived)
  assert.notEqual(derivePlayerScope(cdm, players, editedMatches, { season: 'S1' }).averageRating, initial.derived.averageRating)
  assert.notStrictEqual(buildPlayerRecordLeaderboards(players, editedMatches), initial.records)
  assert.notStrictEqual(buildSeasonAnalytics(teams, players, editedMatches, 'S1'), initial.season)
  assert.notStrictEqual(historyTimelineForSeason(teams, players, editedMatches, states, 'S1'), initial.history)
  assert.notEqual(historyTimelineForSeason(teams, players, editedMatches, states, 'S1').rating.avgRating, initial.history.rating.avgRating)
  assert.notStrictEqual(deriveNews(players, teams, editedMatches, states), initial.news)
  assert.notStrictEqual(buildMatchChangeIndex(players, teams, editedMatches, states), initial.changes)
  assert.notStrictEqual(unifiedBestEleven(players, editedMatches, 'S1'), initial.xi)
})

test('canonical ranking remains independent while season MOM milestones stay in What Changed', () => {
  const solo = (id, day, subject, events) => ({ ...game(id, day, events), appearances: [app(subject)] })
  const camLead = solo('cam-lead', 1, cam, [{ id: 'cam-assist', type: 'goal', minute: 20, teamId: 'A', assistPlayerId: cam.id }])
  const cdmTakeover = solo('cdm-takeover', 2, cdm, [{ id: 'cdm-goal', type: 'goal', minute: 20, teamId: 'A', playerId: cdm.id }])
  const index = buildMatchChangeIndex(players, teams, [camLead, cdmTakeover], [])
  assert.equal(getMatchManOfTheMatch(cdmTakeover, players), cdm.id)
  assert.equal(labels(index, 'cdm-takeover').some(label => /TAKES #1/.test(label)), false)
  const tenWins = Array.from({ length: 10 }, (_, index) => solo(`mom-${index + 1}`, index + 1, cdm, [{ id: `mom-goal-${index + 1}`, type: 'goal', minute: 20, teamId: 'A', playerId: cdm.id }]))
  assert(labels(buildMatchChangeIndex(players, teams, tenWins, []), 'mom-10').includes('Season 10 MOM'))
})

test('Match Changes remains one-pass, lazy, and free of ranking computation', () => {
  const index = fs.readFileSync(require.resolve('../src/engine/matchChangeIndex.ts'), 'utf8')
  const detail = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  assert.equal(index.includes("from './news'"), false)
  assert.equal(index.includes('buildGlobalRankingData'), false)
  assert.equal(index.includes('compareCoreLeaderboardRows'), false)
  assert.match(detail, /function MatchChangesPanel[\s\S]*open \? presentMatchChanges/)
})
