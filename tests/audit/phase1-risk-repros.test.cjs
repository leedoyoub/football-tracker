// Run separately: node --test tests/audit/phase1-risk-repros.test.cjs
// These assertions describe desired safety properties and are expected to fail
// against the audited revision. They do not run under npm test.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJS },
    }).outputText,
    filename,
  )
}

test('later state change composes with an already verified match', async () => {
  const { createStoreTransactions } = require('../../src/lib/storeTransactions.ts')
  let primary = { teams: [], players: [], matches: [] }
  const transactions = createStoreTransactions(primary, async snapshot => { primary = snapshot }, () => {})
  const saved = transactions.commit(current => ({ ...current, matches: [{ id: 'M' }] }))
  const later = transactions.commit(current => ({ ...current, players: [{ id: 'P' }] }))
  await Promise.all([saved.persisted, later.persisted])
  assert.deepEqual(primary.matches.map(match => match.id), ['M'])
  assert.deepEqual(primary.players.map(player => player.id), ['P'])
})

test('moving a bench player to an extra tactical slot keeps the starting XI at most 11', () => {
  const { moveLineup } = require('../../src/screens/matchLineup.ts')
  const { TACTICAL_SLOT_DEFINITIONS } = require('../../src/engine/tacticalSlots.ts')
  const ids = TACTICAL_SLOT_DEFINITIONS.slice(0, 12).map(slot => slot.id)
  const lineup = { slotAssignments: Object.fromEntries(ids.slice(0, 11).map((id, index) => [id, `P${index}`])), homeBench: ['P11'] }
  const moved = moveLineup(lineup, { group: 'starting', id: ids[11] }, { group: 'substitute', id: 'P11' })
  assert.ok(Object.values(moved.slotAssignments).filter(Boolean).length <= 11)
})

test('a valid partial kickoff draft with ten starters can be restored', () => {
  const { restoreDraft } = require('../../src/lib/editorRestore.ts')
  const { TACTICAL_SLOT_DEFINITIONS } = require('../../src/engine/tacticalSlots.ts')
  const slots = TACTICAL_SLOT_DEFINITIONS.slice(0, 10)
  const players = slots.map((slot, index) => ({ id: `P${index}`, name: `P${index}`, teamId: 'T', position: slot.ratingPosition, number: index + 1 }))
  const appearances = slots.map((slot, index) => ({ playerId: `P${index}`, teamId: 'T', position: slot.ratingPosition, matchPosition: slot.ratingPosition, role: 'starter' }))
  const match = { id: 'draft', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'T', awayTeamId: 'O', teamId: 'T', appearances, events: [] }
  assert.notEqual(restoreDraft(match, players), null)
})

test('competition scope cache notices a same-length in-place match change', () => {
  const { competitionMatches } = require('../../src/engine/competition.ts')
  const matches = [{ id: 'M', season: 'S1', competitionType: 'league' }]
  assert.equal(competitionMatches(matches, 'S1', 'league').length, 1)
  matches[0] = { ...matches[0], competitionType: 'cup' }
  assert.equal(competitionMatches(matches, 'S1', 'league').length, 0)
})

test('save validation rejects a duplicate League team MatchDay slot', () => {
  const { leagueSlotConflict } = require('../../src/engine/competition.ts')
  const match = id => ({ id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'T', awayTeamId: `O-${id}`, teamId: 'T', appearances: [], events: [] })
  const saved = match('M1')
  assert.equal(leagueSlotConflict([saved], match('M2'))?.id, 'M1')
})

test('Best Attack Trio winner has the highest displayed combined G+A', () => {
  const { seasonRecap } = require('../../src/engine/seasonInsights.ts')
  const player = (id, position) => ({ id, name: id, teamId: 'T', teamIds: ['T'], position, number: Number(id.slice(1)) })
  const players = [1, 2, 3, 4, 5, 6].map((number, index) => player(`P${number}`, ['LW', 'ST', 'RW'][index % 3]))
  const fixture = (id, trio, goals) => ({
    id, season: 'S1', matchDay: Number(id.slice(1)), date: `2026-01-0${id.slice(1)}`, duration: 90,
    homeTeamId: 'T', awayTeamId: 'O', teamId: 'T', opponentName: 'O',
    appearances: trio.map((playerId, index) => ({ playerId, teamId: 'T', position: ['LW', 'ST', 'RW'][index], role: 'starter' })),
    events: goals ? [{ id: `G${id}`, type: 'goal', minute: 10, teamId: 'T', playerId: trio[0] }] : [],
  })
  const matches = [fixture('M1', ['P1', 'P2', 'P3'], 0), fixture('M2', ['P1', 'P2', 'P3'], 0), fixture('M3', ['P1', 'P2', 'P3'], 0), fixture('M4', ['P4', 'P5', 'P6'], 1), fixture('M5', ['P4', 'P5', 'P6'], 1)]
  const winner = seasonRecap(players, matches, 'S1', [], [{ id: 'T', name: 'T' }]).awards.find(award => award.id === 'attack')
  assert.deepEqual(winner.playerIds, ['P4', 'P5', 'P6'])
})
