const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { buildSeasonAnalytics, monthlyAwardForBlock } = require('../src/engine/seasonAnalytics.ts')
const { deriveNews } = require('../src/engine/news.ts')

const teams = [{ id: 'A', name: 'Alpha', shortName: 'A' }, { id: 'B', name: 'Beta', shortName: 'B' }]
const player = (position = 'ST', teamId = 'A') => ({ id: 'p', name: 'Player', displayName: 'Player', fullName: 'Player One', number: 9, position, teamId })
const match = (day, p = player(), partial = false) => ({
  id: `m${day}`, season: 'S1', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90,
  competitionType: 'league', competitionStage: 'regular', homeTeamId: 'A', awayTeamId: 'B',
  ...(partial ? { teamId: 'A' } : {}),
  appearances: [{ playerId: p.id, teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }],
  events: [{ id: `g${day}`, type: 'goal', minute: 20, teamId: 'A', playerId: p.id }],
})

test('active monthly award follows the highest recorded League matchday while finalized history stays separate', () => {
  const p = player()
  assert.equal(buildSeasonAnalytics(teams, [p], [], 'S1').activeMonthlyAwards, undefined)

  const md1 = buildSeasonAnalytics(teams, [p], [match(1, p)], 'S1')
  assert.equal(md1.activeMonthlyAwards.block.id, 1)
  assert.equal(md1.activeMonthlyAwards.finalized, false)
  assert.equal(md1.monthlyAwards.size, 0)

  const block1 = [1, 2, 3].map(day => match(day, p))
  const finalized = buildSeasonAnalytics(teams, [p], block1, 'S1')
  assert.equal(finalized.activeMonthlyAwards.block.id, 1)
  assert.equal(finalized.activeMonthlyAwards.finalized, true)
  assert.strictEqual(finalized.activeMonthlyAwards, finalized.monthlyAwards.get(1))
  assert.equal(monthlyAwardForBlock(teams, [p], block1, 'S1', 1).finalized, true)

  const next = buildSeasonAnalytics(teams, [p], [...block1, match(4, p, true)], 'S1')
  assert.equal(next.activeMonthlyAwards.block.id, 2)
  assert.equal(next.activeMonthlyAwards.finalized, false)
  assert.equal(next.monthlyAwards.size, 1)
})

test('unfinished blocks never enter finalized history or award News', () => {
  const p = player()
  const matches = [match(1, p), match(2, p), match(3, p, true)]
  const analytics = buildSeasonAnalytics(teams, [p], matches, 'S1')
  assert.equal(analytics.activeMonthlyAwards.block.id, 1)
  assert.equal(analytics.monthlyAwards.size, 0)
  assert.equal(monthlyAwardForBlock(teams, [p], matches, 'S1', 1), undefined)
  assert.equal(deriveNews([p], teams, matches, []).some(item => item.id.startsWith('award:player-of-month:')), false)
})

test('finalized monthly Best XI retains historical position and team after registration changes', () => {
  const original = player('ST', 'A')
  const matches = [1, 2, 3].map(day => match(day, original))
  const before = monthlyAwardForBlock(teams, [original], matches, 'S1', 1)
  const changed = { ...original, position: 'GK', teamId: 'B' }
  const after = monthlyAwardForBlock(teams, [changed], matches, 'S1', 1)
  assert.deepEqual(after.bestXI, before.bestXI)
  const selected = after.bestXI.find(slot => slot.playerId === original.id)
  assert.equal(selected.position, 'LW')
  assert.equal(selected.teamId, 'A')
})

test('shared award presentation is always expanded and Records History wires player navigation', () => {
  const component = fs.readFileSync(require.resolve('../src/components/AwardBestXI.tsx'), 'utf8')
  const history = fs.readFileSync(require.resolve('../src/screens/RecordsHistory.tsx'), 'utf8')
  const records = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  assert(!component.includes('<details'))
  assert(!component.includes('open ='))
  assert(component.includes('<Pitch'))
  assert(history.includes('<AwardBestXI'))
  assert(history.includes('onPlayerOpen'))
  assert(records.includes('onNavigate={onNavigate}'))
})
