const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { createFreshLineup, reconcileFreshBench, moveLineup, moveSubstitution, allowsGoalkeeperLineupMove } = require('../src/screens/matchLineup.ts')
const { draftRestoreFailureReason, restoreDraft } = require('../src/lib/editorRestore.ts')
const { getMostRecentMatchLineup } = require('../src/engine/recentLineup.ts')
const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')
const slots = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW']
const roster = count => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, teamId: 'A', teamIds: ['A'], name: `p${index}`, number: index, position: index === 0 || index === 11 ? 'GK' : 'CM' }))
const recent = Object.fromEntries(slots.map((slot, index) => [slot, `p${index}`]))
const bench = Array.from({ length: 12 }, (_, index) => `p${index + 11}`)
const fresh = (players = roster(23), assignments = recent, priorBench = bench) => createFreshLineup(players, assignments, priorBench, recent)
const ids = lineup => [...Object.values(lineup.slotAssignments).filter(Boolean), ...lineup.homeBench]

test('fresh lineup replaces a departed starter from prior bench before a new signing', () => {
  const players = roster(23).filter(p => p.id !== 'p5').concat({ id: 'new', teamId: 'A', teamIds: ['A'], name: 'new', number: 24, position: 'ST' })
  const lineup = fresh(players)
  assert.equal(lineup.slotAssignments.LCM, 'p12')
  assert.equal(lineup.homeBench.at(-1), 'new')
  assert.equal(ids(lineup).length, 23)
  assert.equal(new Set(ids(lineup)).size, 23)
  assert(!ids(lineup).includes('p5'))
})

test('multiple departed starters use bench order without field position matching', () => {
  const players = roster(23).filter(p => !['p2', 'p3'].includes(p.id))
  const lineup = fresh(players)
  assert.deepEqual([lineup.slotAssignments.LCB, lineup.slotAssignments.RCB], ['p12', 'p13'])
  assert.equal(Object.values(lineup.slotAssignments).filter(Boolean).length, 11)
})

test('departed goalkeeper uses an existing goalkeeper and never a field player', () => {
  const players = roster(23).filter(p => p.id !== 'p0')
  assert.equal(fresh(players).slotAssignments.GK, 'p11')
  const withoutKeepers = players.filter(p => p.id !== 'p11')
  const lineup = fresh(withoutKeepers)
  assert.equal(lineup.slotAssignments.GK, undefined)
  assert.equal(Object.values(lineup.slotAssignments).filter(Boolean).length, 10)
  assert(Object.entries(lineup.slotAssignments).every(([slot, id]) => slot === 'GK' || withoutKeepers.find(p => p.id === id)?.position !== 'GK'))
})

test('only released bench players are omitted and new bench players appear in roster order', () => {
  const players = roster(23).filter(p => p.id !== 'p13').concat({ id: 'new', teamId: 'A', teamIds: ['A'], name: 'new', number: 24, position: 'ST' })
  const lineup = fresh(players)
  assert.deepEqual(lineup.slotAssignments, recent)
  assert.equal(lineup.homeBench.at(-1), 'new')
  assert(!lineup.homeBench.includes('p13'))
})

for (const count of [15, 20, 23]) test(`${count} registered players produce eleven starters and ${count - 11} bench players`, () => {
  const lineup = fresh(roster(count))
  assert.equal(Object.values(lineup.slotAssignments).filter(Boolean).length, 11)
  assert.equal(lineup.homeBench.length, count - 11)
  assert.equal(new Set(ids(lineup)).size, count)
})

test('eleven occupied slots cannot receive a twelfth starter in an empty tactical slot', () => {
  const lineup = fresh()
  assert.equal(moveLineup(lineup, { group: 'substitute', id: 'p12' }, { group: 'starting', id: 'CAM' }), lineup)
  assert.equal(moveLineup(lineup, { group: 'starting', id: 'CAM' }, { group: 'substitute', id: 'p12' }), lineup)
})

test('ten starters can receive a bench player and the remaining roster returns to the bench', () => {
  const players = roster(23)
  const partial = { slotAssignments: { ...recent }, homeBench: bench.slice(0, 12) }
  delete partial.slotAssignments.LB
  const limited = reconcileFreshBench(partial, players)
  assert.equal(limited.homeBench.length, 12)
  assert(!limited.homeBench.includes('p1'))
  const filled = moveLineup(limited, { group: 'substitute', id: 'p12' }, { group: 'starting', id: 'LB' })
  const reconciled = reconcileFreshBench(filled, players)
  assert.equal(reconciled.slotAssignments.LB, 'p12')
  assert.equal(reconciled.homeBench.length, 12)
  assert(reconciled.homeBench.includes('p1'))
  assert.equal(new Set(ids(reconciled)).size, 23)
})

test('tap order swaps pitch and bench equally, while starter and position swaps stay unique', () => {
  const lineup = fresh()
  const source = { group: 'starting', id: 'ST' }
  const target = { group: 'substitute', id: 'p12' }
  assert.deepEqual(moveLineup(lineup, source, target), moveLineup(lineup, target, source))
  const swapped = moveLineup(lineup, source, { group: 'starting', id: 'CM' })
  assert.equal(swapped.slotAssignments.ST, 'p6')
  assert.equal(swapped.slotAssignments.CM, 'p9')
  assert.equal(new Set(ids(swapped)).size, 23)
})

test('bench capacity, duplicate IDs and unknown bench candidates are rejected in the move function', () => {
  const lineup = fresh()
  assert.equal(moveLineup(lineup, { group: 'starting', id: 'ST' }, { group: 'substitute', id: '' }), lineup)
  assert.equal(moveLineup(lineup, { group: 'substitute', id: 'p12' }, { group: 'starting', id: 'ST' }).homeBench.length, 12)
  assert.equal(moveLineup(lineup, { group: 'substitute', id: 'not-on-bench' }, { group: 'starting', id: 'ST' }), lineup)
  const corrupt = { slotAssignments: { GK: 'p0', ST: 'p1' }, homeBench: ['p1'] }
  assert.equal(moveLineup(corrupt, { group: 'starting', id: 'ST' }, { group: 'starting', id: 'LW' }), corrupt)
})

test('goalkeeper swaps are valid only between goalkeeper players and GK slot', () => {
  const lineup = fresh()
  const positions = Object.fromEntries(roster(23).map(p => [p.id, p.position]))
  const slotPositions = Object.fromEntries(slots.map(id => [id, id === 'GK' ? 'GK' : 'CM']))
  const keeper = { group: 'starting', id: 'GK' }
  const backup = { group: 'substitute', id: 'p11' }
  assert(allowsGoalkeeperLineupMove(keeper, backup, lineup, slotPositions, positions, 'pre-kickoff'))
  assert(!allowsGoalkeeperLineupMove(keeper, { group: 'substitute', id: 'p12' }, lineup, slotPositions, positions, 'pre-kickoff'))
  assert(!allowsGoalkeeperLineupMove(backup, { group: 'starting', id: 'ST' }, lineup, slotPositions, positions, 'pre-kickoff'))
  assert(!allowsGoalkeeperLineupMove(keeper, backup, lineup, slotPositions, positions, 'in-match'))
  const emptyKeeper = { ...lineup, slotAssignments: { ...lineup.slotAssignments } }
  delete emptyKeeper.slotAssignments.GK
  assert(allowsGoalkeeperLineupMove(keeper, backup, emptyKeeper, slotPositions, positions, 'pre-kickoff'))
  assert(allowsGoalkeeperLineupMove(backup, keeper, emptyKeeper, slotPositions, positions, 'pre-kickoff'))
})

test('restoration retains transferred and deleted historical IDs, events, histories and bench', () => {
  const lineup = fresh()
  const appearances = ids(lineup).map(id => ({ playerId: id, teamId: 'A', role: Object.values(lineup.slotAssignments).includes(id) ? 'starter' : 'bench', position: id === 'p0' || id === 'p11' ? 'GK' : 'CM', positionHistory: id === 'p5' ? [{ minute: 60, position: 'ST', tacticalSlotId: 'ST' }] : undefined }))
  const match = { id: 'draft', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, kickoffLineup: kickoffFromAssignments(lineup.slotAssignments), appearances, events: [{ id: 'goal', type: 'goal', teamId: 'A', minute: 20, playerId: 'p5', assistPlayerId: 'p6' }] }
  const current = roster(23).filter(p => p.id !== 'p5').map(p => p.id === 'p6' ? { ...p, teamId: 'B', teamIds: ['B'] } : p)
  const restored = restoreDraft(match, current)
  assert(restored)
  assert.deepEqual(restored.starters, lineup.slotAssignments)
  assert.deepEqual(restored.bench, lineup.homeBench)
  assert.deepEqual(restored.draft.events, match.events)
  assert.deepEqual(restored.draft.positionHistories.p5, [{ minute: 60, position: 'ST', tacticalSlotId: 'ST' }])
  assert.deepEqual(match.appearances, appearances)
})

test('an incomplete pre-kickoff draft retains its exact slots, bench and eventless state', () => {
  const lineup = fresh(roster(20))
  delete lineup.slotAssignments.ST
  const match = { id: 'partial', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, kickoffLineup: kickoffFromAssignments(lineup.slotAssignments, false), appearances: ids(lineup).map(id => ({ playerId: id, teamId: 'A', role: Object.values(lineup.slotAssignments).includes(id) ? 'starter' : 'bench', position: id === 'p0' || id === 'p11' ? 'GK' : 'CM' })), events: [] }
  const restored = restoreDraft(match, roster(20), true)
  assert(restored)
  assert.deepEqual(restored.starters, lineup.slotAssignments)
  assert.deepEqual(restored.bench, lineup.homeBench)
  assert.deepEqual(restored.draft.events, [])
  assert.equal(restoreDraft(match, roster(20)), null)
})

test('invalid saved kickoff fails closed with a reason and leaves source bytes unchanged', () => {
  const lineup = fresh()
  const kickoff = kickoffFromAssignments(lineup.slotAssignments)
  const match = { id: 'invalid', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, kickoffLineup: [kickoff[0], { ...kickoff[1], id: kickoff[0].id }], appearances: [], events: [] }
  const before = JSON.stringify(match)
  assert.equal(restoreDraft(match, roster(23), true), null)
  assert.match(draftRestoreFailureReason(match, true), /duplicated/)
  assert.equal(JSON.stringify(match), before)
})

test('the bench UI reads only IDs held by the editable lineup', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  const line = source.split('\n').find(row => row.includes('<RosterPlayerGroup title="Bench (Max 12)"'))
  assert(line)
  assert.match(line, /matchDraft\.homeBench\.filter/)
  assert.doesNotMatch(line, /squadPlayers/)
})

test('recent kickoff and bench come from the same valid team match in saved order', () => {
  const lineup = fresh()
  const appearance = id => ({ playerId: id, teamId: 'A', position: id === 'p0' || id === 'p11' ? 'GK' : 'CM', role: Object.values(lineup.slotAssignments).includes(id) ? 'starter' : 'bench' })
  const match = { id: 'latest', season: 'Season 2', matchDay: 1, date: '2026-01-01', homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', duration: 90, kickoffLineup: kickoffFromAssignments(lineup.slotAssignments), appearances: [...Object.values(lineup.slotAssignments), ...lineup.homeBench].map(appearance), events: [] }
  const older = { ...match, id: 'older', season: 'Season 1', appearances: [], kickoffLineup: [] }
  const found = getMostRecentMatchLineup([older, match], 'A')
  assert.deepEqual(found, { starters: lineup.slotAssignments, bench: lineup.homeBench })
  assert.equal(getMostRecentMatchLineup([match], 'B'), null)
})

test('a serialized new match restores its kickoff and bench without roster rewrites', () => {
  const lineup = fresh(roster(20))
  const match = { id: 'new-match', season: 'Season 1', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', kickoffLineup: kickoffFromAssignments(lineup.slotAssignments), appearances: ids(lineup).map(id => ({ playerId: id, teamId: 'A', position: id === 'p0' || id === 'p11' ? 'GK' : 'CM', role: Object.values(lineup.slotAssignments).includes(id) ? 'starter' : 'bench' })), events: [] }
  const savedBytes = JSON.stringify(match)
  const restored = restoreDraft(JSON.parse(savedBytes), roster(20))
  assert.deepEqual(restored?.starters, lineup.slotAssignments)
  assert.deepEqual(restored?.bench, lineup.homeBench)
  assert.equal(JSON.stringify(match), savedBytes)
})

test('the next match after a release and signing uses its latest actual lineup without duplicates', () => {
  const changedRoster = roster(23).filter(player => player.id !== 'p5').concat({ id: 'new', teamId: 'A', name: 'new', number: 24, position: 'ST' })
  const first = fresh(changedRoster)
  const next = createFreshLineup(changedRoster, first.slotAssignments, first.homeBench, recent)
  assert.deepEqual(next, first)
  assert.equal(new Set(ids(next)).size, 23)
  assert(next.homeBench.includes('new'))
})

test('fresh lineup does not mutate the recent match, roster, or draft during construction', () => {
  const players = roster(23)
  const previous = { ...recent }
  const previousBench = [...bench]
  const before = JSON.stringify({ players, previous, previousBench })
  const lineup = createFreshLineup(players, previous, previousBench, recent)
  lineup.slotAssignments.ST = 'different'
  lineup.homeBench[0] = 'different'
  assert.equal(JSON.stringify({ players, previous, previousBench }), before)
})

test('a full twelve-player bench still supports a normal in-match substitution event', () => {
  const lineup = fresh()
  const draft = { ...lineup, events: [], positionHistories: {}, checkpoint: lineup }
  const positions = Object.fromEntries(slots.map(id => [id, id === 'GK' ? 'GK' : 'CM']))
  const result = moveSubstitution(draft, { group: 'starting', id: 'ST' }, { group: 'substitute', id: 'p12' }, lineup.slotAssignments, positions, 65, 'A', () => 'sub-1')
  assert.equal(result.slotAssignments.ST, 'p12')
  assert.equal(result.homeBench.length, 12)
  assert.deepEqual(result.events.map(event => [event.id, event.playerOutId, event.playerInId]), [['sub-1', 'p9', 'p12']])
  const staged = moveLineup(lineup, { group: 'starting', id: 'ST' }, { group: 'substitute', id: '' }, true)
  assert.equal(staged.homeBench.length, 13)
  assert.equal(staged.slotAssignments.ST, undefined)
  assert.equal(moveLineup(lineup, { group: 'starting', id: 'ST' }, { group: 'substitute', id: '' }), lineup)
  const completed = moveLineup(staged, { group: 'substitute', id: 'p12' }, { group: 'starting', id: 'ST' }, true)
  assert.equal(completed.homeBench.length, 12)
  assert.equal(completed.slotAssignments.ST, 'p12')
  const stagedEvent = moveSubstitution(draft, { group: 'starting', id: 'ST' }, { group: 'substitute', id: '' }, lineup.slotAssignments, positions, 65, 'A', () => 'unused')
  const confirmedEvent = moveSubstitution(stagedEvent, { group: 'substitute', id: 'p12' }, { group: 'starting', id: 'ST' }, lineup.slotAssignments, positions, 65, 'A', () => 'sub-2')
  assert.equal(confirmedEvent.events[0].id, 'sub-2')
  assert.equal(confirmedEvent.homeBench.length, 12)
})
