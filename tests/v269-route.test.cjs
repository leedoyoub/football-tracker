require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict')
const { loadLastNavigationEntry, LAST_ROUTE_STORAGE_KEY } = require('../src/lib/lastRoute.ts')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const data = performanceFixture(1)
function restore(name, saved) {
  return loadLastNavigationEntry(data, { getItem: key => key === LAST_ROUTE_STORAGE_KEY ? JSON.stringify({ version: 2, view: name === 'records-leaderboard' ? { name, category: 'player', leaderboardId: 'goals' } : { name }, screenState: { name, ...saved } }) : null }).screenState
}
for (const name of ['global-ranking', 'award-race', 'records', 'records-leaderboard']) {
  test(`${name} restores legacy scalar position and deduplicates multi-select IDs`, () => {
    const legacy = restore(name, { positionFilter: 'fb', teamId: data.teams[0].id, filterTeamIds: [data.teams[0].id] })
    assert.deepEqual(legacy.positionFilters, ['lb-rb'])
    if (name === 'global-ranking' || name === 'award-race') assert.deepEqual(legacy.teamIds, [data.teams[0].id])
    const multi = restore(name, { positionFilters: ['st-ss', 'lw-rw', 'st-ss', 'bad'], teamIds: [data.teams[0].id, 'missing', data.teams[0].id], filterTeamIds: [data.teams[0].id, 'missing', data.teams[0].id] })
    assert.deepEqual(multi.positionFilters, ['st-ss', 'lw-rw'])
    assert.deepEqual(multi.teamIds ?? multi.filterTeamIds, [data.teams[0].id])
    assert.deepEqual(restore(name, { positionFilter: 'cam', positionFilters: [] }).positionFilters, [])
  })
}
