require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { teams, game, cupFixture } = require('./helpers/v258-fixture.cjs')
const { cupCompetition, stageRanking, boundaryTieIds } = require('../src/engine/competition.ts')
const { cupTableModel } = require('../src/lib/cupTable.ts')
const project = (matches, selection = null) => { const cup = cupCompetition(teams, matches, 'S1'); return { cup, model: cupTableModel(teams, matches, 'S1', [], cup, selection) } }

// Catches ranking all unplayed teams together with played losers and assigning
// two risk teams regardless of how many participants actually played.
for (const p of [0, 1, 2, 3, 4, 5, 6]) test(`incomplete Stage with P=${p} has played-first rows, ${Math.min(2, p)} risk teams and consecutive display ranks`, () => {
  const matches = Array.from({ length: p }, (_, i) => game(`g${i}`, teams[i].id, { ga: i + 1 }))
  const { cup, model } = project(matches)
  assert.equal(model.provisional, true)
  assert.equal(model.rows.length, 16)
  assert.deepEqual(model.rows.slice(0, p).map(r => r.teamId), teams.slice(0, p).map(t => t.id))
  assert.deepEqual(model.rows.map(r => r.rank), Array.from({ length: 16 }, (_, i) => i + 1))
  assert.deepEqual(model.rows.slice(Math.max(0, p - 2), p).map(r => r.state), Array(Math.min(2, p)).fill('at-risk'))
  assert(model.rows.slice(0, Math.max(0, p - 2)).every(r => r.state === 'surviving'))
  assert(model.rows.slice(p).every(r => r.state === 'not-played' && r.status === 'Not Played' && r.played === 0))
  assert.deepEqual(model.eliminationDrawTeamIds, [])
  assert.equal(cup.stage, 'stage1'); assert.deepEqual(cup.eliminatedTeamIds, [])
})

test('played participants retain official tie-break ordering while input and engine rows remain untouched', () => {
  const matches = [game('loss', 'T1', { ga: 2 }), game('win', 'T2', { gf: 1 }), game('draw', 'T3'), game('bigwin', 'T4', { gf: 3 })]
  const cup = cupCompetition(teams, matches, 'S1')
  const snapshot = JSON.stringify({ matches, cup })
  const model = cupTableModel(teams, matches, 'S1', [], cup, null)
  assert.deepEqual(model.rows.slice(0, 4).map(r => [r.teamId, r.state]), [['T4', 'surviving'], ['T2', 'surviving'], ['T3', 'at-risk'], ['T1', 'at-risk']])
  assert.deepEqual(model.rows.slice(4).map(r => r.teamId), cup.standings.filter(r => !['T1', 'T2', 'T3', 'T4'].includes(r.teamId)).map(r => r.teamId))
  assert.equal(JSON.stringify({ matches, cup }), snapshot)
  assert.equal(cupTableModel(teams, matches, 'S1', [], cup, 'stage1'), model)
})

test('Stage 3 groups preserve prior official elimination ranks and frozen cumulative statistics', () => {
  const matches = cupFixture(2)
  const before = cupCompetition(teams, matches, 'S1')
  const active = before.activeTeamIds
  matches.push(...active.slice(-3).map((id, i) => game(`s3:${id}`, id, { competitionStage: 'stage3', ga: i + 1 })))
  const { cup, model } = project(matches)
  assert.equal(model.rows.length, 16)
  assert.deepEqual(model.rows.slice(0, 3).map(r => r.teamId), active.slice(-3))
  assert(model.rows.slice(3, 12).every(r => r.state === 'not-played'))
  assert.deepEqual(model.rows.slice(12).map(({ status: _status, ...r }) => r), cup.rows.filter(r => r.state === 'eliminated'))
  assert(model.rows.slice(12).every(r => /^Eliminated · Stage [12]$/.test(r.status)))
  assert.deepEqual(model.rows.slice(0, 12).map(r => r.rank), Array.from({ length: 12 }, (_, i) => i + 1))
})

test('credited home/away and legacy records count each eligible owner once and ignore other scopes', () => {
  const legacy = game('legacy', 'T3'); delete legacy.teamId
  const matches = [game('both', 'T1', { awayTeamId: 'T2' }), legacy, legacy,
    game('league', 'T4', { competitionType: 'league', competitionStage: 'regular' }),
    game('champions', 'T5', { competitionType: 'champions', competitionStage: 'roundOf16' }),
    game('future', 'T6', { competitionStage: 'stage2' }), game('season', 'T7', { season: 'S2' }), game('outsider', 'outside')]
  const { model } = project(matches)
  assert.equal(model.rows.filter(r => r.state === 'at-risk').length, 2)
  assert.deepEqual(new Set(model.rows.slice(0, 3).map(r => r.teamId)), new Set(['T1', 'T2', 'T3']))
  assert(model.rows.slice(3).every(r => r.state === 'not-played'))
  assert.equal(model.rows.find(r => r.teamId === 'T3').played, 2, 'statistics follow official duplicate semantics; credited count remains one')
})

test('immutable match edits/deletes refresh risk groups while selection revisits reuse the same projection', () => {
  const matches = [game('one', 'T1', { gf: 1 }), game('two', 'T2', { gf: 2 }), game('three', 'T3', { ga: 1 })]
  const first = project(matches)
  assert.deepEqual(first.model.rows.filter(r => r.state === 'at-risk').map(r => r.teamId), ['T1', 'T3'])
  const edited = project(matches.map(m => m.id === 'three' ? game('three', 'T3', { gf: 5 }) : m))
  assert.deepEqual(edited.model.rows.filter(r => r.state === 'at-risk').map(r => r.teamId), ['T2', 'T1'])
  const removed = project(matches.slice(0, 1))
  assert.deepEqual(removed.model.rows.filter(r => r.state === 'at-risk').map(r => r.teamId), ['T1'])
  assert.notEqual(edited.model, first.model)
  assert.equal(cupTableModel(teams, matches, 'S1', [], first.cup, 'stage1'), first.model)
  assert.notEqual(cupTableModel(teams, matches, 'S1', [], first.cup, 'total'), first.model)
})

test('previously eliminated teams cannot count as current participants even with later saved records', () => {
  const matches = cupFixture(2)
  const official = cupCompetition(teams, matches, 'S1')
  const eliminatedId = official.eliminatedTeamIds[0]
  matches.push(game('invalid-participant', eliminatedId, { competitionStage: 'stage3', gf: 8 }))
  const { model } = project(matches)
  assert.equal(model.rows.filter(r => r.state === 'at-risk').length, 0)
  assert.equal(model.rows.filter(r => r.state === 'not-played').length, 12)
  assert.equal(model.rows.find(r => r.teamId === eliminatedId).state, 'eliminated')
  assert.equal(model.rows.find(r => r.teamId === eliminatedId).played, 1)
})

test('switching cached Cup Stage/Total views never reruns the official engine on revisits', () => {
  const engine = require('../src/engine/competition.ts')
  const matches = cupFixture(3); const cup = engine.cupCompetition(teams, matches, 'S1')
  const original = engine.cupCompetition; let calls = 0
  engine.cupCompetition = (...args) => { calls++; return original(...args) }
  try {
    const current = cupTableModel(teams, matches, 'S1', [], cup, null)
    const total = cupTableModel(teams, matches, 'S1', [], cup, 'total')
    assert.equal(calls, 0)
    const past = cupTableModel(teams, matches, 'S1', [], cup, 'stage2')
    assert.equal(calls, 2, 'first historical view restores before/after official state')
    for (let i = 0; i < 4; i++) {
      assert.equal(cupTableModel(teams, matches, 'S1', [], cup, 'stage2'), past)
      assert.equal(cupTableModel(teams, matches, 'S1', [], cup, 'total'), total)
      assert.equal(cupTableModel(teams, matches, 'S1', [], cup, null), current)
    }
    assert.equal(calls, 2)
  } finally { engine.cupCompetition = original }
})

for (const n of [1, 2, 7]) test(`completed Stage ${n} uses official elimination and history without provisional risk`, () => {
  const matches = cupFixture(n)
  const { cup, model } = project(matches, `stage${n}`)
  assert.equal(model.complete, true); assert.notEqual(model.provisional, true)
  assert.equal(model.rows.length, 16); assert.equal(model.rows.filter(r => r.state === 'at-risk').length, 0)
  assert.deepEqual(model.rows.filter(r => r.eliminatedStage === n).map(r => r.teamId), cup.rows.filter(r => r.eliminatedStage === n).map(r => r.teamId))
  assert(model.rows.filter(r => r.eliminatedStage === n).every(r => r.state === 'eliminated'))
  assert.deepEqual(model.rows.map(r => r.rank), Array.from({ length: 16 }, (_, i) => i + 1))
  const later = [...matches, ...cup.activeTeamIds.map(id => game(`next:${id}`, id, { competitionStage: cup.stage, gf: 1 }))]
  const { availableStages: _oldStages, ...historical } = model
  const { availableStages: _newStages, ...laterHistorical } = project(later, `stage${n}`).model
  assert.deepEqual(laterHistorical, historical)
})

test('pending boundary ties are suppressed and completed Elimination Draw remains official', () => {
  const pending = project([game('t1', 'T1'), game('t2', 'T2'), game('t3', 'T3')])
  assert.deepEqual(pending.model.eliminationDrawTeamIds, [])
  const matches = teams.map(t => game(t.id, t.id))
  const { model } = project(matches, 'stage1')
  assert.deepEqual(model.eliminationDrawTeamIds, boundaryTieIds(stageRanking(teams.map(t => t.id), matches, 'S1', [], 'S1:stage1')))
  assert.equal(model.eliminationDrawTeamIds.length, 16)
})

test('Final, Replay and Total retain official winners and neutral/non-risk rows', () => {
  const matches = cupFixture(7)
  let cup = cupCompetition(teams, matches, 'S1')
  for (const selection of ['final', 'total']) {
    const model = cupTableModel(teams, matches, 'S1', [], cup, selection)
    assert.notEqual(model.provisional, true); assert.equal(model.rows.filter(r => r.state === 'at-risk').length, 0)
    if (selection === 'total') assert(model.rows.every(r => r.state === 'normal'))
  }
  matches.push(...cup.activeTeamIds.map(id => game(`final:${id}`, id, { competitionStage: 'final' })))
  cup = cupCompetition(teams, matches, 'S1'); assert.equal(cup.stage, 'finalReplay')
  assert.equal(cupTableModel(teams, matches, 'S1', [], cup, 'final').replayRequired, true)
  matches.push(...cup.activeTeamIds.map((id, i) => game(`replay:${id}`, id, { competitionStage: 'finalReplay', gf: 2 - i })))
  cup = cupCompetition(teams, matches, 'S1')
  const replay = cupTableModel(teams, matches, 'S1', [], cup, 'finalReplay')
  assert.equal(replay.rows[0].status, 'Champion'); assert.equal(replay.rows[1].status, 'Runner-up')
  assert.equal(replay.rows[0].teamId, cup.championId)
  assert(cupTableModel(teams, matches, 'S1', [], cup, 'total').rows.every(r => r.state === 'normal'))
})
