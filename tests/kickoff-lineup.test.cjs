const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { kickoffFromAssignments, kickoffLineupForMatch, reconstructLegacyKickoffLineup, validateKickoffLineup } = require('../src/engine/kickoffLineup.ts')

test('kickoff snapshot preserves distinct tactical CAM slots despite shared rating semantics', () => {
  const snapshot = kickoffFromAssignments({ GK: 'gk', LB: 'lb', LCB: 'lcb', CB: 'cb', RB: 'rb', LDM: 'ldm', RDM: 'rdm', LCAM: 'lam', CAM: 'cam', RCAM: 'ram', ST: 'st' })
  assert.equal(validateKickoffLineup(snapshot).valid, true)
  assert.deepEqual(snapshot.filter(slot => slot.ratingPosition === 'CAM').map(slot => [slot.id, slot.displayPosition]), [['LCAM', 'LAM'], ['CAM', 'CAM'], ['RCAM', 'RAM']])
  const match = { id: 'modern', season: 'S', matchDay: 1, date: '2026-09-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances: [], events: [], kickoffLineup: snapshot }
  assert.deepEqual(kickoffLineupForMatch(match, 'A').map(slot => slot.id), snapshot.map(slot => slot.id))
})

test('legacy repeated semantic positions receive unused tactical slots without mutation', () => {
  const match = { id: 'legacy', season: 'S', matchDay: 1, date: '2026-09-01', formation: '4-2-1-3', duration: 90, homeTeamId: 'A', awayTeamId: 'B', events: [], appearances: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'ST', 'RW'].map((matchPosition, index) => ({ playerId: `p${index}`, teamId: 'A', position: matchPosition, matchPosition, role: 'starter' })) }
  const before = JSON.stringify(match)
  const lineup = reconstructLegacyKickoffLineup(match, 'A')
  assert.equal(validateKickoffLineup(lineup).valid, true)
  assert.equal(new Set(lineup.map(slot => slot.id)).size, 11)
  assert.equal(new Set(lineup.map(slot => slot.playerId)).size, 11)
  assert.equal(JSON.stringify(match), before)
})
