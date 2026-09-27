const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { legacyOpponentSot, opponentSot } = require('../src/engine/opponentSot.ts')
const { ratePlayerMatch } = require('../src/engine/rating.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { combinationStats } = require('../src/engine/analytics.ts')
const { leagueCompetition, cupCompetition, compareChampionsSeriesRow } = require('../src/engine/competition.ts')
const { teamMetrics } = require('../src/engine/teamMetrics.ts')

const player = (id, position, teamId = 'A') => ({ id, name: id, displayName: id, teamId, position, number: 1 })
const appearance = (p, role = 'starter') => ({ playerId: p.id, teamId: p.teamId, role, position: p.position, matchPosition: p.position })
const save = (id, teamId, playerId, count) => ({ id, type: 'save', minute: 20, teamId, playerId, count })
const baseMatch = (players, events, extra = {}) => ({
  id: extra.id ?? 'manual-sot', season: 'S1', competitionType: extra.competitionType ?? 'league', competitionStage: extra.competitionStage ?? 'regular', matchDay: 1,
  date: '2026-01-01', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: players.map(item => appearance(item)), events, ...extra,
})

test('manual SOT changes defensive rating, player SOT ranking, Records, and combination analytics without treating goals as extra SOT', () => {
  const cb1 = player('cb1', 'CB'), cb2 = player('cb2', 'CB'), aGk = player('a-gk', 'GK'), bGk = player('b-gk', 'GK', 'B')
  const manual = baseMatch([cb1, cb2, aGk, bGk], [save('a-save', 'A', aGk.id, 5), save('b-save', 'B', bGk.id, 3)], { halftimeOpponentSot: 0, fulltimeOpponentSot: 1 })
  const legacy = { ...manual, id: 'legacy-sot', halftimeOpponentSot: undefined, fulltimeOpponentSot: undefined }
  assert.equal(legacyOpponentSot(manual, 'A'), 5)
  assert.equal(opponentSot(manual, 'A'), 1)
  assert.equal(opponentSot(legacy, 'A'), 5)
  assert(ratePlayerMatch(manual, cb1).noConceded > ratePlayerMatch(legacy, cb1).noConceded)

  const manualRanking = buildGlobalRankingData([cb1], [manual], { seasons: ['S1'], teams: [], positions: [] }, 'sotAllowed')[0]
  const legacyRanking = buildGlobalRankingData([cb1], [legacy], { seasons: ['S1'], teams: [], positions: [] }, 'sotAllowed')[0]
  assert.deepEqual([manualRanking.sotAllowedTotal, rankGlobalRankingRows([manualRanking], [cb1], 'sotAllowed')[0].value], [1, 1])
  assert.deepEqual([legacyRanking.sotAllowedTotal, rankGlobalRankingRows([legacyRanking], [cb1], 'sotAllowed')[0].value], [5, 5])

  const manualCombination = combinationStats([cb1, cb2], [manual], {}, 'cb')[0]
  const legacyCombination = combinationStats([cb1, cb2], [legacy], {}, 'cb')[0]
  assert.deepEqual([manualCombination.weightedOpponentSot, manualCombination.startingOpponentSot], [1, 1])
  assert.deepEqual([legacyCombination.weightedOpponentSot, legacyCombination.startingOpponentSot], [5, 5])

  // Records keeps manual SOT canonical while its actual-save record remains an
  // independent goalkeeper statistic.
  assert.deepEqual([teamMetrics({ id: 'A', name: 'A' }, [manual]).opponentSot, teamMetrics({ id: 'A', name: 'A' }, [manual]).saves], [1, 5])
})

test('League, Cup, and Champions SOT tie-breaks use the same manual whole-match SOT', () => {
  const aGk = player('a-gk', 'GK'), bGk = player('b-gk', 'GK', 'B')
  const manual = baseMatch([aGk, bGk], [save('a-save', 'A', aGk.id, 5), save('b-save', 'B', bGk.id, 3)], { halftimeOpponentSot: 0, fulltimeOpponentSot: 1 })
  const legacy = { ...manual, id: 'legacy-tiebreak', halftimeOpponentSot: undefined, fulltimeOpponentSot: undefined }
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  assert.deepEqual(leagueCompetition(teams, [manual], 'S1').standings.map(row => row.teamId), ['A', 'B'])
  assert.deepEqual(leagueCompetition(teams, [legacy], 'S1').standings.map(row => row.teamId), ['B', 'A'])

  const cupTeams = Array.from({ length: 16 }, (_, index) => ({ id: index === 0 ? 'A' : index === 1 ? 'B' : `T${index}`, name: `T${index}` }))
  assert.deepEqual(cupCompetition(cupTeams, [{ ...manual, competitionType: 'cup', competitionStage: 'stage1' }], 'S1').standings.slice(0, 2).map(row => row.teamId), ['A', 'B'])
  assert.deepEqual(cupCompetition(cupTeams, [{ ...legacy, competitionType: 'cup', competitionStage: 'stage1' }], 'S1').standings.slice(0, 2).map(row => row.teamId), ['B', 'A'])

  const aChampions = { ...manual, id: 'a-champions', competitionType: 'champions', homeTeamId: 'A', awayTeamId: 'X' }
  const bChampions = { ...manual, id: 'b-champions', teamId: 'B', homeTeamId: 'B', awayTeamId: 'X', appearances: [appearance(bGk)], events: [save('b-save-only', 'B', bGk.id, 3)], halftimeOpponentSot: undefined, fulltimeOpponentSot: undefined }
  assert.equal(compareChampionsSeriesRow('A', aChampions, 'B', bChampions, []), 'A')
  assert.equal(compareChampionsSeriesRow('A', { ...aChampions, halftimeOpponentSot: undefined, fulltimeOpponentSot: undefined }, 'B', bChampions, []), 'B')
})

test('editing an old legacy match to a valid manual pair rebuilds derived rating and SOT output', () => {
  const cb = player('cb', 'CB'), gk = player('gk', 'GK')
  const legacy = baseMatch([cb, gk], [save('a-save', 'A', gk.id, 5)])
  const edited = { ...legacy, halftimeOpponentSot: 0, fulltimeOpponentSot: 1 }
  const before = buildGlobalRankingData([cb], [legacy], { seasons: ['S1'], teams: [], positions: [] }, 'sotAllowed')[0]
  const after = buildGlobalRankingData([cb], [edited], { seasons: ['S1'], teams: [], positions: [] }, 'sotAllowed')[0]
  assert.equal(rankGlobalRankingRows([before], [cb], 'sotAllowed')[0].value, 5)
  assert.equal(rankGlobalRankingRows([after], [cb], 'sotAllowed')[0].value, 1)
  assert.notEqual(ratePlayerMatch(legacy, cb).raw, ratePlayerMatch(edited, cb).raw)
})
