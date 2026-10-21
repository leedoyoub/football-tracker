require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeTeamHistoryFormation, mostUsedTeamHistoryFormation, selectTeamHistoryBestXI } = require('../src/engine/teamHistorySelection.ts')
const { scopedTeamHistoryGroupByPlayer } = require('../src/engine/positionScope.ts')
const { awardCandidatesForScope } = require('../src/engine/awards.ts')
const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')

const player = (id, position = 'ST') => ({ id, name: id, teamId: 'elsewhere', position })
const appearance = (playerId, position, extra = {}) => ({ playerId, teamId: 'A', role: 'starter', position, matchPosition: position, ...extra })
function game(id, formation = '3-5-2', appearances = []) {
  return { id, season: 'Season 1', date: `2026-01-${String(id).padStart(2, '0')}`, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', competitionType: 'league', matchDay: Number(id) || 1, formation, appearances, events: [] }
}
const shape = (label, defenders, midfielders, forwards) => ({ label, defenders, midfielders, forwards })

test('Team History merges every middle formation line before counting frequency', () => {
  for (const [raw, expected] of [['4-3-3', '4-3-3'], ['4-1-2-3', '4-3-3'], ['4-2-1-3', '4-3-3'], ['4-2-2-2', '4-4-2'], ['4-2-3-1', '4-5-1'], ['4-1-4-1', '4-5-1'], ['3-2-3-2', '3-5-2'], ['3-4-1-2', '3-5-2']]) {
    assert.equal(normalizeTeamHistoryFormation(raw).label, expected)
  }
  const games = ['4-1-2-3', '4-2-1-3', '4-3-3', '4-4-2', '4-4-2'].map((formation, index) => game(index + 1, formation))
  assert.deepEqual(mostUsedTeamHistoryFormation(games, 'A'), { ...shape('4-3-3', 4, 3, 3), matches: 3 })
})

test('invalid and absent saved formations do not fabricate a most-used shape', () => {
  for (const value of [undefined, null, '', '4-3', '4-3-4', '4.5-3-2.5', '-4-4-2', '4--4-2', 'garbage', '4-NaN-2']) assert.equal(normalizeTeamHistoryFormation(value), null)
  assert.equal(normalizeTeamHistoryFormation(' 4-2-3-1 ').label, '4-5-1')
  assert.equal(mostUsedTeamHistoryFormation([game(1, undefined), game(2, 'invalid')].map(match => ({ ...match, formation: '' })), 'A'), null)
  assert.equal(mostUsedTeamHistoryFormation([], 'A'), null)
})

test('equal formation counts prefer canonical latest use, including legacy insertion chronology', () => {
  const games = [game(1, '4-4-2'), game(2, '3-5-2')]
  assert.equal(mostUsedTeamHistoryFormation(games, 'A').label, '3-5-2')
  assert.equal(mostUsedTeamHistoryFormation(games.map(match => ({ ...match, date: undefined })), 'A').label, '3-5-2')
  assert.equal(mostUsedTeamHistoryFormation([{ ...games[0], recordedAt: '2026-02-01', date: '2026-01-02' }, { ...games[1], recordedAt: '2026-01-31' }], 'A').label, '4-4-2')
})

test('formation belongs to recorded roster owner and never follows end-of-match moves', () => {
  const own = game(1, '4-2-3-1', [appearance('mover', 'ST', { positionHistory: [{ minute: 10, position: 'CB' }] })])
  const opponent = { ...game(2, '3-5-2'), teamId: 'B' }
  const legacyOpponent = { ...game(3, '3-5-2'), teamId: undefined, homeTeamId: 'B', awayTeamId: 'A' }
  assert.deepEqual(mostUsedTeamHistoryFormation([own, opponent, legacyOpponent], 'A'), { ...shape('4-5-1', 4, 5, 1), matches: 1 })
})

test('complete explicit kickoff snapshots safely recover missing numeric metadata, never guessed appearances', () => {
  const kickoffLineup = kickoffFromAssignments(Object.fromEntries(['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW'].map((slot, i) => [slot, `p${i}`])))
  const match = { ...game(1, ''), kickoffLineup }
  assert.equal(mostUsedTeamHistoryFormation([match], 'A').label, '4-3-3')
  assert.equal(mostUsedTeamHistoryFormation([{ ...match, kickoffLineup: kickoffLineup.slice(1) }], 'A'), null)
  assert.equal(mostUsedTeamHistoryFormation([{ ...match, kickoffLineup: kickoffLineup.map(slot => ({ ...slot, playerId: 'duplicate' })) }], 'A'), null)
  assert.equal(mostUsedTeamHistoryFormation([{ ...match, kickoffLineup: kickoffLineup.map(slot => slot.id === 'GK' ? { ...slot, ratingPosition: 'CB' } : slot.id === 'LCB' ? { ...slot, ratingPosition: 'GK' } : slot) }], 'A'), null, 'contradictory tactical IDs and rating roles are corrupt, not a historical formation')
  assert.equal(mostUsedTeamHistoryFormation([{ ...game(1, ''), appearances: kickoffLineup.map(slot => appearance(slot.playerId, slot.matchPosition)) }], 'A'), null)
})

test('broad role uses summed group minutes rather than the single dominant fine position', () => {
  const players = [player('mixed', 'ST'), player('tie', 'ST'), player('alias', 'GK'), player('unused', 'GK')]
  const games = [game(1, '3-5-2', [
    appearance('mixed', 'CB', { positionHistory: [{ minute: 40, position: 'CM' }, { minute: 65, position: 'RAM' }] }),
    appearance('tie', 'ST', { positionHistory: [{ minute: 45, position: 'LWB' }] }),
    appearance('alias', 'LAM'), appearance('unused', 'GK', { role: 'bench' }),
  ])]
  const groups = scopedTeamHistoryGroupByPlayer(players, games, { teams: ['A'] })
  assert.equal(groups.get('mixed'), 'MID', 'CM25 + RAM25 exceeds CB40')
  assert.equal(groups.get('tie'), 'DEF', 'stable group order GK, DEF, MID, FW breaks equal minute totals')
  assert.equal(groups.get('alias'), 'MID')
  assert.equal(groups.has('unused'), false, 'no registered-position fallback')
})

test('broad minutes honor substitutes, regulation cap, team attribution and every supported alias', () => {
  const aliases = ['GK', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM', 'CAM', 'LCAM', 'RCAM', 'LAM', 'RAM', 'LM', 'RM', 'ST', 'LST', 'RST', 'SS', 'LW', 'RW']
  const players = aliases.map(alias => player(alias, 'GK'))
  const match = game(1, '4-3-3', aliases.map(alias => appearance(alias, alias)))
  const groups = scopedTeamHistoryGroupByPlayer(players, [match], { teams: ['A'] })
  assert.deepEqual(aliases.map(alias => groups.get(alias)), ['GK', ...Array(6).fill('DEF'), ...Array(13).fill('MID'), ...Array(6).fill('FW')])
  const sub = player('sub', 'GK'), zero = player('zero', 'ST')
  const substitution = { ...game(1, '4-3-3', [appearance('sub', 'CB', { role: 'bench', positionHistory: [{ minute: 70, position: 'CM' }] }), appearance('zero', 'ST', { role: 'bench' })]), duration: 95, events: [{ id: 'on', type: 'sub', minute: 60, teamId: 'A', playerInId: 'sub', playerOutId: 'other', position: 'RAM' }, { id: 'late', type: 'sub', minute: 92, teamId: 'A', playerInId: 'zero', playerOutId: 'another', position: 'ST' }] }
  const foreign = game(2, '4-3-3', [appearance('sub', 'GK', { teamId: 'B' })])
  const scoped = scopedTeamHistoryGroupByPlayer([sub, zero], [substitution, foreign], { teams: ['A'] })
  assert.equal(scoped.get('sub'), 'MID'); assert.equal(scoped.has('zero'), false)
})

for (const [formation, counts] of [['3-5-2', [1, 3, 5, 2]], ['4-4-2', [1, 4, 4, 2]], ['4-5-1', [1, 4, 5, 1]]]) test(`${formation} selects broad quotas using unchanged cumulative score order`, () => {
  const roles = ['GK', ...Array(5).fill('CB'), ...Array(6).fill('RAM'), ...Array(4).fill('ST')]
  const players = roles.map((role, index) => player(`p${index}`, 'GK'))
  const games = Array.from({ length: 3 }, (_, i) => game(i + 1, formation, roles.map((role, index) => appearance(players[index].id, role))))
  const before = JSON.stringify({ players, games })
  const result = selectTeamHistoryBestXI(players, games, 'A')
  assert.deepEqual(['GK', 'DEF', 'MID', 'FW'].map(group => result.bestXI.filter(slot => slot.displayPosition === group).length), counts)
  assert.equal(result.bestXI.length, 11); assert.equal(result.minimumAppearances, 2)
  assert.equal(new Set(result.bestXI.map(slot => slot.playerId)).size, 11)
  assert(result.bestXI.every(slot => slot.teamId === 'A'))
  const candidates = awardCandidatesForScope(players, games).filter(candidate => candidate.teamId === 'A')
  const groups = scopedTeamHistoryGroupByPlayer(players, games, { teams: ['A'] })
  for (const group of ['GK', 'DEF', 'MID', 'FW']) assert.deepEqual(result.bestXI.filter(slot => slot.displayPosition === group).map(slot => slot.playerId), candidates.filter(candidate => groups.get(candidate.playerId) === group).slice(0, counts[['GK', 'DEF', 'MID', 'FW'].indexOf(group)]).map(candidate => candidate.playerId))
  assert.equal(result.bestPlayerId, candidates[0].playerId)
  assert.equal(JSON.stringify({ players, games }), before, 'read-only projection never migrates saved data')
})

test('40 percent eligibility preserves historical transfers/releases, vacancies, and empty states', () => {
  const players = [player('released', 'ST'), player('boundary', 'GK'), player('rare', 'ST'), player('foreign', 'CB')]
  players[0].teamId = ''
  const games = Array.from({ length: 5 }, (_, i) => game(i + 1, '3-5-2', [appearance('released', 'GK'), appearance('boundary', 'RAM', { role: i < 2 ? 'starter' : 'bench' }), appearance('rare', 'ST', { role: i === 0 ? 'starter' : 'bench' }), appearance('foreign', 'CB', { teamId: 'B' })]))
  const result = selectTeamHistoryBestXI(players, games, 'A')
  assert.equal(result.teamMatches, 5); assert.equal(result.minimumAppearances, 2)
  assert.equal(result.bestXI[0].playerId, 'released')
  assert(result.bestXI.some(slot => slot.playerId === 'boundary'))
  assert(!result.bestXI.some(slot => ['rare', 'foreign'].includes(slot.playerId)))
  assert(result.bestXI.some(slot => slot.playerId === null))
  assert.equal(Object.keys(result.statsByPlayer).length, 2)
  assert.deepEqual(selectTeamHistoryBestXI(players, [], 'A').bestXI, [])
  const noFormation = selectTeamHistoryBestXI(players, games.map(match => ({ ...match, formation: '' })), 'A')
  assert.equal(noFormation.formation, null); assert.deepEqual(noFormation.bestXI, [])
  const noCandidates = selectTeamHistoryBestXI([], games, 'A')
  assert.equal(noCandidates.bestXI.length, 11); assert(noCandidates.bestXI.every(slot => slot.playerId === null))
})
