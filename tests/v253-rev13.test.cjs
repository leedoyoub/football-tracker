const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const rating = require('../src/engine/rating.ts')
const revision = require('../src/engine/ratingRevision.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const { playerRankTrend } = require('../src/engine/playerRankTrend.ts')
const { performanceAwardResult } = require('../src/engine/awards.ts')
const { buildSeasonAnalytics } = require('../src/engine/seasonAnalytics.ts')
const { playerStreaks } = require('../src/engine/seasonInsights.ts')
const { selectLeagueCompetition } = require('../src/engine/competitionSelectors.ts')
const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { GOOD_RATING_THRESHOLD, isGoodRating } = require('../src/engine/constants.ts')
const { ratingBadgeColor, ratingTone } = require('../src/components/ui.tsx')
const { recentFormLabelColor } = require('../src/lib/trendPlot.ts')
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, String(actual) + ' != ' + expected)
const player = (id, position) => ({ id, name: id, displayName: id, teamId: 'A', position, number: 1, rating: 3 })
const app = p => ({ playerId: p.id, teamId: 'A', role: 'starter', position: p.position, matchPosition: p.position, rating: 3 })
const goal = (id, teamId, minute = 20) => ({ id, type: 'goal', teamId, minute })
function game(id, players, events = [], sot = 0, day = 1) {
  return { id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: '2026-01-' + String(day).padStart(2, '0'), duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', halftimeOpponentSot: sot, fulltimeOpponentSot: sot, manOfMatchPlayerId: 'cam', ratings: { cb: 3, cam: 10 }, appearances: players.map(app), events }
}
function withRev12(run) {
  const priorRevision = revision.RATING_ENGINE_REVISION
  const priorMax = rating.POSITION_RULES.CB.suppressionMax
  try { revision.RATING_ENGINE_REVISION = 12; rating.POSITION_RULES.CB.suppressionMax = 1.3; return run() }
  finally { revision.RATING_ENGINE_REVISION = priorRevision; rating.POSITION_RULES.CB.suppressionMax = priorMax }
}

test('REV13 CB family combines 1.40 suppression, SOT exposure and .35 per conceded goal', () => {
  assert.equal(revision.RATING_ENGINE_REVISION, 13)
  for (const position of ['CB', 'LCB', 'RCB']) {
    const p = player(position, position)
    near(rating.ratePlayerMatch(game(position + ':clean', [p]), p).noConceded, 1.4)
    for (const count of [1, 2, 3]) {
      const row = rating.ratePlayerMatch(game(position + ':' + count, [p], Array.from({ length: count }, (_, i) => goal('b' + i, 'B', i + 20))), p)
      near(row.noConceded, [0, 1.204, 1.022, .868][count])
      near(row.conceded, -.35 * count)
      near(row.result, -.3)
      near(row.raw, 6.5 - .3 + [0, 1.204, 1.022, .868][count] - .35 * count)
    }
  }
})

test('REV13 full backs keep suppression and attack while conceding .25 each', () => {
  for (const position of ['LB', 'RB', 'LWB', 'RWB']) {
    const p = player(position, position)
    const match = game(position, [p], [goal('against1', 'B'), goal('against2', 'B', 40), { ...goal('ours', 'A', 50), playerId: p.id }, { ...goal('assist', 'A', 60), assistPlayerId: p.id }, goal('teammate', 'A', 70)])
    const row = rating.ratePlayerMatch(match, p)
    near(row.noConceded, .73); near(row.conceded, -.5)
    near(row.goals, 1.25); near(row.assists, .7); near(row.teamGoals, .04)
  }
})

test('REV13 GK base, conceded steps, save bands and exact 7.2 good-rating boundary', () => {
  const p = player('keeper', 'GK')
  for (const count of [0, 1, 2, 3, 4]) {
    const row = rating.ratePlayerMatch(game('gk:' + count, [p], Array.from({ length: count }, (_, i) => goal('b' + i, 'B', i + 20))), p)
    near(row.base, 7.1); near(row.conceded, -.3 * count)
    near(row.base + row.conceded, [7.1, 6.8, 6.5, 6.2, 5.9][count])
  }
  const win = rating.ratePlayerMatch(game('gk:win', [p], [goal('ours', 'A')]), p)
  near(win.raw, 7.2)
  assert.equal(win.raw, 7.1 + .1, 'raw rating retains full floating-point precision')
  assert.notEqual(win.raw, GOOD_RATING_THRESHOLD)
  assert.equal(isGoodRating(win.raw), true)
  assert.equal(isGoodRating(GOOD_RATING_THRESHOLD - 1e-8), false)
  assert.match(ratingTone(win.raw), /emerald/)
  assert.match(ratingBadgeColor(win.raw), /emerald/)
  assert.equal(recentFormLabelColor(win.raw, false), '#34d399')
  const winMatch = game('gk:win-scope', [p], [goal('ours', 'A')])
  assert.equal(derivePlayerScope(p, [p], [winMatch]).goodMatches, 1)
  assert.equal(buildGlobalRankingData([p], [winMatch], { seasons: ['S1'], teams: [], positions: [] }, 'goodMatches')[0].goodMatches, 1)
  assert.equal(buildPlayerRecordLeaderboards([p], [winMatch]).find(group => group.id === 'good').rows[0].numeric, 1)
  assert.equal(playerStreaks(p, [winMatch]).find(row => row.key === 'goodRating').best, 1)
  assert.equal(buildSeasonAnalytics([{ id: 'A' }, { id: 'B' }], [p], [winMatch], 'S1').playerSnapshots.get(1).rows.get('rating')[0].goodMatches, 1)
  const saved = rating.ratePlayerMatch(game('gk:save', [p], [{ id: 'save', type: 'save', minute: 10, teamId: 'A', playerId: p.id, count: 4 }, goal('b', 'B')]), p)
  near(saved.saves, 1.2)
})

test('historical MOM, counts, rankings and records are rebuilt from REV13 raw data', () => {
  const cb = player('cb', 'CB'), cam = player('cam', 'CAM'), players = [cb, cam]
  const matches = [1, 2, 3].map(day => game('historical:' + day, players, [{ ...goal('assist:' + day, 'A'), assistPlayerId: 'cam' }, goal('neutral:' + day, 'A', 30)], 4, day))
  const original = JSON.stringify(matches)
  withRev12(() => {
    near(rating.ratePlayerMatch(matches[0], cb).raw, 7.289)
    assert.equal(rating.getMatchManOfTheMatch(matches[0], players), 'cam')
    assert.equal(derivePlayerScope(cam, players, matches).mom, 3)
    buildGlobalRankingData(players, matches, { seasons: ['S1'], teams: [], positions: [] }, 'mom')
    buildPlayerRecordLeaderboards(players, matches)
  })
  near(rating.ratePlayerMatch(matches[0], cb).raw, 7.342)
  assert.equal(rating.getMatchManOfTheMatch(matches[0], players), 'cb')
  const cbDetail = derivePlayerScope(cb, players, matches), camDetail = derivePlayerScope(cam, players, matches)
  near(cbDetail.averageRating, 7.342); assert.equal(cbDetail.mom, 3); assert.equal(camDetail.mom, 0)
  const rows = buildGlobalRankingData(players, matches, { seasons: ['S1'], teams: [], positions: [] }, 'mom')
  assert.equal(rankGlobalRankingRows(rows, players, 'mom')[0].playerId, 'cb')
  assert.equal(rankGlobalRankingRows(rows, players, 'rating')[0].playerId, 'cb')
  assert.equal(buildPlayerRecordLeaderboards(players, matches).find(group => group.id === 'mom').rows[0].playerId, 'cb')
  assert.equal(playerRankTrend('cb', players, matches, 'S1', 'league', 'rating').at(-1).overall, 1)
  near(performanceAwardResult(players, matches).candidates.find(row => row.playerId === 'cb').average, 7.342)
  assert.equal(JSON.stringify(matches), original)
})

test('competition selector invalidates a warm rating tie-break when engine revision changes', () => {
  const cb = player('selector-cb', 'CB'), players = [cb], teams = [{ id: 'A' }, { id: 'B' }]
  const matches = [game('selector', players)], owner = {}
  withRev12(() => near(selectLeagueCompetition(owner, teams, matches, 'S1', 1, 1, undefined, players).standings.find(row => row.teamId === 'A').averageRating, 7.8))
  const diagnostics = []
  const after = selectLeagueCompetition(owner, teams, matches, 'S1', 1, 1, row => diagnostics.push(row), players)
  assert.equal(diagnostics[0].hit, false)
  near(after.standings.find(row => row.teamId === 'A').averageRating, 7.9)
})

test('historical full-back and goalkeeper ratings feed averages, award inputs and form', () => {
  const lb = player('lb', 'LB'), gk = player('gk', 'GK'), players = [lb, gk]
  const matches = [game('loss', players, [goal('against', 'B')], 0, 1), game('win', players, [goal('for', 'A')], 0, 2)]
  const original = JSON.stringify(matches)
  near(rating.ratePlayerMatch(matches[0], lb).raw, 6.81)
  near(rating.ratePlayerMatch(matches[0], gk).raw, 6.5)
  near(rating.ratePlayerMatch(matches[1], lb).raw, 7.64)
  near(rating.ratePlayerMatch(matches[1], gk).raw, 7.2)
  near(derivePlayerScope(lb, players, matches).averageRating, 7.225)
  near(derivePlayerScope(gk, players, matches).averageRating, 6.85)
  assert.equal(derivePlayerScope(gk, players, matches).goodMatches, 1)
  const rows = buildGlobalRankingData(players, matches, { seasons: ['S1'], teams: [], positions: [] }, 'rating')
  assert.equal(rankGlobalRankingRows(rows, players, 'rating')[0].playerId, 'lb')
  const candidates = performanceAwardResult(players, matches).candidates
  near(candidates.find(row => row.playerId === 'lb').average, 7.225)
  near(candidates.find(row => row.playerId === 'gk').average, 6.85)
  assert.equal(playerRankTrend('lb', players, matches, 'S1', 'league', 'rating').at(-1).overall, 1)
  assert.equal(JSON.stringify(matches), original)
})

test('Records screen invalidates a warm REV12 rating and MOM projection', () => {
  const cb = player('cb', 'CB'), cam = player('cam', 'CAM'), players = [cb, cam], teams = [{ id: 'A' }, { id: 'B' }]
  const matches = [game('records', players, [{ ...goal('assist', 'A'), assistPlayerId: 'cam' }, goal('neutral', 'A', 30)], 4)]
  const input = { category: 'player', players, teams, matches, scope: { seasons: ['S1'], teamIds: [], competition: 'all', positionFilter: 'all' } }
  withRev12(() => {
    const old = recordsLeaderboardGroups(input)
    assert.equal(old.find(group => group.id === 'mom').rows[0].id, 'cam')
    assert.equal(old.find(group => group.id === 'highest-rating').rows[0].id, 'cam')
  })
  const current = recordsLeaderboardGroups(input)
  assert.equal(current.find(group => group.id === 'mom').rows[0].id, 'cb')
  assert.equal(current.find(group => group.id === 'highest-rating').rows[0].id, 'cb')
})
