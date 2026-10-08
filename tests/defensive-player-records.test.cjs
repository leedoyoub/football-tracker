const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')

const players = [
  { id: 'a', name: 'A', teamId: 'A', position: 'CB' },
  { id: 'b', name: 'B', teamId: 'A', position: 'CB' },
  { id: 'c', name: 'C', teamId: 'A', position: 'CDM' },
  { id: 'g', name: 'G', teamId: 'A', position: 'GK' },
]
const games = [1, 2].map(day => ({ id: `m${day}`, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: `2026-01-0${day}`, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: players.map(player => ({ playerId: player.id, teamId: 'A', role: 'starter', position: player.position })), events: [{ id: `goal${day}`, type: 'goal', minute: 20, teamId: 'B' }], halftimeOpponentSot: 1, fulltimeOpponentSot: 2 }))

test('defensive Player Records follow canonical ranking values, filter eligibility and preserve order', () => {
  const scope = { seasons: ['S1'], competition: 'league', teamIds: ['A'], positionFilter: 'all' }
  const records = buildPlayerRecordLeaderboards(players, games, scope)
  const ids = records.map(group => group.id)
  assert.deepEqual(ids.slice(ids.indexOf('ten'), ids.indexOf('saves') + 1), ['ten', 'lowest-sot-90', 'lowest-defender-ga-90', 'clean-sheets', 'saves'])
  assert.equal(ids[ids.indexOf('saves') + 1], 'lowest-gk-ga-90')
  const rows = buildGlobalRankingData(players, games, { seasons: ['S1'], teams: ['A'], positions: [] }, 'rating')
  for (const [groupId, metric] of [['lowest-sot-90', 'sotAllowed'], ['lowest-defender-ga-90', 'defenderGaPer90'], ['lowest-gk-ga-90', 'goalkeeperGaPer90']]) {
    const record = records.find(group => group.id === groupId)
    const ranked = rankGlobalRankingRows(rows, players, metric)
    assert.deepEqual(record.rows.map(row => row.playerId), ranked.map(row => row.playerId))
    assert.deepEqual(record.rows.map(row => row.numeric), ranked.map(row => row.value))
    assert(record.rows.every(row => /\d+\.\d{2} (SOT|GA)\/90/.test(row.value)))
    assert(record.rows.every(row => /minutes/.test(row.detail)))
  }
  assert(!records.find(group => group.id === 'lowest-sot-90').rows.some(row => row.playerId === 'c'))
  assert(!records.find(group => group.id === 'lowest-defender-ga-90').rows.some(row => row.playerId === 'c'))
})
