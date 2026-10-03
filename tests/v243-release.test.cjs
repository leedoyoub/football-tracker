const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { matchContributionSequences } = require('../src/engine/matchContributionSequences.ts')
const { competitionProgressLabels, formatChampionsStage, formatContributionDetail, formatContributionOrdinals, formatCupProgress, formatLeagueProgress, formatOrdinal } = require('../src/lib/competitionProgressPresentation.ts')
const { seasonAwards } = require('../src/engine/awards.ts')
const { APP_VERSION } = require('../src/config.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')

const contribution = (playerId, assistPlayerId) => ({ type: 'goal', playerId, assistPlayerId })
const match = (id, date, competitionType, events, season = 'Season 1') => ({
  id, date, season, competitionType, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', duration: 90,
  events: events.map((event, index) => ({ id: `${id}-${index}`, minute: 10 + index, teamId: 'A', ...event })),
  appearances: [...new Set(events.flatMap(event => [event.playerId, event.assistPlayerId]).filter(Boolean))].map(playerId => ({ playerId, teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' })),
})

test('v2.4.4 release metadata preserves rating revision 11', () => {
  const packageJson = require('../package.json')
  const lockfile = require('../package-lock.json')
  assert.equal(packageJson.version, '2.4.4')
  assert.equal(lockfile.version, '2.4.4')
  assert.equal(lockfile.packages[''].version, '2.4.4')
  assert.equal(APP_VERSION, '2.4.4')
  assert.equal(RATING_ENGINE_REVISION, 11)
})

test('contribution ordinals are scoped by season and competition and follow canonical chronology', () => {
  const history = [
    match('cup', '2026-01-04', 'cup', [contribution('P1')]),
    match('league-2', '2026-01-03', 'league', [contribution('P1', 'P2'), contribution('P1')]),
    match('champions', '2026-01-02', 'champions', [contribution('P1')]),
    match('league-1', '2026-01-01', 'league', [contribution('P1', 'P2')]),
    match('new-season', '2026-01-05', 'league', [contribution('P1')], 'Season 2'),
  ]

  assert.deepEqual(matchContributionSequences(history, 'league-2'), {
    P1: { goals: [2, 3], assists: [] },
    P2: { goals: [], assists: [2] },
  })
  assert.deepEqual(matchContributionSequences(history, 'new-season'), { P1: { goals: [1], assists: [] } })
})

test('contribution ordinals exclude own goals, number goals and assists, and recalculate after history edits', () => {
  const first = match('first', '2026-01-01', 'league', [contribution('P1', 'P1'), { ...contribution('P1'), ownGoal: true }])
  const current = match('current', '2026-01-02', 'league', [contribution('P1', 'P1'), contribution('P1', 'P2')])
  const history = [current, first]
  assert.deepEqual(matchContributionSequences(history, 'current'), { P1: { goals: [2, 3], assists: [2] }, P2: { goals: [], assists: [1] } })
  assert.deepEqual(matchContributionSequences([current], 'current'), { P1: { goals: [1, 2], assists: [1] }, P2: { goals: [], assists: [1] } })
  assert.equal(Object.hasOwn(current, 'goalOrdinals'), false)
  assert.equal(Object.hasOwn(current, 'assistOrdinals'), false)
})

test('dashboard progress labels and competition stages use shared user-facing formatting', () => {
  assert.deepEqual(competitionProgressLabels(), { league: '⚽ League', cup: '🏆 Cup', champions: '🌟 Champions' })
  assert.equal(formatLeagueProgress({ complete: false, matchdayProgress: 5 }), 'MD 5 / 30')
  assert.equal(formatLeagueProgress({ complete: true, matchdayProgress: 30 }), 'Completed · 30 / 30')
  assert.equal(formatCupProgress({ complete: false, stage: 'stage4' }), 'Stage 4')
  assert.equal(formatCupProgress({ complete: false, stage: 'final' }), 'Final')
  assert.equal(formatCupProgress({ complete: true, stage: 'final' }), 'Completed')
  assert.equal(formatChampionsStage('roundOf16'), 'Round of 16')
  assert.equal(formatChampionsStage('quarterFinal'), 'Quarter-final')
  assert.equal(formatChampionsStage('semiFinal'), 'Semi-final')
  assert.equal(formatChampionsStage('final'), 'Final')
  assert.equal(formatChampionsStage('finalReplay'), 'Final Replay')
  assert.equal(formatChampionsStage('roundOf16').includes('round Of16'), false)
  assert.equal(formatContributionOrdinals([5, 6]), '5th\u20136th')
})

test('English contribution ordinals use the correct suffix around teen exceptions', () => {
  for (const [value, expected] of [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [10, '10th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [23, '23rd'], [111, '111th']]) {
    assert.equal(formatOrdinal(value), expected)
  }
})

test('contribution details use ordinal football wording and plural ranges', () => {
  for (const [goals, assists, expected] of [
    [[8], [], '8th goal'],
    [[], [3], '3rd assist'],
    [[8], [3], '8th goal \u00B7 3rd assist'],
    [[12], [2], '12th goal \u00B7 2nd assist'],
    [[5, 6], [], '5th\u20136th goals'],
    [[10, 11, 12], [], '10th\u201312th goals'],
    [[], [4, 5], '4th\u20135th assists'],
    [[5, 6], [3], '5th\u20136th goals \u00B7 3rd assist'],
    [[8], [4, 5], '8th goal \u00B7 4th\u20135th assists'],
  ]) {
    assert.equal(formatContributionDetail(goals, assists), expected)
  }
  assert.equal(formatContributionDetail([], []), undefined)
})

test('seasonAwards reuses the result for identical source identities and invalidates on match replacement', () => {
  const teams = [{ id: 'A', name: 'A', shortName: 'A' }, { id: 'B', name: 'B', shortName: 'B' }]
  const players = [{ id: 'P', name: 'Player', displayName: 'Player', teamId: 'A', position: 'ST', number: 9 }]
  const scorer = { id: 'goal-1', type: 'goal', minute: 12, teamId: 'A', playerId: 'P' }
  const matches = [{ id: 'match-1', season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 0, appearances: [{ playerId: 'P', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }], events: [scorer] }]
  const states = []
  const first = seasonAwards('Season 1', teams, players, matches, states)
  assert.strictEqual(seasonAwards('Season 1', teams, players, matches, states), first)
  assert.equal(first.goldenBoot.value, 1)
  const changedMatch = { ...matches[0], events: [scorer, { ...scorer, id: 'goal-2', minute: 32 }] }
  const changed = seasonAwards('Season 1', teams, players, [changedMatch], states)
  assert.notStrictEqual(changed, first)
  assert.equal(changed.goldenBoot.value, 2)
})

test('Home uses Store revision-aware selectors and keeps ranking metric presentation separate', () => {
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  assert.match(home, /selectLeagueCompetition\(competitionCacheOwner/)
  assert.match(home, /selectCupCompetition\(competitionCacheOwner/)
  assert.match(home, /selectChampionsCompetition\(competitionCacheOwner/)
  assert.match(home, /rankGlobalRankingRows\(rankingIndex, players, metric\)/)
  assert.equal(home.includes('leagueCompetition(teams, matches'), false)
  assert.equal(home.includes('cupCompetition(teams, matches'), false)
  assert.equal(home.includes('championsCompetition(competitionStates'), false)
})

test('Team Detail guards tab-specific heavy derivations behind the active tab', () => {
  const team = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  assert.match(team, /if \(tab !== 'players'\) return undefined[\s\S]*?teamBestEleven/)
  assert.match(team, /tab === 'matches' \? recentMatches/)
  assert.match(team, /tab === 'overview' \? buildSeasonAnalytics/)
  assert.doesNotMatch(team, /best\.slots\.forEach\(/)
})

test('What Changed wires the contribution formatter and an expanded middle-dot count', () => {
  const detail = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  assert.match(detail, /matchContributionSequences\(matches, matchId\)/)
  assert.match(detail, /formatContributionDetail\(sequence\.goals, sequence\.assists\)/)
  assert(detail.includes(String.raw`What Changed{open ? ' \u00B7 ' + changeCount`))
  assert.match(detail, /row\.competition/)
  for (const path of ['../src/screens/MatchDetailScreen.tsx', '../src/lib/competitionProgressPresentation.ts', '../src/engine/matchContributionSequences.ts', '../tests/v243-release.test.cjs']) {
    assert.equal(fs.readFileSync(require.resolve(path), 'utf8').includes('\uFFFD'), false, path)
  }
})

test('award candidate calculation indexes team matches once and season analytics keeps identity caching', () => {
  const awards = fs.readFileSync(require.resolve('../src/engine/awards.ts'), 'utf8')
  const analytics = fs.readFileSync(require.resolve('../src/engine/seasonAnalytics.ts'), 'utf8')
  assert.match(awards, /const gamesByTeam = new Map/)
  assert.match(awards, /RATING_ENGINE_REVISION/)
  assert.match(analytics, /const existing = bySeason\.get\(key\); if \(existing\) return existing/)
})

test('SOT edits allow a temporary HT greater than FT, preserve the draft, and validate before durable save', () => {
  const screen = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  const apply = screen.slice(screen.indexOf('function applyOpponentSot'), screen.indexOf('function changeHalftimeOpponentSot'))
  const save = screen.slice(screen.indexOf('async function save()'), screen.indexOf('return ('))
  assert.match(apply, /setOpponentSotDraft\(next\)/)
  assert.doesNotMatch(apply, /validateManualOpponentSot/)
  assert.match(screen, /saveDraftMatch\(draftCheckpoint\)/)
  assert.match(save, /const manualSot = validateManualOpponentSot\(finalMatchData, selectedTeamId\)/)
  assert.ok(save.indexOf("manualSot.kind === 'invalid'") < save.indexOf('saveMatchDurably(finalMatchData)'))
  assert.match(save, /setSaveError\(manualSot.message\)[\s\S]*?return false/)
  assert.match(save, /onComplete\(\{ name: 'match', id: draftId \}\)/)
})
