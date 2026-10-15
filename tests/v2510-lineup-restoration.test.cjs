require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createFreshLineup } = require('../src/screens/matchLineup.ts')
const { assignLineupVacancies, fillFormationSlots } = require('../src/engine/lineupSuggestion.ts')
const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')
const { restoreDraft } = require('../src/lib/editorRestore.ts')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const p = (id, position) => ({ id, position, teamId: 'A', teamIds: ['A'], name: id, number: 1 })
const fill = (players, recent, bench = []) => createFreshLineup(players, recent, bench, {})

test('global vacancy assignment matches exhaustive fit and deterministic tie ordering across roster permutations', () => {
  const family = position => ['LCB', 'CB', 'RCB'].includes(position) ? 'CB' : ['LST', 'ST', 'RST'].includes(position) ? 'ST' : position
  const slots = ['LCB', 'RCB', 'ST', 'GK'].map(position => ({ slot: position, position }))
  const registered = ['GK', 'LCB', 'CB', 'RCB', 'ST', 'LST']
  const brute = candidates => {
    let best = { score: -1, picks: [] }
    const visit = (index, used, picks, score) => {
      if (index === slots.length) {
        const betterTie = picks.some((value, i) => value !== best.picks[i] && picks.slice(0, i).every((v, j) => v === best.picks[j]) && value < best.picks[i])
        if (score > best.score || score === best.score && betterTie) best = { score, picks: [...picks] }
        return
      }
      visit(index + 1, used, [...picks, Infinity], score)
      candidates.forEach((candidate, i) => {
        const target = slots[index].position
        if (used.has(i) || (candidate.position === 'GK') !== (target === 'GK')) return
        const tier = family(candidate.position) === family(target) ? candidate.position === target ? 3 : 2 : 0
        visit(index + 1, new Set([...used, i]), [...picks, i], score + 12 ** 4 + 12 ** tier)
      })
    }
    visit(0, new Set(), [], 0)
    return best.picks.map(index => candidates[index]?.id ?? '')
  }
  for (let rotation = 0; rotation < registered.length; rotation++) for (let size = 2; size <= registered.length; size++) {
    const candidates = [...registered.slice(rotation), ...registered.slice(0, rotation)].slice(0, size).map((position, i) => p(`p${i}`, position))
    assert.deepEqual(assignLineupVacancies(candidates, slots), brute(candidates))
  }
})

test('departed centre-back is replaced by a matching new signing ahead of an earlier attacking bench player', () => {
  const result = fill([p('striker', 'ST'), p('new-cb', 'CB')], { LCB: 'departed' }, ['striker'])
  assert.equal(result.slotAssignments.LCB, 'new-cb')
  assert.deepEqual(result.homeBench, ['striker'])
})

test('vacancy fit tiers prefer exact side, same family, related defence, then other field positions', () => {
  for (const [positions, want] of [
    [['ST', 'CB', 'LCB'], 'c2'], [['ST', 'RB', 'CB'], 'c2'], [['ST', 'RB'], 'c1'], [['ST'], 'c0'],
  ]) {
    const players = positions.map((position, index) => p(`c${index}`, position))
    assert.equal(fill(players, { LCB: 'departed' }, players.map(player => player.id)).slotAssignments.LCB, want)
  }
})

test('global assignment reserves the only exact fit for its later slot', () => {
  const players = [p('right', 'RCB'), p('central', 'CB')]
  const result = fill(players, { LCB: 'left-departed', RCB: 'right-departed' }, ['right', 'central'])
  assert.deepEqual(result.slotAssignments, { LCB: 'central', RCB: 'right' })
})

test('equal vacancy fits follow previous bench order then stable roster order', () => {
  const players = [p('first-roster', 'CB'), p('last-roster', 'CB'), p('bench-first', 'CB')]
  assert.deepEqual(fill(players, { LCB: 'gone', RCB: 'gone2' }, ['bench-first']).slotAssignments, { LCB: 'bench-first', RCB: 'first-roster' })
})

test('retained starters preserve their tactical slots after registration position changes', () => {
  assert.deepEqual(fill([p('retained', 'RW'), p('perfect', 'LCB')], { LCB: 'retained' }).slotAssignments, { LCB: 'retained' })
})

test('initial formation assignment cannot consume its only goalkeeper for a field slot', () => {
  const players = [p('keeper', 'GK'), p('field', 'ST')]
  assert.deepEqual(fillFormationSlots(players, [{ slot: 'LCB', position: 'LCB' }, { slot: 'GK', position: 'GK' }]), ['field', 'keeper'])
  assert.deepEqual(fill([p('field', 'ST')], { GK: 'gone', LCB: 'gone2' }).slotAssignments, { LCB: 'field' })
})

test('23 players with no goalkeeper fill ten field slots and cap the bench at twelve', () => {
  const slots = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW']
  const prior = Object.fromEntries(slots.map((slot, index) => [slot, `gone-${index}`]))
  const players = Array.from({ length: 23 }, (_, index) => p(`p${index}`, 'CM'))
  const result = fill(players, prior)
  assert.equal(Object.keys(result.slotAssignments).length, 10)
  assert.equal(result.slotAssignments.GK, undefined)
  assert.equal(result.homeBench.length, 12)
  assert.equal(new Set([...Object.values(result.slotAssignments), ...result.homeBench]).size, 22)
})

test('Available Squad gives an unassigned player access to a ten-starter lineup with a full bench', () => {
  const slots = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW']
  const players = Array.from({ length: 23 }, (_, index) => p(`p${index}`, index === 0 ? 'GK' : 'CM'))
  const assignments = Object.fromEntries(slots.filter(slot => slot !== 'ST').map((slot, index) => [slot, `p${index}`]))
  const match = { id: 'partial', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90,
    kickoffLineup: kickoffFromAssignments(assignments, false), events: [], appearances: players.slice(0, 22).map((player, index) => ({ playerId: player.id, teamId: 'A', position: player.position, role: index < 10 ? 'starter' : 'bench' })) }
  const store = { players, teams: [], matches: [], competitionStates: [], saveDraftMatch() {} }
  const restored = restoreDraft(match, players, true)
  const harness = screenHarness(path.resolve(__dirname, '..'), 'screens/NewMatchScreen.tsx', 'MatchEditor', store)
  const props = { mode: 'resume', sourceMatch: match, selectedTeamId: 'A', restored, freshCheckpointId: 'fresh', onBack() {}, onComplete() {} }
  let tree = harness.render(props)
  const available = nodes(tree, node => node.props?.title === 'Available Squad')[0]
  assert(available, 'unassigned player group must be reachable')
  assert.deepEqual(available.props.players.map(player => player.id), ['p22'])
  available.props.onClick('p22')
  tree = harness.render(props)
  nodes(tree, node => node.type?.name === 'Pitch')[0].props.onEmptySlotClick({ slot: 'ST' })
  tree = harness.render(props)
  const pitch = nodes(tree, node => node.type?.name === 'Pitch')[0]
  assert.equal(pitch.props.slots.find(slot => slot.slot === 'ST').playerId, 'p22')
  assert.equal(nodes(tree, node => node.props?.title === 'Bench (Max 12)')[0].props.players.length, 12)
})
