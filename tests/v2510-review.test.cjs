require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')
const { restoreDraft } = require('../src/lib/editorRestore.ts')
const { validateState } = require('../src/lib/validation.ts')
const root = path.resolve(__dirname, '..')
const slotIds = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW']
const kickoff = kickoffFromAssignments(Object.fromEntries(slotIds.map((slot, i) => [slot, `p${i}`])))
const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
function fixture() {
  return { id: 'review', season: 'S1', competitionType: 'league', matchDay: 1, date: '2026-01-01', duration: 95, teamId: 'A', homeTeamId: 'B', awayTeamId: 'A', homeAway: 'away', kickoffLineup: kickoff,
    appearances: [...kickoff.map(s => ({ playerId: s.playerId, teamId: 'A', position: s.matchPosition, matchPosition: s.matchPosition, role: 'starter' })), { playerId: 'sub', teamId: 'A', position: 'RW', role: 'bench' }], events: [] }
}
function editor(game) {
  const saved = []
  const store = { teams, players: [], matches: [game], competitionStates: [], saveMatchDurably: async match => { saved.push(match); return { primarySaved: true, mirrorSaved: false } }, clearDraftMatch() {}, saveDraftMatch() {} }
  const h = screenHarness(root, 'screens/NewMatchScreen.tsx', 'MatchEditor', store)
  const props = { mode: 'edit', sourceMatch: game, selectedTeamId: 'A', restored: restoreDraft(game, []), freshCheckpointId: 'fresh', onReplace() {}, onBack() {}, onComplete() {} }
  assert(props.restored)
  const render = () => h.render(props)
  const live = () => {
    let tree = render()
    const button = nodes(tree, n => n.type === 'button' && n.props.children === 'CONTINUE')[0]
    if (button) { assert.equal(button.props.disabled, false); button.props.onClick(); tree = render() }
    return nodes(tree, n => typeof n.type === 'function' && n.type.name === 'LiveMatchStep')[0]
  }
  return { render, live, saved }
}

test('deleting the last substitution-linked position move cannot resurrect source history on save', async () => {
  const game = fixture()
  game.events = [{ id: 's', type: 'sub', minute: 60, teamId: 'A', playerInId: 'sub', playerOutId: 'p10', position: 'RW', tacticalSlotId: 'RW', sequence: 1 }]
  for (const [id, position, slot] of [['p8', 'ST', 'ST'], ['p9', 'LW', 'LW']]) game.appearances.find(a => a.playerId === id).positionHistory = [{ minute: 60, position, tacticalSlotId: slot, sequence: 2, sourceSubstitutionIds: ['s'] }]
  const original = JSON.stringify(game)
  const app = editor(game)
  app.live().props.onDeleteEvent(game.events[0])
  assert.equal(await app.live().props.onFinish(), true)
  assert.deepEqual(app.saved[0].events, [])
  assert.deepEqual(app.saved[0].appearances.find(a => a.playerId === 'p8').positionHistory ?? [], [])
  assert.deepEqual(app.saved[0].appearances.find(a => a.playerId === 'p9').positionHistory ?? [], [])
  assert.equal(JSON.stringify(game), original)
})

test('editing a two-sided historical fixture preserves every opponent appearance and event', async () => {
  const game = fixture()
  const opponent = [{ playerId: 'opp-start', teamId: 'B', role: 'starter', position: 'ST', matchPosition: 'LW', positionHistory: [{ minute: 70, position: 'ST' }] }, { playerId: 'opp-bench', teamId: 'B', role: 'bench', position: 'CM' }]
  game.appearances.push(...opponent)
  game.events = [{ id: 'opp-sub', type: 'sub', teamId: 'B', minute: 60, playerInId: 'opp-bench', playerOutId: 'opp-start', position: 'ST' }, { id: 'opponent-goal', type: 'goal', teamId: 'B', minute: 80, playerId: 'opp-bench' }]
  assert.equal(validateState({ teams, players: [], matches: [game] }), true)
  const original = JSON.stringify(game)
  const restored = restoreDraft(game, [])
  assert(restored)
  assert.deepEqual(restored.bench, ['sub'])
  const app = editor(game)
  assert.equal(await app.live().props.onFinish(), true)
  assert.deepEqual(app.saved[0].appearances.filter(a => a.teamId === 'B'), opponent)
  assert.deepEqual(app.saved[0].events, game.events)
  assert.equal(validateState({ teams, players: [], matches: app.saved }), true)
  assert.equal(JSON.stringify(game), original)
})

test('saving an existing fixture preserves observed duration and untouched source metadata', async () => {
  const game = { ...fixture(), recordedAt: 123, halftimeScore: { home: 0, away: 0 } }
  const app = editor(game)
  assert.equal(await app.live().props.onFinish(), true)
  assert.equal(app.saved[0].duration, 95)
  assert.equal(app.saved[0].recordedAt, 123)
  assert.deepEqual(app.saved[0].halftimeScore, game.halftimeScore)
})

test('Match Timeline displays same-minute events in canonical saved sequence order', () => {
  const { orderedEventList } = require('../src/engine/timeline.ts')
  const { MatchTimeline } = require('../src/components/MatchTimeline.tsx')
  const events = [{ id: 'goal', type: 'goal', minute: 60, sequence: 2, teamId: 'A', playerId: 'sub' }, { id: 'sub', type: 'sub', minute: 60, sequence: 1, teamId: 'A', playerInId: 'sub', playerOutId: 'p10', position: 'RW' }]
  const tree = MatchTimeline({ events, players: [], teamId: 'A' })
  assert.deepEqual(nodes(tree, n => n.type === 'div' && n.key !== null).map(n => n.key), orderedEventList(events).map(e => e.id))
  assert.deepEqual(events.map(e => e.id), ['goal', 'sub'])
})
