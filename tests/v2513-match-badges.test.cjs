require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test } = require('node:test')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { playerSeasonStats } = require('../src/engine/stats.ts')
test('lightweight editor badges match canonical goals/assists across competition, transfers, edits and unused bench', () => {
  const { seasonGoalContributions } = require('../src/engine/seasonGoalContributions.ts')
  const s = performanceFixture(1), team = s.teams[0].id
  for (const type of ['league', 'cup', 'champions']) for (const matches of [s.matches, s.matches.slice(1), s.matches.map((m, i) => i ? m : { ...m, events: [] })]) {
    const actual = seasonGoalContributions(s.players, matches, 'Season 1', team, type)
    for (const player of s.players) {
      const stats = playerSeasonStats(player, s.players, matches, 'Season 1', team, type)
      assert.deepEqual(actual[player.id], { goals: stats.goals, assists: stats.assists }, `${type}:${player.id}`)
    }
  }
})
