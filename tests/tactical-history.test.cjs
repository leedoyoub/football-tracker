const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { canConfirmSubstitution, moveSubstitution } = require('../src/screens/matchLineup.ts')
const { rebuildLiveHistory } = require('../src/screens/liveHistory.ts')
const { tacticalAssignmentsAtMoment, tacticalPreviewSlots, eligibleAtEvent, previewGoalEvent } = require('../src/engine/tacticalHistory.ts')
const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')
const { kickoffFormation } = require('../src/engine/formation.ts')
const { restoreDraft } = require('../src/lib/editorRestore.ts')
const { matchRoleLabel } = require('../src/screens/matchDetailPosition.ts')
const { normalizePositionFamily } = require('../src/engine/timeline.ts')
const { auditDataIntegrity } = require('../src/engine/integrity.ts')

const starters = { LCAM: 'A', CAM: 'B', RCAM: 'C' }
const positions = { LCAM: 'CAM', CAM: 'CAM', RCAM: 'CAM' }
const draft = () => ({ slotAssignments: { ...starters }, homeBench: ['D'], events: [], positionHistories: {}, checkpoint: { slotAssignments: { ...starters }, homeBench: ['D'] } })
const player = id => ({ id, name: id, teamId: 'T', position: 'CM', number: id.charCodeAt(0) })
const eventMatch = (events, appearances) => ({ id: 'm', season: 'S', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'T', awayTeamId: 'O', events, appearances })

test('RCAM and LCAM substitutions persist exact slot while retaining CAM rating semantics', () => {
  for (const slot of ['RCAM', 'LCAM']) {
    const changed = moveSubstitution(draft(), { group: 'starting', id: slot }, { group: 'substitute', id: 'D' }, starters, positions, 60, 'T', () => 'sub')
    const sub = changed.events[0]
    assert.equal(sub.position, 'CAM')
    assert.equal(sub.tacticalSlotId, slot)
    assert.equal(changed.slotAssignments[slot], 'D')
    const replayed = rebuildLiveHistory(starters, ['A', 'B', 'C', 'D'], changed.events, changed.positionHistories, positions)
    assert.equal(replayed.slotAssignments[slot], 'D')
    const preview = tacticalPreviewSlots(replayed.slotAssignments, 'T')
    assert.equal(preview.find(row => row.playerId === 'D').slot, slot)
    assert.equal(preview.find(row => row.playerId === 'D').displayPosition, slot === 'RCAM' ? 'RAM' : 'LAM')
    assert.equal(preview.find(row => row.playerId === 'D').x, slot === 'RCAM' ? 70 : 30)
  }
})

test('same-family tactical moves survive replay and preserve CAM rating', () => {
  const fullStarters = { ...starters, GK: 'gk', LB: 'lb', LCB: 'lcb', RCB: 'rcb', RB: 'rb', LDM: 'ldm', RDM: 'rdm', ST: 'st' }
  const fullPositions = { ...positions, GK: 'GK', LB: 'LB', LCB: 'LCB', RCB: 'RCB', RB: 'RB', LDM: 'LDM', RDM: 'RDM', ST: 'ST' }
  const base = { ...draft(), slotAssignments: fullStarters, checkpoint: { slotAssignments: fullStarters, homeBench: ['D'] } }
  const moved = moveSubstitution(base, { group: 'starting', id: 'LCAM' }, { group: 'starting', id: 'RCAM' }, fullStarters, fullPositions, 60, 'T', () => 'unused')
  assert.equal(moved.positionHistories.A[0].position, 'CAM')
  assert.equal(moved.positionHistories.A[0].tacticalSlotId, 'RCAM')
  assert.equal(moved.positionHistories.C[0].tacticalSlotId, 'LCAM')
  assert.equal(canConfirmSubstitution(moved, base), true)
  assert.equal(rebuildLiveHistory(fullStarters, [...Object.values(fullStarters), 'D'], moved.events, moved.positionHistories, fullPositions).slotAssignments.RCAM, 'A')
  const kickoffLineup = kickoffFromAssignments(fullStarters)
  const players = [...Object.values(fullStarters), 'D'].map(player)
  const appearances = [...kickoffLineup.map(slot => ({ playerId: slot.playerId, teamId: 'T', position: slot.ratingPosition, matchPosition: slot.ratingPosition, role: 'starter', positionHistory: moved.positionHistories[slot.playerId] })), { playerId: 'D', teamId: 'T', position: 'CM', role: 'bench' }]
  const restored = restoreDraft({ ...eventMatch([], appearances), teamId: 'T', kickoffLineup }, players)
  assert.equal(restored?.draft.slotAssignments.RCAM, 'A')
})

test('resume and event correction preserve a cross-slot substitution and teammate move', () => {
  const first = moveSubstitution(draft(), { group: 'starting', id: 'RCAM' }, { group: 'substitute', id: 'D' }, starters, positions, 60, 'T', () => 'sub')
  const switched = moveSubstitution(first, { group: 'starting', id: 'LCAM' }, { group: 'starting', id: 'RCAM' }, starters, positions, 60, 'T', () => 'unused')
  const events = [{ id: 'goal', type: 'goal', minute: 20, teamId: 'T', playerId: 'B' }, ...switched.events]
  const corrected = rebuildLiveHistory(starters, ['A', 'B', 'C', 'D'], events.filter(row => row.id !== 'goal'), switched.positionHistories, positions)
  assert.deepEqual(corrected.slotAssignments, switched.slotAssignments)
  const kickoffLineup = kickoffFromAssignments({ GK: 'gk', LB: 'lb', LCB: 'lcb', RCB: 'rcb', RB: 'rb', LDM: 'ldm', RDM: 'rdm', ST: 'st', ...starters })
  const allPlayers = ['gk', 'lb', 'lcb', 'rcb', 'rb', 'ldm', 'rdm', 'st', 'A', 'B', 'C', 'D'].map(player)
  const match = { ...eventMatch(switched.events, [...kickoffLineup.map(slot => ({ playerId: slot.playerId, teamId: 'T', position: slot.ratingPosition, matchPosition: slot.ratingPosition, role: 'starter', positionHistory: switched.positionHistories[slot.playerId] })), { playerId: 'D', teamId: 'T', position: 'CM', matchPosition: 'CAM', role: 'bench', positionHistory: switched.positionHistories.D }]), kickoffLineup, teamId: 'T' }
  const restored = restoreDraft(match, allPlayers)
  assert(restored)
  for (const [slot, id] of Object.entries(switched.slotAssignments)) assert.equal(restored.draft.slotAssignments[slot], id)
})

test('goal and conceded preview uses the exact event-time slots', () => {
  const changed = moveSubstitution(draft(), { group: 'starting', id: 'RCAM' }, { group: 'substitute', id: 'D' }, starters, positions, 60, 'T', () => 'sub')
  const goal = { id: 'goal', type: 'goal', minute: 70, sequence: 2, teamId: 'T', playerId: 'D' }
  const conceded = { ...goal, id: 'conceded', teamId: 'O', playerId: undefined, concededGoalCausePlayerId: 'D' }
  for (const event of [goal, conceded]) {
    const assignments = tacticalAssignmentsAtMoment(starters, [...changed.events, event], changed.positionHistories, positions, event)
    assert.equal(assignments.RCAM, 'D')
    assert.equal(tacticalPreviewSlots(assignments, 'T').find(row => row.playerId === 'D').slot, 'RCAM')
  }
})

test('same-minute edit eligibility respects saved sequence', () => {
  const appearances = [{ playerId: 'A', teamId: 'T', position: 'CAM', matchPosition: 'CAM', role: 'starter' }, { playerId: 'D', teamId: 'T', position: 'CAM', matchPosition: 'CAM', role: 'bench' }]
  const goal = { id: 'goal', type: 'goal', minute: 60, sequence: 1, teamId: 'T', playerId: 'A' }
  const sub = { id: 'sub', type: 'sub', minute: 60, sequence: 2, teamId: 'T', playerOutId: 'A', playerInId: 'D', position: 'CAM', tacticalSlotId: 'RCAM' }
  assert(eligibleAtEvent(eventMatch([{ ...goal, id: 'earlier', minute: 59 }, goal, sub], appearances), goal).some(row => row.playerId === 'A'))
  assert(!eligibleAtEvent(eventMatch([{ ...sub, sequence: 1 }, { ...goal, sequence: 2 }], appearances), { ...goal, sequence: 2 }).some(row => row.playerId === 'A'))
})

test('a player can score and then be substituted out in the same minute', () => {
  const before = draft()
  before.events = [{ id: 'goal', type: 'goal', minute: 60, sequence: 0, teamId: 'T', playerId: 'C' }]
  const after = moveSubstitution(before, { group: 'starting', id: 'RCAM' }, { group: 'substitute', id: 'D' }, starters, positions, 60, 'T', () => 'sub')
  assert.notEqual(after, before)
  assert.equal(after.events[1].sequence, 1)
  assert.equal(after.events[1].tacticalSlotId, 'RCAM')
})

test('two same-minute tactical moves keep the intermediate slot for an intervening goal', () => {
  const first = moveSubstitution(draft(), { group: 'starting', id: 'LCAM' }, { group: 'starting', id: 'CAM' }, starters, positions, 60, 'T', () => 'unused')
  const goal = { id: 'goal', type: 'goal', minute: 60, sequence: 2, teamId: 'T', playerId: 'A' }
  const middle = { ...first, events: [goal] }
  const second = moveSubstitution(middle, { group: 'starting', id: 'CAM' }, { group: 'starting', id: 'RCAM' }, starters, positions, 60, 'T', () => 'unused')
  assert.equal(second.positionHistories.A.length, 2)
  assert.equal(tacticalAssignmentsAtMoment(starters, second.events, second.positionHistories, positions, goal).CAM, 'A')
  assert.equal(tacticalAssignmentsAtMoment(starters, second.events, second.positionHistories, positions).RCAM, 'A')
})

test('editor preview keeps an old goal in its original same-minute order', () => {
  const appearances = [{ playerId: 'A', teamId: 'T', position: 'CAM', matchPosition: 'CAM', role: 'starter' }, { playerId: 'D', teamId: 'T', position: 'CAM', matchPosition: 'CAM', role: 'bench' }]
  const oldGoal = { id: 'goal', type: 'goal', minute: 60, teamId: 'T', playerId: 'A' }
  const sub = { id: 'sub', type: 'sub', minute: 60, teamId: 'T', playerOutId: 'A', playerInId: 'D', position: 'CAM', tacticalSlotId: 'RCAM' }
  const match = eventMatch([oldGoal, sub], appearances)
  const edited = previewGoalEvent(match, {}, 60, 'T', 'goal')
  assert(eligibleAtEvent(edited.match, edited.event).some(row => row.playerId === 'A'))
  const created = previewGoalEvent(match, {}, 60, 'T')
  assert(!eligibleAtEvent(created.match, created.event).some(row => row.playerId === 'A'))
})

test('kickoff formation stays 4-3-3 after the live shape changes to 4-2-3-1', () => {
  const kickoff = kickoffFromAssignments({ GK: 'gk', LB: 'lb', LCB: 'lcb', RCB: 'rcb', RB: 'rb', LCM: 'lcm', CM: 'cm', RCM: 'rcm', LW: 'lw', ST: 'st', RW: 'rw' })
  assert.equal(kickoffFormation(kickoff), '4-3-3')
  assert.deepEqual(kickoff.map(slot => slot.id).slice(5, 8), ['LCM', 'CM', 'RCM'])
})

test('match detail displays actual substitute role and exact tactical moves', () => {
  const rw = { id: 'rw', type: 'sub', minute: 60, teamId: 'T', playerOutId: 'X', playerInId: 'D', position: 'RW', tacticalSlotId: 'RW' }
  const ram = { ...rw, id: 'ram', playerInId: 'E', position: 'CAM', tacticalSlotId: 'RCAM' }
  assert.equal(matchRoleLabel({ playerId: 'D', position: 'ST', role: 'bench' }, [rw]), 'RW')
  assert.equal(matchRoleLabel({ playerId: 'E', position: 'CM', role: 'bench' }, [ram]), 'RAM')
  assert.equal(matchRoleLabel({ playerId: 'E', position: 'CM', role: 'bench', positionHistory: [{ minute: 75, position: 'CAM', tacticalSlotId: 'CAM' }] }, [ram]), 'RAM → CAM')
})

test('Match Detail substitute cards render match roles instead of registered roles', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const appearances = [
    { playerId: 'A', teamId: 'T', position: 'ST', matchPosition: 'ST', role: 'starter' },
    { playerId: 'D', teamId: 'T', position: 'ST', matchPosition: 'RW', role: 'bench' },
    { playerId: 'E', teamId: 'T', position: 'CM', matchPosition: 'CAM', role: 'bench' },
  ]
  const events = [
    { id: 'rw', type: 'sub', minute: 60, teamId: 'T', playerOutId: 'A', playerInId: 'D', position: 'RW', tacticalSlotId: 'RW' },
    { id: 'ram', type: 'sub', minute: 70, teamId: 'T', playerOutId: 'D', playerInId: 'E', position: 'CAM', tacticalSlotId: 'RCAM' },
  ]
  const match = { ...eventMatch(events, appearances), teamId: 'T' }
  const storePath = require.resolve('../src/store.tsx'), prior = require.cache[storePath]
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => ({ teams: [{ id: 'T', name: 'Tracked', shortName: 'T' }, { id: 'O', name: 'Opponent', shortName: 'O' }], players: [{ ...player('A'), position: 'ST' }, { ...player('D'), position: 'ST' }, player('E')], matches: [match], competitionStates: [], deleteMatch() {} }) } }
  const screenPath = require.resolve('../src/screens/MatchDetailScreen.tsx')
  delete require.cache[screenPath]
  try {
    const { MatchDetailScreen } = require(screenPath)
    const html = renderToStaticMarkup(React.createElement(MatchDetailScreen, { matchId: 'm', screenState: { tab: 'lineup' }, onStateChange() {}, onNavigate() {}, onBack() {}, onBackToTeam() {}, onReplace() {} }))
    assert.match(html, /RW/)
    assert.match(html, /RAM/)
  } finally {
    if (prior) require.cache[storePath] = prior
    else delete require.cache[storePath]
    delete require.cache[screenPath]
  }
})

test('CAM family normalization remains unchanged', () => {
  for (const role of ['LAM', 'CAM', 'RAM', 'LCAM', 'RCAM']) assert.equal(normalizePositionFamily(role), 'CAM')
})

test('unknown optional tactical slot is diagnosed without breaking legacy match audit', () => {
  const appearances = [{ playerId: 'A', teamId: 'T', position: 'CAM', role: 'starter', positionHistory: [{ minute: 60, position: 'CAM', tacticalSlotId: 'toString' }] }, { playerId: 'D', teamId: 'T', position: 'CM', role: 'bench' }]
  const events = [{ id: 'sub', type: 'sub', minute: 60, teamId: 'T', playerOutId: 'A', playerInId: 'D', position: 'CAM', tacticalSlotId: 'toString' }]
  const report = auditDataIntegrity([eventMatch(events, appearances)], [player('A'), player('D')], [{ id: 'T' }, { id: 'O' }])
  assert(report.issues.some(issue => issue.message.includes('unknown tactical slot')))
  const legacyEvents = events.map(row => { const copy = { ...row }; delete copy.tacticalSlotId; return copy })
  const legacyAppearances = appearances.map(row => ({ ...row, positionHistory: row.positionHistory?.map(change => { const copy = { ...change }; delete copy.tacticalSlotId; return copy }) }))
  const legacy = auditDataIntegrity([eventMatch(legacyEvents, legacyAppearances)], [player('A'), player('D')], [{ id: 'T' }, { id: 'O' }])
  assert(!legacy.issues.some(issue => issue.message.includes('unknown tactical slot')))
})
