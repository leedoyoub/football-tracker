const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { canonicalScheduleOrdinal, competitionIdentityForMatch, freezeCompetitionAssignment, normalizeMatchCompetitionIdentity } = require('../src/engine/competitionContext.ts')
const { competitionAssignment, competitionMatches } = require('../src/engine/competition.ts')
const { getTeamMatches, getNextMatchDayForTeam } = require('../src/engine/match.ts')
const { deserializeCloudEntity } = require('../src/lib/cloudMatch.ts')

const base = (id, overrides = {}) => ({
  id, season: 'Season 1', teamId: 'T1', homeTeamId: 'T1', awayTeamId: 'T2', competitionType: 'league', competitionStage: 'regular', matchDay: 4,
  date: '2026-09-18', duration: 90, appearances: [], events: [], ...overrides,
})

test('v2.2.13 validates an assignment before preferring it and repairs deterministic Cup S1 ordinal metadata idempotently', () => {
  const corrupted = base('cup-s1', {
    competitionType: 'cup', competitionStage: 'stage1', matchDay: 4,
    competitionAssignment: { competitionType: 'cup', season: 'Season 1', teamId: 'T1', stage: 'stage1', matchDay: 4, opponentTeamId: 'T2' },
    events: [{ id: 'goal', type: 'goal', minute: 90, teamId: 'T1', playerId: 'P1' }],
  })
  const repaired = normalizeMatchCompetitionIdentity(corrupted)
  assert.equal(competitionIdentityForMatch(repaired).matchDay, 1)
  assert.equal(repaired.matchDay, 1)
  assert.equal(repaired.competitionAssignment.matchDay, 1)
  assert.deepEqual(repaired.events, corrupted.events)
  assert.deepEqual(normalizeMatchCompetitionIdentity(repaired), repaired)
})

test('v2.2.13 uses a structurally valid assignment consistently when legacy top-level fields conflict', () => {
  const conflicting = base('conflicting', {
    competitionType: 'league', competitionStage: 'regular', matchDay: 9,
    competitionAssignment: { competitionType: 'cup', season: 'Season 1', teamId: 'T1', stage: 'stage2', matchDay: 2, opponentTeamId: 'T2' },
  })
  assert.equal(competitionIdentityForMatch(conflicting).competitionType, 'cup')
  assert.deepEqual(competitionMatches([conflicting], 'Season 1', 'cup'), [conflicting])
  assert.deepEqual(competitionMatches([conflicting], 'Season 1', 'league'), [])
})

test('v2.2.13 derives tournament ordinals from format instead of corrupted historical raw values', () => {
  const corrupted = base('cup-s1', {
    competitionType: 'cup', competitionStage: 'stage1', matchDay: 4,
    competitionAssignment: { competitionType: 'cup', season: 'Season 1', teamId: 'T1', stage: 'stage1', matchDay: 4, opponentTeamId: 'T2' },
  })
  assert.deepEqual(getNextMatchDayForTeam('T1', [corrupted], [], 'cup', 'Season 1'), { season: 'Season 1', matchDay: 2 })
})

test('v2.2.13 removes stale pairing and series metadata when canonical identity has none', () => {
  const staleLeague = base('stale-league', { competitionPairingId: 'final:0', competitionSeriesGame: 2 })
  const normalized = normalizeMatchCompetitionIdentity(staleLeague)
  assert.equal(normalized.competitionPairingId, undefined)
  assert.equal(normalized.competitionSeriesGame, undefined)
  assert.equal(normalized.competitionAssignment.competitionType, 'league')
})

test('v2.2.13 rejects malformed assignment stage/type combinations before using the legacy identity', () => {
  const malformed = base('bad-champions', {
    competitionAssignment: { competitionType: 'champions', season: 'Season 1', teamId: 'T1', stage: 'stage1', pairingId: 'roundOf16:0', seriesGame: 1, matchDay: 1, opponentTeamId: 'T2' },
  })
  assert.equal(competitionIdentityForMatch(malformed).competitionType, 'league')
})

test('v2.2.13 orders mixed-competition team history by actual chronology rather than competition schedule ordinal', () => {
  const league = base('league-later', { competitionType: 'league', matchDay: 2, date: '2026-09-20' })
  const cup = base('cup-earlier', { competitionType: 'cup', competitionStage: 'stage1', matchDay: 1, date: '2026-09-18' })
  assert.deepEqual(getTeamMatches([league, cup], 'T1').map(match => match.id), ['cup-earlier', 'league-later'])
})

const championsTeams = Array.from({ length: 16 }, (_, index) => ({ id: `C${index}`, name: `C${index}` }))
const championsDraw = { id: 'champions:Season 1', kind: 'champions-draw', season: 'Season 1', teamIds: championsTeams.map(team => team.id) }
const championsGame = (id, teamId, stage, pairingId, seriesGame, matchDay, goals = 1) => ({
  id, season: 'Season 1', teamId, homeTeamId: teamId, awayTeamId: `opponent:${id}`,
  competitionType: 'champions', competitionStage: stage, competitionPairingId: pairingId, competitionSeriesGame: seriesGame, matchDay,
  competitionAssignment: freezeCompetitionAssignment({ competitionType: 'champions', season: 'Season 1', teamId, stage, pairingId, seriesGame, opponentTeamId: `opponent:${id}`, matchDay }),
  date: '2026-09-18', duration: 90, appearances: [], events: Array.from({ length: goals }, (_, index) => ({ id: `${id}:goal:${index}`, type: 'goal', minute: index + 1, teamId })),
})

function completedChampionsStage(teamIds, stage, startMatchDay) {
  const required = stage === 'final' ? 2 : 3
  return teamIds.flatMap((teamId, index) => Array.from({ length: required }, (_, gameIndex) => championsGame(
    `${stage}:${teamId}:${gameIndex + 1}`, teamId, stage, `${stage}:${Math.floor(index / 2)}`, gameIndex + 1, startMatchDay + gameIndex,
    index % 2 === 0 ? 1 : 0,
  )))
}

test('v2.2.13 maps every Champions stage to its cumulative schedule ordinal including the legacy final replay', () => {
  assert.deepEqual(
    ['roundOf16', 'quarterFinal', 'semiFinal'].flatMap(stage => [1, 2, 3].map(game => canonicalScheduleOrdinal('champions', stage, game))),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  )
  assert.deepEqual([1, 2].map(game => canonicalScheduleOrdinal('champions', 'final', game)), [10, 11])
  assert.equal(canonicalScheduleOrdinal('champions', 'finalReplay'), 12)
})

test('v2.2.13 preserves a canonical historical Champions QF fixture and repairs only a stale ordinal through normalization and cloud hydration', () => {
  const canonical = championsGame('qf-canonical', 'C0', 'quarterFinal', 'quarterFinal:0', 1, 4)
  assert.deepEqual(competitionIdentityForMatch(canonical), canonical.competitionAssignment)
  assert.equal(normalizeMatchCompetitionIdentity(canonical), canonical)
  assert.equal(deserializeCloudEntity(canonical).matchDay, 4)

  const corrupted = { ...canonical, id: 'qf-corrupted', matchDay: 8, competitionAssignment: { ...canonical.competitionAssignment, matchDay: 8 } }
  const repaired = normalizeMatchCompetitionIdentity(corrupted)
  assert.equal(repaired.matchDay, 4)
  assert.equal(repaired.competitionAssignment.matchDay, 4)
})

test('v2.2.13 aligns next-match numbering and fresh Champions assignments with cumulative stage ordinals', () => {
  const r16 = completedChampionsStage(championsDraw.teamIds, 'roundOf16', 1)
  assert.deepEqual(getNextMatchDayForTeam('C0', r16, [], 'champions', 'Season 1'), { season: 'Season 1', matchDay: 4 })
  const qf = competitionAssignment('champions', 'Season 1', 'C0', championsTeams, r16, championsDraw, [])
  assert.deepEqual({ stage: qf.stage, seriesGame: qf.seriesGame, matchDay: canonicalScheduleOrdinal('champions', qf.stage, qf.seriesGame) }, { stage: 'quarterFinal', seriesGame: 1, matchDay: 4 })
  const qfMatches = [...r16, ...completedChampionsStage(['C0', 'C2', 'C4', 'C6', 'C8', 'C10', 'C12', 'C14'], 'quarterFinal', 4)]
  assert.deepEqual(getNextMatchDayForTeam('C0', qfMatches, [], 'champions', 'Season 1'), { season: 'Season 1', matchDay: 7 })
  const sf = competitionAssignment('champions', 'Season 1', 'C0', championsTeams, qfMatches, championsDraw, [])
  assert.deepEqual({ stage: sf.stage, seriesGame: sf.seriesGame, matchDay: canonicalScheduleOrdinal('champions', sf.stage, sf.seriesGame) }, { stage: 'semiFinal', seriesGame: 1, matchDay: 7 })
  const sfMatches = [...qfMatches, ...completedChampionsStage(['C0', 'C4', 'C8', 'C12'], 'semiFinal', 7)]
  assert.deepEqual(getNextMatchDayForTeam('C0', sfMatches, [], 'champions', 'Season 1'), { season: 'Season 1', matchDay: 10 })
  const final = competitionAssignment('champions', 'Season 1', 'C0', championsTeams, sfMatches, championsDraw, [])
  assert.deepEqual({ stage: final.stage, seriesGame: final.seriesGame, matchDay: canonicalScheduleOrdinal('champions', final.stage, final.seriesGame) }, { stage: 'final', seriesGame: 1, matchDay: 10 })
})
