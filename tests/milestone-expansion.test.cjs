const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { crossedThresholds, deriveNews, groupMatchChanges } = require('../src/engine/news.ts')

const player = { id: 'p', name: 'Player', displayName: 'Player', position: 'ST', number: 9, teamId: 'a' }
const teams = [{ id: 'a', name: 'Alpha', shortName: 'A' }, { id: 'b', name: 'Beta', shortName: 'B' }]
function game(id, day, goals, assists = 0, type = 'league', season = 'Season 1') { return { id, season, matchDay: day, date: `2026-02-${String(day).padStart(2, '0')}`, competitionType: type, competitionStage: 'regular', duration: 90, homeTeamId: 'a', awayTeamId: 'b', appearances: [{ playerId: 'p', teamId: 'a', role: 'starter', position: 'ST', matchPosition: 'ST' }], events: Array.from({ length: goals }, (_, index) => ({ id: `${id}:g${index}`, type: 'goal', minute: index + 1, teamId: 'a', playerId: 'p', ...(index < assists ? { assistPlayerId: 'p' } : {}) })) } }
const milestones = games => deriveNews([player], teams, games).filter(item => item.milestone)

test('generic milestone threshold helpers cross every required dynamic boundary once', () => {
  assert.deepEqual(crossedThresholds(9, 10, 10, 10), [10]); assert.deepEqual(crossedThresholds(10, 11, 10, 10), []); assert.deepEqual(crossedThresholds(19, 31, 10, 10), [20, 30]); assert.deepEqual(crossedThresholds(39, 41, 20, 20), [40]); assert.deepEqual(crossedThresholds(14, 18, 10, 5), [15])
})

test('attacking milestones are independent by league, cup, champions, season and career scope', () => {
  const items = milestones([game('league', 1, 20), game('cup', 2, 10, 0, 'cup'), game('champions', 3, 10, 0, 'champions')])
  const ids = items.map(item => item.id)
  assert(ids.includes('milestone:p:goals:league:league:Season 1:20')); assert(ids.includes('milestone:p:goals:cup:cup:Season 1:10')); assert(ids.includes('milestone:p:goals:champions:champions:Season 1:10')); assert(ids.includes('milestone:p:goals:season:Season 1:40')); assert(ids.includes('milestone:p:goals:career:40'))
  assert.equal(new Set(ids).size, ids.length)
})

test('balanced milestones use min(goals, assists), group Match Detail presentation, and reconstruct after edits', () => {
  const base = [game('first', 1, 14, 14), game('cross', 2, 1, 4)]
  const items = milestones(base); assert(items.some(item => item.milestone?.type === 'balanced' && item.milestone.threshold === 15 && item.matchId === 'cross'))
  const grouped = groupMatchChanges(items.filter(item => item.matchId === 'cross'), [player]); assert.equal(grouped.length, 1); assert.match(grouped[0].title, /Milestones/)
  assert(!milestones([game('first', 1, 14, 14), game('cross', 2, 0, 4)]).some(item => item.milestone?.type === 'balanced' && item.milestone.threshold === 15))
})

test('season resets while career continues, and stoppage-time scoring remains event-derived', () => {
  const late = game('late', 1, 10, 0, 'league', 'Season 2'); late.appearances = [{ playerId: 'p', teamId: 'a', role: 'bench', position: 'ST', matchPosition: 'ST' }]; late.events.unshift({ id: 'sub', type: 'sub', minute: 92, teamId: 'a', playerInId: 'p', playerOutId: 'other' }); late.events.forEach((event, index) => { if (event.type === 'goal') event.minute = 94 + index })
  const items = milestones([game('old', 1, 10, 0, 'league', 'Season 1'), late])
  assert(items.some(item => item.id === 'milestone:p:goals:league:league:Season 1:10')); assert(items.some(item => item.id === 'milestone:p:goals:league:league:Season 2:10')); assert(items.some(item => item.id === 'milestone:p:goals:career:20'))
})
