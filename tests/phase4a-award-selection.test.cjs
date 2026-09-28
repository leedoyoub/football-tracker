const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { isAwardEligible, leaguePositionBonus, championsProgressBonus, cupProgressBonus, ratingAwardScore } = require('../src/engine/awards.ts')
const { awardsForCompetition, competitionAwardResult, awardCandidatesForScope } = require('../src/engine/awards.ts')
const { seasonAwards } = require('../src/engine/awards.ts')
const { rankAwardCandidates, selectAwardBestXI, seasonLeaguePositionBonus, seasonChampionsProgressBonus, seasonCupProgressBonus } = require('../src/engine/awardRules.ts')
const { unifiedBestEleven } = require('../src/engine/stats.ts')
const { historyAwardsForSeason } = require('../src/engine/historyReadModels.ts')
const { getMatchManOfTheMatch, ratePlayerMatch } = require('../src/engine/rating.ts')

const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, displayName: id, fullName: id, teamId, position, number: 9 })
const appearance = (p, teamId = 'A') => ({ playerId: p.id, teamId, role: 'starter', position: p.position, matchPosition: p.position })
const leagueMatch = (id, day, appearances = []) => ({
  id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day,
  date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances, events: [],
})

test('cumulative Best XI eligibility uses ceil of forty percent while Team of the Week remains separate', () => {
  assert.equal(isAwardEligible(2, 3), true)
  assert.equal(isAwardEligible(2, 4), true)
  assert.equal(isAwardEligible(2, 5), true)
  assert.equal(isAwardEligible(2, 6), false)
  assert.equal(isAwardEligible(3, 6), true)
  assert.equal(isAwardEligible(3, 7), true)
  assert.equal(isAwardEligible(4, 8), true)
  assert.equal(isAwardEligible(4, 10), true)
  assert.equal(isAwardEligible(12, 30), true)
})

test('season Best XI uses the historical team forty-percent denominator', () => {
  const striker = player('striker')
  const matches = [
    leagueMatch('m1', 1, [appearance(striker)]),
    leagueMatch('m2', 2, [appearance(striker)]),
    leagueMatch('m3', 3),
    leagueMatch('m4', 4),
    leagueMatch('m5', 5),
  ]
  const strikerSlot = unifiedBestEleven([striker], matches, 'S1').slots.find(slot => slot.playerId === striker.id)
  assert.equal(strikerSlot.teamId, 'A')
})

test('competition achievement tables are exact direct selection bonuses', () => {
  assert.deepEqual(Array.from({ length: 16 }, (_, index) => leaguePositionBonus(index + 1)), [.20, .08, .035, .025, .015, .015, .015, .015, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(['roundOf16', 'quarterFinal', 'semiFinal', 'runnerUp', 'champion'].map(championsProgressBonus), [0, .020, .035, .08, .20])
  assert.deepEqual(['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'runnerUp', 'champion'].map(cupProgressBonus), [0, 0, 0, .015, .025, .030, .035, .08, .20])
  assert(Math.abs(ratingAwardScore(7.4, .20, 45, 30) - 7.6) < 1e-12)
})

test('shared candidate ordering uses full precision metrics and player ID only as the final fallback', () => {
  const base = { average: 7.5, appearances: 4, mom: 1, minutes: 300, latestRating: 7.5, goals: 1, assists: 1, selectionScore: 7.5, family: 'ATT', teamId: 'A' }
  const ranked = rankAwardCandidates([
    { ...base, playerId: 'z-name-first', latestRating: 7.6 },
    { ...base, playerId: 'a-more-goals', goals: 2 },
    { ...base, playerId: 'b-more-minutes', minutes: 301 },
    { ...base, playerId: 'c-more-mom', mom: 2 },
    { ...base, playerId: 'd-more-apps', appearances: 5 },
    { ...base, playerId: 'e-higher-score', selectionScore: 7.5000001 },
    { ...base, playerId: 'a-id', latestRating: 7.6 },
  ], 'cumulative')
  assert.deepEqual(ranked.map(row => row.playerId), ['e-higher-score', 'd-more-apps', 'c-more-mom', 'b-more-minutes', 'a-id', 'z-name-first', 'a-more-goals'])

  const recent = rankAwardCandidates([
    { ...base, playerId: 'late', latestRating: 7.6 },
    { ...base, playerId: 'mom', mom: 2 },
    { ...base, playerId: 'average', average: 7.6 },
  ], 'recent')
  assert.deepEqual(recent.map(row => row.playerId), ['average', 'mom', 'late'])
})

test('monthly selection is performance-only and orders MOM before appearances', () => {
  const base = { teamId: 'A', family: 'ATT', average: 7.5, appearances: 3, mom: 1, minutes: 270, latestRating: 7.5, goals: 1, assists: 0, selectionScore: 7.5 }
  const ranked = rankAwardCandidates([
    { ...base, playerId: 'more-apps', appearances: 4 },
    { ...base, playerId: 'more-mom', mom: 2 },
  ], 'monthly')
  assert.deepEqual(ranked.map(row => row.playerId), ['more-mom', 'more-apps'])
})

test('every cumulative, recent-three, and monthly comparator fallback is deterministic and ignores display names', () => {
  const base = { teamId: 'A', family: 'ATT', average: 7.5, appearances: 3, mom: 1, minutes: 270, latestRating: 7.5, goals: 1, assists: 0, selectionScore: 7.5 }
  const cumulative = rankAwardCandidates([
    { ...base, playerId: 'goals', goals: 2 },
    { ...base, playerId: 'z-id', displayName: 'Alpha' },
    { ...base, playerId: 'a-id', displayName: 'Zulu' },
  ], 'cumulative')
  assert.deepEqual(cumulative.map(row => row.playerId), ['goals', 'a-id', 'z-id'])

  const recent = rankAwardCandidates([
    { ...base, playerId: 'ga', goals: 2 },
    { ...base, playerId: 'minutes', minutes: 271 },
    { ...base, playerId: 'z-id' },
    { ...base, playerId: 'a-id' },
  ], 'recent')
  assert.deepEqual(recent.map(row => row.playerId), ['minutes', 'ga', 'a-id', 'z-id'])

  const monthly = rankAwardCandidates([
    { ...base, playerId: 'ga', goals: 2 },
    { ...base, playerId: 'minutes', minutes: 271 },
    { ...base, playerId: 'z-id' },
    { ...base, playerId: 'a-id' },
  ], 'monthly')
  assert.deepEqual(monthly.map(row => row.playerId), ['minutes', 'ga', 'a-id', 'z-id'])
})

test('Team of the Week requires three actual recent qualifying ratings and never uses the cumulative gate', () => {
  const leftBack = player('totw-lb', 'A', 'LB')
  const firstTwo = [leagueMatch('totw-1', 1, [appearance(leftBack)]), leagueMatch('totw-2', 2, [appearance(leftBack)])]
  assert.equal(unifiedBestEleven([leftBack], firstTwo, 'S1', true).slots.find(slot => slot.playerId === leftBack.id), undefined)
  const three = [...firstTwo, leagueMatch('totw-3', 3, [appearance(leftBack)])]
  assert.equal(unifiedBestEleven([leftBack], three, 'S1', true).slots.find(slot => slot.playerId === leftBack.id).matches, 3)
})

test('season achievement tables are exact and a treble is sixty-two hundredths', () => {
  assert.deepEqual(Array.from({ length: 16 }, (_, index) => seasonLeaguePositionBonus(index + 1)), [.26, .12, .06, .05, .04, .04, .03, .03, .015, .015, .015, .015, 0, 0, 0, 0])
  assert.deepEqual(['roundOf16', 'quarterFinal', 'semiFinal', 'runnerUp', 'champion'].map(seasonChampionsProgressBonus), [0, .03, .05, .11, .24])
  assert.deepEqual(['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'runnerUp', 'champion'].map(seasonCupProgressBonus), [0, 0, 0, .020, .025, .030, .035, .06, .12])
  assert(Math.abs((seasonLeaguePositionBonus(1) + seasonChampionsProgressBonus('champion') + seasonCupProgressBonus('champion')) - .62) < 1e-12)
})

test('shared Best XI selector never duplicates a player across matching slots', () => {
  const candidates = rankAwardCandidates([
    { playerId: 'only-cb', teamId: 'A', family: 'CB', average: 8, appearances: 4, mom: 2, minutes: 360, latestRating: 8, goals: 0, assists: 0, selectionScore: 8 },
  ], 'cumulative')
  const slots = selectAwardBestXI(candidates)
  assert.equal(slots.filter(slot => slot.playerId === 'only-cb').length, 1)
})

test('live competition Best Player and Best XI share scored historical-team candidates', () => {
  const transferred = player('transferred', 'B', 'GK')
  const matches = [1, 2, 3, 4, 5].map(day => leagueMatch(`live-${day}`, day, day <= 2 ? [appearance({ ...transferred, position: 'ST' }, 'A')] : []))
  const teams = [{ id: 'A', name: 'Alpha', shortName: 'A' }, { id: 'B', name: 'Beta', shortName: 'B' }]
  const models = { league: { complete: false, championId: undefined, standings: [{ teamId: 'A', rank: 1 }, { teamId: 'B', rank: 2 }] } }
  const award = awardsForCompetition('league', 'S1', teams, [transferred], matches, [], models)
  const live = competitionAwardResult('league', 'S1', teams, [transferred], matches, [], models)

  assert.equal(award.complete, false)
  assert.equal(award.mvp.playerId, transferred.id)
  assert.equal(award.mvp.value, 6.5)
  assert(Math.abs(award.mvp.awardScore - 6.7) < 1e-12)
  assert.equal(award.bestXI.find(slot => slot.playerId === transferred.id).teamId, 'A')
  assert.equal(live.bestPlayerId, transferred.id)
  assert.deepEqual(live.bestXI, award.bestXI)
})

test('season award domain exposes live shared Best Player and Best XI without changing raw rating', () => {
  const striker = player('season-striker')
  const teams = [{ id: 'A', name: 'Alpha', shortName: 'A' }, { id: 'B', name: 'Beta', shortName: 'B' }]
  const match = { ...leagueMatch('season-live', 1, [appearance(striker)]), events: [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: striker.id }] }
  const award = seasonAwards('S1', teams, [striker], [match], [])

  assert.equal(award.complete, false)
  assert.equal(award.ballon.playerId, striker.id)
  assert.equal(award.bestXI.find(slot => slot.playerId === striker.id).teamId, 'A')
  assert(Math.abs((award.ballon.awardScore - award.ballon.value) - .26) < 1e-12)
})

test('an out-of-bracket historical Cup team receives no current-stage achievement bonus', () => {
  const striker = player('cup-outsider', 'X')
  const match = { ...leagueMatch('cup-outsider-match', 1, [appearance(striker, 'X')]), competitionType: 'cup', competitionStage: 'stage7', homeTeamId: 'X', awayTeamId: 'Y' }
  const models = { cup: { stage: 'stage7', activeTeamIds: ['A'], eliminatedAtByTeam: {}, championId: undefined, runnerUpId: undefined } }
  const award = awardsForCompetition('cup', 'S1', [{ id: 'A', name: 'Alpha', shortName: 'A' }], [striker], [match], [], models)

  assert.equal(award.mvp.playerId, striker.id)
  assert.equal(award.mvp.awardScore, award.mvp.value)
})

test('short-window candidates carry no achievement bonus', () => {
  const striker = player('short-window')
  const match = { ...leagueMatch('short-window-match', 1, [appearance(striker)]), events: [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: striker.id }] }
  const candidate = awardCandidatesForScope([striker], [match], 'monthly')[0]
  assert.equal(candidate.selectionScore, candidate.average)
})

test('unfinished Cup and Champions finals award only already-reached progress, never winner or runner-up', () => {
  const striker = player('progress-striker')
  const cupMatch = { ...leagueMatch('cup-final-progress', 1, [appearance(striker)]), competitionType: 'cup', competitionStage: 'stage7' }
  const cup = awardsForCompetition('cup', 'S1', [{ id: 'A', name: 'Alpha', shortName: 'A' }], [striker], [cupMatch], [], {
    cup: { stage: 'final', activeTeamIds: ['A', 'B'], eliminatedAtByTeam: {}, championId: undefined, runnerUpId: undefined },
  })
  assert(Math.abs((cup.mvp.awardScore - cup.mvp.value) - .035) < 1e-12)

  const championsMatch = { ...leagueMatch('champions-final-progress', 1, [appearance(striker)]), competitionType: 'champions', competitionStage: 'final' }
  const champions = awardsForCompetition('champions', 'S1', [{ id: 'A', name: 'Alpha', shortName: 'A' }], [striker], [championsMatch], [], {
    champions: { currentStage: 'final', championId: undefined, runnerUpId: undefined, rounds: { roundOf16: [], quarterFinal: [], semiFinal: [], final: [{ teamIds: ['A', 'B'] }] } },
  })
  assert(Math.abs((champions.mvp.awardScore - champions.mvp.value) - .035) < 1e-12)
})

test('award selection leaves canonical match rating and MOM untouched', () => {
  const striker = player('non-mutating')
  const match = { ...leagueMatch('non-mutating-match', 1, [appearance(striker)]), events: [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: striker.id }] }
  const beforeRating = ratePlayerMatch(match, striker).raw
  const beforeMom = getMatchManOfTheMatch(match, [striker])
  awardsForCompetition('league', 'S1', [{ id: 'A', name: 'Alpha', shortName: 'A' }], [striker], [match], [], { league: { complete: false, standings: [{ teamId: 'A', rank: 1 }] } })
  assert.equal(ratePlayerMatch(match, striker).raw, beforeRating)
  assert.equal(getMatchManOfTheMatch(match, [striker]), beforeMom)
})

test('in-progress selections stay out of official Records History publication', () => {
  const striker = player('history-preview')
  const teams = [{ id: 'A', name: 'Alpha', shortName: 'A' }, { id: 'B', name: 'Beta', shortName: 'B' }]
  const match = leagueMatch('history-preview-match', 1, [appearance(striker)])
  const history = historyAwardsForSeason(teams, [striker], [match], [], 'S1', 'league')

  assert.equal(history[0].player, undefined)
  assert.equal(history[0].goalkeeper, undefined)
})

test('League Season Best XI renders the canonical scored competition result', () => {
  const screen = fs.readFileSync('src/screens/CompetitionScreen.tsx', 'utf8')
  assert.match(screen, /competitionAwardResult\('league', season, teams, players, matches, \[\], \{ league \}\)/)
})

test('Best XI cache is stable for unchanged sources and rebuilds for a replacement match collection', () => {
  const leftBack = player('cache-lb', 'A', 'LB')
  const players = [leftBack]
  const matches = [leagueMatch('cache-1', 1, [appearance(leftBack)])]
  const first = unifiedBestEleven(players, matches, 'S1')
  assert.strictEqual(unifiedBestEleven(players, matches, 'S1'), first)
  assert.notStrictEqual(unifiedBestEleven(players, [...matches], 'S1'), first)
})
