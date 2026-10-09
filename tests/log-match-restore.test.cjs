const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  filename,
)

const { TACTICAL_SLOT_DEFINITIONS } = require('../src/engine/tacticalSlots.ts')
const { restoreDraft } = require('../src/lib/editorRestore.ts')
const { kickoffConfirmedForEditor } = require('../src/lib/draftLifecycle.ts')
const { validateState } = require('../src/lib/validation.ts')

const teamId = 'T'
const slots = TACTICAL_SLOT_DEFINITIONS
const players = slots.slice(0, 10).map((slot, index) => ({ id: `P${index}`, teamId, teamIds: [teamId], name: `Player ${index}`, number: index + 1, position: slot.ratingPosition }))
const partialDraft = () => ({
  id: 'DRAFT', season: 'S1', competitionType: 'league', matchDay: 1, date: '2026-01-01', duration: 90,
  teamId, homeTeamId: teamId, awayTeamId: 'OPP', appearances: [
    ...players.map((player, index) => ({ playerId: player.id, teamId, role: 'starter', position: player.position, matchPosition: player.position, kickoffX: index + 1, kickoffY: index + 2 })),
    { playerId: 'BENCH', teamId, role: 'bench', position: 'CM', matchPosition: 'CM' },
  ],
  events: [],
  kickoffLineup: [],
})

test('10-player Draft restore preserves all starters, empty slots, bench and events', () => {
  const draft = partialDraft()
  const restored = restoreDraft(draft, [...players, { id: 'BENCH', teamId, teamIds: [teamId], name: 'Bench', number: 99, position: 'CM' }])
  assert(restored)
  assert.equal(Object.keys(restored.starters).length, 10)
  assert.equal(restored.draft.homeBench.includes('BENCH'), true)
  assert.deepEqual(restored.draft.events, [])
  assert.equal(restored.draft.slotAssignments[slots[10].id], undefined)
  assert.equal(restored.kickoffConfirmed, false)
})

test('a confirmed kickoff remains confirmed independently of event count and UI step', () => {
  const confirmed = { ...partialDraft(), kickoffConfirmed: true, events: [] }
  assert.equal(kickoffConfirmedForEditor('resume', confirmed), true)
  assert.equal(kickoffConfirmedForEditor('edit', partialDraft()), true)
  assert.equal(kickoffConfirmedForEditor('fresh', confirmed), false)
  assert.equal(kickoffConfirmedForEditor('resume', partialDraft()), false)
  const oldUnconfirmedFullDraft = { ...partialDraft(), kickoffLineup: slots.slice(0, 11).map((slot, index) => ({ id: slot.id, playerId: `P${index}`, ratingPosition: slot.ratingPosition, x: index, y: index })) }
  assert.equal(kickoffConfirmedForEditor('resume', oldUnconfirmedFullDraft), false)
  assert.equal(kickoffConfirmedForEditor('resume', { ...partialDraft(), events: [{ id: 'G1', type: 'goal', teamId, minute: 10 }] }), true)
})

test('a dangling historical player ID is diagnosed and retained without automatic replacement', () => {
  const legacy = partialDraft()
  legacy.appearances[0] = { ...legacy.appearances[0], playerId: 'MISSING-PERMANENT-ID' }
  legacy.events = [{ id: 'G1', type: 'goal', teamId, minute: 10, playerId: 'MISSING-PERMANENT-ID' }]
  const restored = restoreDraft(legacy, [...players, { id: 'BENCH', teamId, name: 'Bench', number: 99, position: 'CM' }])
  assert(restored)
  assert.deepEqual(restored.missingPlayerIds, ['MISSING-PERMANENT-ID'])
  assert.equal(restored.draft.slotAssignments[slots[0].id], 'MISSING-PERMANENT-ID')
  assert.equal(restored.draft.events[0].playerId, 'MISSING-PERMANENT-ID')
})

test('local legacy tolerance preserves dangling appearance references while strict cloud validation stays fail-closed', () => {
  const match = partialDraft()
  match.appearances[0] = { ...match.appearances[0], playerId: 'MISSING-PERMANENT-ID' }
  match.events = []
  const state = { teams: [{ id: teamId, name: teamId }], players, matches: [match] }
  assert.equal(validateState(state), false)
  assert.equal(validateState(state, { allowMissingHistoricalPlayers: true }), true)
})
