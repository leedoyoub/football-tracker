require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { selectTeamHistoryBestXI, mostUsedTeamHistoryFormation } = require('../src/engine/teamHistorySelection.ts')
const { teamHistoryBestXI } = require('../src/engine/teamHistory.ts')
const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')

const player = (id, extra = {}) => ({ id, name: id, teamId: 'released', position: 'GK', ...extra })
const appearance = (playerId, position, extra = {}) => ({ playerId, teamId: 'A', role: 'starter', position, matchPosition: position, ...extra })
const shapes = {
  '4-3-3': ['LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW', 'GK'],
  '4-2-1-3': ['LB', 'LCB', 'RCB', 'RB', 'LDM', 'RDM', 'CAM', 'LW', 'ST', 'RW', 'GK'],
  '4-4-2': ['LB', 'LCB', 'RCB', 'RB', 'LM', 'LCM', 'RCM', 'RM', 'LST', 'RST', 'GK'],
}
function game(id, formation = '4-3-3', appearances = [], extra = {}) {
  const kickoffLineup = kickoffFromAssignments(Object.fromEntries((shapes[formation] ?? []).map((slot, i) => [slot, `saved-${i}`])))
  return { id: String(id), season: 'Season 1', date: `2026-01-${String(id).padStart(2, '0')}`, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', competitionType: 'league', matchDay: Number(id) || 1, formation, kickoffLineup, appearances, events: [], ...extra }
}
const selected = result => result.bestXI.filter(slot => slot.playerId).map(slot => slot.playerId)

test('History counts distinct saved kickoff formations before choosing the modal shape', () => {
  const games = ['4-3-3', '4-2-1-3', '4-4-2', '4-4-2', '4-2-1-3'].map((formation, i) => game(i + 1, formation))
  assert.equal(mostUsedTeamHistoryFormation(games, 'A').label, '4-2-1-3', 'latest use breaks the 2-2 tie')
  assert.equal(mostUsedTeamHistoryFormation(games, 'A').matches, 2)
  const result = selectTeamHistoryBestXI([], games, 'A')
  assert.deepEqual(result.bestXI.map(slot => slot.slot), shapes['4-2-1-3'])
  assert.deepEqual(result.bestXI.filter(slot => ['LDM', 'RDM', 'CAM'].includes(slot.slot)).map(slot => slot.position), ['LDM', 'RDM', 'CAM'])
})

test('History recovers exact formation from validated kickoff evidence and never from later positions', () => {
  const valid = game(1, '4-2-1-3', [appearance('p', 'ST', { positionHistory: [{ minute: 10, position: 'CB' }] })])
  assert.equal(mostUsedTeamHistoryFormation([{ ...valid, formation: '' }], 'A').label, '4-2-1-3')
  const absent = { ...valid, formation: '', kickoffLineup: undefined }
  assert.equal(mostUsedTeamHistoryFormation([absent], 'A'), null)
  assert.deepEqual(selectTeamHistoryBestXI([player('p')], [absent], 'A').bestXI, [])
  const foreign = { ...valid, id: 'foreign', teamId: 'B' }
  assert.equal(mostUsedTeamHistoryFormation([foreign], 'A'), null)
})

test('History uses 30 percent of all scoped team regulation minutes, including exact boundary', () => {
  const players = ['boundary', 'short', 'bench', 'foreign'].map(id => player(id))
  const games = Array.from({ length: 10 }, (_, i) => game(i + 1, '4-3-3', [
    appearance('boundary', 'ST', { role: i < 3 ? 'starter' : 'bench' }),
    appearance('short', 'LW', { role: i < 3 ? 'starter' : 'bench' }),
    appearance('bench', 'RW', { role: 'bench' }),
    appearance('foreign', 'GK', { teamId: 'B' }),
  ], i === 2 ? { events: [{ id: 'off', type: 'sub', minute: 89, teamId: 'A', playerOutId: 'short', playerInId: 'other', position: 'LW' }] } : {}))
  const result = selectTeamHistoryBestXI(players, games, 'A')
  assert.equal(result.minimumMinutes, 270)
  assert.equal(result.availableTeamMinutes, 900)
  assert.deepEqual(selected(result), ['boundary'])
  assert(result.bestXI.some(slot => slot.playerId === null), 'ineligible players never force a filled XI')
})

test('History rates each played match equally and keeps transferred player facts inside the selected team scope', () => {
  const players = [player('p', { teamId: 'B' })]
  const games = [game(1, '4-3-3', [appearance('p', 'ST')]), game(2, '4-3-3', [appearance('p', 'ST')], {
    events: [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'p' }, { id: 'off', type: 'sub', minute: 30, teamId: 'A', playerOutId: 'p', playerInId: 'other', position: 'ST' }],
  })]
  const foreign = game(3, '4-3-3', [appearance('p', 'GK', { teamId: 'B' })], { teamId: 'B' })
  const otherSeason = game(4, '4-2-1-3', [appearance('p', 'GK')], { season: 'Season 2' })
  const cup = game(5, '4-4-2', [appearance('p', 'GK')], { competitionType: 'cup' })
  const result = teamHistoryBestXI(players, [...games, foreign, otherSeason, cup], { teamId: 'A', season: 'Season 1', competition: 'league' })
  const slot = result.bestXI.find(slot => slot.playerId === 'p')
  // Drawn scoreless ST = 6.5; winning scored ST = 6.5 + .1 + .9 = 7.5.
  assert(Math.abs(slot.avgRating - 7.0) < 1e-10)
  assert.equal(slot.teamId, 'A')
  assert.equal(slot.matches, 2)
  assert.equal(result.teamMatches, 2)
  assert.equal(result.statsByPlayer.p.goals, 1)
})

test('History fills fine main roles first and accepts a secondary only at 20 percent of player minutes', () => {
  const players = ['main-left', 'high-central', 'secondary', 'too-little'].map(id => player(id))
  const games = Array.from({ length: 5 }, (_, i) => game(i + 1, '4-2-1-3', [
    appearance('main-left', 'LB'),
    appearance('high-central', 'CM', { positionHistory: [{ minute: 60, position: 'LB' }] }),
    appearance('secondary', 'CM', { positionHistory: [{ minute: 72, position: 'CDM' }] }),
    appearance('too-little', 'CM', { positionHistory: [{ minute: 73, position: 'CDM' }] }),
  ], { events: [{ id: `g${i}`, type: 'goal', minute: 10, teamId: 'A', playerId: 'high-central' }] }))
  const result = selectTeamHistoryBestXI(players, games, 'A')
  assert.equal(result.bestXI.find(slot => slot.slot === 'LB').playerId, 'main-left', 'higher rating in secondary role cannot replace a main-role player')
  assert.deepEqual(result.bestXI.filter(slot => ['LDM', 'RDM'].includes(slot.slot)).map(slot => slot.playerId), ['secondary', null])
  assert(!selected(result).includes('high-central'))
  assert(!selected(result).includes('too-little'))
  assert.equal(new Set(selected(result)).size, selected(result).length)
})

test('History main role is the most-played fine role rather than summed broad groups', () => {
  const players = [player('mixed')]
  const games = [game(1, '4-3-3', [appearance('mixed', 'CB', { positionHistory: [{ minute: 40, position: 'CM' }, { minute: 65, position: 'CAM' }] })])]
  const result = selectTeamHistoryBestXI(players, games, 'A')
  assert.equal(result.bestXI.find(slot => slot.playerId === 'mixed').position, 'LCB')
  assert.deepEqual(selected(result), ['mixed'])
})

test('History resolves main-role collisions before placing the remaining player in a qualified secondary role', () => {
  const players = ['first', 'second', 'main-deep'].map(id => player(id))
  const games = [game(1, '4-2-1-3', [
    appearance('first', 'CAM', { positionHistory: [{ minute: 60, position: 'CDM' }] }),
    appearance('second', 'CAM', { positionHistory: [{ minute: 72, position: 'CDM' }] }),
    appearance('main-deep', 'CDM'),
  ], { events: [10, 20, 30].map(minute => ({ id: `g${minute}`, type: 'goal', minute, teamId: 'A', playerId: 'first' })) })]
  const result = selectTeamHistoryBestXI(players, games, 'A')
  assert.equal(result.bestXI.find(slot => slot.slot === 'CAM').playerId, 'first')
  assert.deepEqual(result.bestXI.filter(slot => ['LDM', 'RDM'].includes(slot.slot)).map(slot => slot.playerId), ['main-deep', 'second'])
  assert.equal(new Set(selected(result)).size, 3)
})

test('History never fills a different fine role merely because its broad group matches', () => {
  const players = [player('striker')]
  const result = selectTeamHistoryBestXI(players, [game(1, '4-3-3', [appearance('striker', 'ST')])], 'A')
  assert.equal(result.bestXI.find(slot => slot.slot === 'ST').playerId, 'striker')
  assert.equal(result.bestXI.find(slot => slot.slot === 'LW').playerId, null)
  assert.equal(result.bestXI.find(slot => slot.slot === 'RW').playerId, null)
})

test('History selection is deterministic, immutable and invalidates edited saved formations', () => {
  const players = [player('z'), player('a')]
  const games = [game(1, '4-3-3', [appearance('z', 'CB'), appearance('a', 'CB')])]
  const before = JSON.stringify({ players, games })
  const scope = { teamId: 'A', season: 'Season 1', competition: 'all' }
  const first = teamHistoryBestXI(players, games, scope)
  assert.deepEqual(selected(first), ['a', 'z'])
  assert.equal(JSON.stringify({ players, games }), before)
  assert.strictEqual(teamHistoryBestXI(players, games, scope), first)
  games[0] = game(1, '4-2-1-3', games[0].appearances)
  const next = teamHistoryBestXI(players, games, scope)
  assert.notStrictEqual(first, next)
  assert.equal(next.formation.label, '4-2-1-3')
  games[0] = { ...games[0], events: [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'a' }] }
  const edited = teamHistoryBestXI(players, games, scope)
  assert.notStrictEqual(edited, next)
  assert.equal(edited.statsByPlayer.a.goals, 1)
  assert(edited.statsByPlayer.a.avgRating > next.statsByPlayer.a.avgRating)
  players[0] = { ...players[0], teamId: 'new-team' }
  const moved = teamHistoryBestXI(players, games, scope)
  assert.notStrictEqual(moved, edited)
  assert(moved.bestXI.filter(slot => slot.playerId).every(slot => slot.teamId === 'A'))
})

test('History caps credited minutes at regulation and excludes post-90-only rating samples', () => {
  const players = [player('p')]
  const games = [game(1, '4-3-3', [appearance('p', 'ST')], { duration: 95 }), game(2, '4-3-3', [appearance('p', 'ST', { role: 'bench' })], {
    duration: 95,
    events: [{ id: 'on', type: 'sub', minute: 92, teamId: 'A', playerInId: 'p', playerOutId: 'other', position: 'ST' }, { id: 'g', type: 'goal', minute: 94, teamId: 'A', playerId: 'p' }],
  })]
  const result = selectTeamHistoryBestXI(players, games, 'A')
  const slot = result.bestXI.find(slot => slot.playerId === 'p')
  assert.equal(slot.avgRating, 6.5)
  assert.equal(slot.matches, 1)
  assert.equal(result.availableTeamMinutes, 180)
})

test('History leaves unknown numeric formations empty without exact kickoff details', () => {
  const players = [player('p')]
  const games = [game(1, '4-4-1-1', [appearance('p', 'CM')])]
  const result = selectTeamHistoryBestXI(players, games, 'A')
  assert.equal(result.formation.label, '4-4-1-1')
  assert.deepEqual(result.bestXI, [])
  assert.equal(selectTeamHistoryBestXI(players, [game(1, '4-3-3', [appearance('p', 'CM')], { kickoffLineup: undefined })], 'A').bestXI.length, 11, 'known saved formation reuses canonical tactical slots')
})

test('History reuses the Latest XI pitch treatment and preserves scoped player navigation', () => {
  const players = [player('p')], games = [game(1, '4-3-3', [appearance('p', 'ST')])]
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/TeamHistory.tsx', 'TeamHistory', {})
  const routes = []
  const tree = h.render({ teamId: 'A', season: 'Season 1', teams: [{ id: 'A' }], players, matches: games, states: [], screenState: { historyMenu: 'best-xi', historyCompetition: 'league' }, onStateChange: () => {}, onNavigate: route => routes.push(route) })
  const pitch = nodes(tree, node => node.type?.name === 'Pitch')[0]
  assert.ok(pitch, 'History renders the same Pitch component directly as Latest XI')
  assert.equal(pitch.props.presentation, 'history')
  assert.equal(pitch.props.showPositionBadge, false)
  assert.equal(pitch.props.showEmptySlots, true)
  assert.equal(pitch.props.emptyRatingLabel, '—')
  assert.equal(pitch.props.showAwardTeamCrest, undefined)
  assert.equal(pitch.props.motmPlayerId, undefined)
  assert.match(JSON.stringify(tree), /30%/)
  pitch.props.onSlotClick(pitch.props.slots.find(slot => slot.playerId === 'p'))
  assert.deepEqual(routes, [{ name: 'player', id: 'p', season: 'Season 1', competitionType: 'league' }])
})

test('History preserves saved normalized coordinates through the Latest XI renderer and renders passive vacancies', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { Pitch } = require('../src/components/Pitch.tsx')
  const players = [player('p')], match = game(1, '4-3-3', [appearance('p', 'ST')])
  match.kickoffLineup = match.kickoffLineup.map(slot => slot.id === 'ST' ? { ...slot, x: .4, y: .2 } : slot)
  const result = selectTeamHistoryBestXI(players, [match], 'A')
  const striker = result.bestXI.find(slot => slot.slot === 'ST')
  assert.equal(striker.x, .4)
  assert.equal(striker.y, .2)
  const html = renderToStaticMarkup(React.createElement(Pitch, { slots: result.bestXI, players, presentation: 'history', showEmptySlots: true, showPositionBadge: false, emptyRatingLabel: '—' }))
  assert.match(html, /style="left:40%;top:20%"/)
  assert.match(html, /aria-label="Vacant LB slot"/)
  assert.match(html, /pointer-events-none absolute flex w-16/)
  assert.match(html, /aspect-\[3\/4\]/)
})
