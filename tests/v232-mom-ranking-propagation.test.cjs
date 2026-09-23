const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { getMatchManOfTheMatch, ratePlayerMatch } = require('../src/engine/rating.ts')
const { buildGlobalRankingData, rankGlobalRankingRows, unifiedBestEleven } = require('../src/engine/stats.ts')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const { historyTimelineForSeason } = require('../src/engine/historyReadModels.ts')
const { monthlyAwardForBlock } = require('../src/engine/seasonAnalytics.ts')
const { awardsForCompetition, seasonAwards } = require('../src/engine/awards.ts')

const player = (id, position) => ({ id, name: id, displayName: id, fullName: id, teamId: 'A', position, number: 1 })
const app = p => ({ playerId: p.id, teamId: 'A', role: 'starter', position: p.position, matchPosition: p.position })
const cdm = player('cdm', 'CDM'), cam = player('cam', 'CAM')
const players = [cdm, cam]
const teams = [{ id: 'A', name: 'A', shortName: 'A' }, { id: 'B', name: 'B', shortName: 'B' }]
const game = { id: 'm1', season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: players.map(app), events: [{ id: 'goal', type: 'goal', minute: 20, teamId: 'A', assistPlayerId: cam.id }] }
const filters = { seasons: ['S1'], teams: [], positions: [] }

test('revision-10 rating changes propagate through canonical MOM, rankings, Best XI, Records and history', () => {
  assert.equal(ratePlayerMatch(game, cdm).raw.toFixed(2), '7.46')
  assert.equal(ratePlayerMatch(game, cam).raw, 7.25)
  assert.equal(getMatchManOfTheMatch(game, players), cdm.id)
  const rows = buildGlobalRankingData(players, [game], filters, 'rating')
  assert.equal(rankGlobalRankingRows(rows, players, 'rating')[0].playerId, cdm.id)
  assert.equal(rankGlobalRankingRows(rows, players, 'mom')[0].playerId, cdm.id)
  const records = buildPlayerRecordLeaderboards(players, [game])
  assert.equal(records.find(group => group.id === 'mom').rows[0].playerId, cdm.id)
  assert.equal(records.find(group => group.id === 'highest-rating').rows[0].playerId, cdm.id)
  const xi = unifiedBestEleven(players, [game], 'S1')
  assert(xi.slots.some(slot => slot.playerId === cdm.id))
  assert.equal(historyTimelineForSeason(teams, players, [game], [], 'S1').rating.playerId, cdm.id)
})

test('revision-10 candidate remains the canonical rating leader for every scope and current/season Best XI', () => {
  const matches = ['league', 'cup', 'champions'].map((competitionType, index) => ({
    ...game,
    id: `${competitionType}-ranking`,
    competitionType,
    competitionStage: competitionType === 'league' ? 'regular' : competitionType === 'cup' ? 'stage1' : 'roundOf16',
    matchDay: index + 1,
    date: `2026-01-0${index + 1}`,
    events: game.events.map(event => ({ ...event, id: `${competitionType}:${event.id}` })),
  }))
  for (const match of matches) {
    const rows = buildGlobalRankingData(players, [match], filters, 'rating')
    assert.equal(rankGlobalRankingRows(rows, players, 'rating')[0].playerId, cdm.id)
    assert.equal(rankGlobalRankingRows(rows, players, 'mom')[0].playerId, cdm.id)
  }
  const teamRows = buildGlobalRankingData(players, matches, { ...filters, teams: ['A'] }, 'rating')
  assert.equal(rankGlobalRankingRows(teamRows, players, 'rating')[0].playerId, cdm.id)
  const v9CdmRaw = ratePlayerMatch(matches[0], cdm).raw - .30
  assert(v9CdmRaw < ratePlayerMatch(matches[0], cam).raw)
  assert.equal(unifiedBestEleven(players, matches, 'S1', true).slots.find(slot => slot.slot === 'LCM').playerId, cdm.id)
  assert.equal(unifiedBestEleven(players, matches, 'S1').slots.find(slot => slot.slot === 'LCM').playerId, cdm.id)
})

test('revision-10 canonical average feeds finalized monthly award winner and monthly Best XI', () => {
  const matches = [1, 2, 3].map(day => ({
    ...game,
    id: `monthly-${day}`,
    teamId: undefined,
    matchDay: day,
    date: `2026-01-0${day}`,
    events: game.events.map(event => ({ ...event, id: `monthly-${day}:${event.id}` })),
  }))
  const award = monthlyAwardForBlock(teams, players, matches, 'S1', 1)
  assert.equal(award.bestPlayerId, cdm.id)
  assert(award.bestXI.some(slot => slot.playerId === cdm.id))
  assert.equal(award.statsByPlayer[cdm.id].avgRating, buildGlobalRankingData(players, matches, filters, 'rating').find(row => row.playerId === cdm.id).avgRating)
})

test('competition MVP and season Ballon selectors consume the canonical revision-10 average', () => {
  const competition = require('../src/engine/competition.ts')
  const original = competition.competitionSeasonStatus
  competition.competitionSeasonStatus = () => ({
    league: { complete: true, championId: 'A', standings: [{ teamId: 'A', rank: 1 }] },
    cup: { championId: 'A' }, champions: { championId: 'A' }, complete: true,
  })
  try {
    assert.equal(awardsForCompetition('league', 'S1', teams, players, [game], []).mvp.playerId, cdm.id)
    assert.equal(seasonAwards('S1', teams, players, [game], []).ballon.playerId, cdm.id)
  } finally {
    competition.competitionSeasonStatus = original
  }
})
