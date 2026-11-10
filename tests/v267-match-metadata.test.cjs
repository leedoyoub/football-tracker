require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')
const { screenHarness, nodes, sourceModule } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { normalizeMatchCompetitionIdentity, matchesCompetitionAssignmentExactly } = require('../src/engine/competitionContext.ts')
const { serializeCloudEntity, deserializeCloudEntity } = require('../src/lib/cloudMatch.ts')
const { isRecordedForTeam } = require('../src/engine/matchPerspective.ts')
const root = path.resolve(__dirname, '..')
const noop = () => {}
const fixture = performanceFixture(1)
const base = normalizeMatchCompetitionIdentity({ ...fixture.matches[0], recordedAt: 123, halftimeOpponentSot: 3, fulltimeOpponentSot: 8 })
const state = (matches = [base], extra = {}) => ({ teams: fixture.teams, players: fixture.players, matches, competitionStates: fixture.competitionStates, ...extra })
const convert = (match, type, season = 'Season 1', extra = {}) => {
  const { competitionPairingId: _pairing, competitionSeriesGame: _series, competitionAssignment: _assignment, ...rest } = match
  return normalizeMatchCompetitionIdentity({ ...rest, season, competitionType: type, competitionStage: type === 'league' ? 'regular' : type === 'cup' ? 'stage1' : 'roundOf16', matchDay: 1, ...(type === 'champions' ? { competitionPairingId: 'roundOf16:0', competitionSeriesGame: 1 } : {}), ...extra })
}
async function storeHarness(data, save = async () => ({ primarySaved: true, mirrorSaved: false })) {
  const repository = require('../src/lib/repository.ts')
  const h = screenHarness(root, 'store.tsx', 'StoreProvider', {}, { './lib/auth': { useAuth: () => ({ user: null }) }, './components/StartupBoundary': { BootstrapShell: () => null, StartupRecovery: () => null }, './lib/repository': { ...repository, LocalRepository: { getAppState: async () => data, saveAppState: save } }, './lib/sync': { SyncManager: { queueStateChange: async () => {}, syncNow: async () => {} } } })
  h.render({ children: null }); h.effects[0](); await Promise.resolve(); await Promise.resolve()
  return { ...h, value: () => h.render({ children: null }).props.value }
}

test('durable metadata edit rejects an occupied League destination before a primary write', async () => {
  const original = convert(base, 'champions'); const occupied = { ...base, id: 'occupied' }; let writes = 0
  const h = await storeHarness(state([original, occupied]), async () => { writes++; return { primarySaved: true, mirrorSaved: false } })
  await assert.rejects(h.value().saveMatchDurably(convert(original, 'league')), /occupied|duplicate/i)
  assert.equal(writes, 0); assert.equal(h.value().matches[0].competitionType, 'champions')
})

test('queued metadata edit revalidates the latest occupied slot and preserves the winning same-ID record', async () => {
  const original = convert(base, 'champions'); let release; let writes = 0
  const held = new Promise(resolve => { release = resolve })
  const h = await storeHarness(state([original]), async () => { writes++; if (writes === 1) await held; return { primarySaved: true, mirrorSaved: false } })
  const first = h.value().saveMatchDurably({ ...base, id: 'new-league' })
  const second = h.value().saveMatchDurably(convert(original, 'league'))
  const rejection = assert.rejects(second, /occupied|duplicate/i)
  release(); await first; await rejection
  assert.equal(writes, 1); assert.equal(h.value().matches.find(m => m.id === original.id).competitionType, 'champions')
})

test('metadata helper preserves every raw football fact and canonical/cloud agreement in all six type transitions', () => {
  const { applyMatchMetadata } = require('../src/lib/matchMetadata.ts')
  for (const from of ['league', 'cup', 'champions']) for (const to of ['league', 'cup', 'champions']) if (from !== to) {
    const original = convert(base, from)
    const target = convert(original, to)
    const result = applyMatchMetadata(original, { assignment: target.competitionAssignment, date: '2026-11-08', opponentName: 'Corrected opposition', homeAway: 'away' }, state([original]))
    assert.equal(result.id, original.id); assert.equal(result.recordedAt, 123)
    for (const field of ['events', 'appearances', 'kickoffLineup', 'duration', 'halftimeOpponentSot', 'fulltimeOpponentSot']) assert.deepEqual(result[field], original[field], `${from}->${to}: ${field}`)
    assert.equal(matchesCompetitionAssignmentExactly(result, result.competitionAssignment), true)
    assert.equal(result.opponentName, 'Corrected opposition'); assert.equal(result.homeAway, 'away')
    const cloud = serializeCloudEntity(result)
    assert.equal(cloud.competition_pairing_id, to === 'champions' ? 'roundOf16:0' : null)
    assert.equal(cloud.competition_series_game, to === 'champions' ? 1 : null)
    assert.deepEqual(deserializeCloudEntity(cloud), result)
  }
})

test('metadata validation rejects malformed target, missing draw, wrong pairing, duplicate game and invalid stages', () => {
  const { applyMatchMetadata } = require('../src/lib/matchMetadata.ts')
  const target = convert(base, 'champions').competitionAssignment
  const apply = (assignment, data = state()) => applyMatchMetadata(base, { assignment, date: base.date }, data)
  for (const assignment of [{ ...target, pairingId: 'roundOf16:7' }, { ...target, seriesGame: 2, matchDay: 2 }, { ...target, stage: 'quarterFinal', matchDay: 4 }, { ...target, seriesGame: 4, matchDay: 4 }, { ...base.competitionAssignment, matchDay: 31 }, { ...convert(base, 'cup').competitionAssignment, stage: 'stage2', matchDay: 2 }]) assert.throws(() => apply(assignment), /stage|round|series|game|pair|slot|range|available|prior/i)
  assert.throws(() => apply(target, state([base], { competitionStates: [] })), /draw/i)
  assert.throws(() => apply(target, state([base], { competitionStates: [{ ...fixture.competitionStates[0], teamIds: fixture.teams.map(t => t.id).slice(1) }] })), /draw/i)
  assert.throws(() => apply(target, state([base, { ...convert(base, 'champions'), id: 'duplicate' }])), /duplicate|occupied/i)
})

test('metadata Cup suggestions and validation use the official catalog when custom teams precede it', () => {
  const { applyMatchMetadata, suggestMatchMetadataAssignment } = require('../src/lib/matchMetadata.ts')
  const { STATIC_TEAMS } = require('../src/data/teams.ts')
  const custom = { ...STATIC_TEAMS[0], id: 'custom-first', externalTeamId: 999999, name: 'Custom First' }
  const teams = [custom, ...STATIC_TEAMS]
  const psg = STATIC_TEAMS.find(team => team.id === 'paris-saint-germain')
  const psgLeague = convert({ ...base, id: 'psg-league', teamId: psg.id, homeTeamId: psg.id, awayTeamId: 'external-psg', appearances: [], events: [] }, 'league')
  const customLeague = convert({ ...base, id: 'custom-league', teamId: custom.id, homeTeamId: custom.id, awayTeamId: 'external-custom', appearances: [], events: [] }, 'league')
  const data = state([psgLeague, customLeague], { teams })
  const psgCup = suggestMatchMetadataAssignment(psgLeague, 'cup', 'Season 1', data)
  assert.equal(psgCup.stage, 'stage1')
  assert.equal(applyMatchMetadata(psgLeague, { assignment: psgCup, date: psgLeague.date }, data).competitionType, 'cup')
  assert.throws(() => suggestMatchMetadataAssignment(customLeague, 'cup', 'Season 1', data), /unavailable|participant|eliminated|Cup/i)
  assert.throws(() => applyMatchMetadata(customLeague, { assignment: convert(customLeague, 'cup').competitionAssignment, date: customLeague.date }, data), /unavailable|participant|eliminated|Cup/i)
})

test('durable Cup metadata edits keep official downstream participants with a custom team first', async () => {
  const { STATIC_TEAMS } = require('../src/data/teams.ts')
  const custom = { ...STATIC_TEAMS[0], id: 'custom-first', externalTeamId: 999999, name: 'Custom First' }
  const stage1 = STATIC_TEAMS.map((team, i) => convert({ ...base, id: `official-cup-${i}`, teamId: team.id, homeTeamId: team.id, awayTeamId: `external-${i}`, appearances: [], events: [] }, 'cup'))
  const psg = STATIC_TEAMS.find(team => team.id === 'paris-saint-germain')
  const stage2 = convert({ ...base, id: 'psg-stage2', teamId: psg.id, homeTeamId: psg.id, awayTeamId: 'external-stage2', appearances: [], events: [] }, 'cup', 'Season 1', { competitionStage: 'stage2', matchDay: 2 })
  const h = await storeHarness(state([...stage1, stage2], { teams: [custom, ...STATIC_TEAMS] }))
  const edited = { ...stage1[0], date: '2026-11-09' }
  const result = await h.value().saveMatchDurably(edited)
  assert.equal(result.primarySaved, true)
  assert.equal(h.value().matches.find(match => match.id === edited.id).date, edited.date)
  assert.equal(h.value().matches.find(match => match.id === stage2.id).id, stage2.id)
})

test('removing Champions G1 fails while G2 exists, including moves to another season', () => {
  const { validateMatchMetadataMutation } = require('../src/lib/matchMetadata.ts')
  const first = convert(base, 'champions')
  const second = convert({ ...base, id: 'g2' }, 'champions', 'Season 1', { competitionSeriesGame: 2, matchDay: 2 })
  for (const replacement of [convert(first, 'league'), convert(first, 'champions', 'Season 2')]) {
    const safety = validateMatchMetadataMutation(state([first, second], { competitionStates: [...fixture.competitionStates, { ...fixture.competitionStates[0], id: 'champions:Season 2', season: 'Season 2' }] }), first, replacement)
    assert.equal(safety.safe, false); assert.match(safety.message, /gap|sequence|later|Game 1/i)
  }
})

test('source Cup downstream facts and target Cup downstream facts survive validation', () => {
  const { validateMatchMetadataMutation } = require('../src/lib/matchMetadata.ts')
  const stage1 = fixture.teams.map((team, i) => convert({ ...base, id: `cup-${i}`, teamId: team.id, homeTeamId: team.id, awayTeamId: `opponent:${team.id}`, appearances: [], events: [] }, 'cup'))
  const cup = require('../src/engine/competition.ts').cupCompetition(fixture.teams, stage1, 'Season 1', [])
  const survivor = cup.activeTeamIds[0]
  const later = convert({ ...base, id: 'later', teamId: survivor, homeTeamId: survivor, awayTeamId: `opponent:${survivor}`, appearances: [], events: [] }, 'cup', 'Season 1', { competitionStage: 'stage2', matchDay: 2 })
  const original = stage1[0]; const source = state([...stage1, later])
  assert.equal(validateMatchMetadataMutation(source, original, convert(original, 'league')).safe, false)
  // Inserting an extra team result into an occupied stage must not rewrite recorded eliminations.
  const league = { ...convert(original, 'league'), id: 'league-edit' }; const target = state([...stage1, later, league])
  assert.equal(validateMatchMetadataMutation(target, league, convert(league, 'cup')).safe, false)
})

test('ownership rewrites fail explicitly while unchanged legacy identities remain editable', () => {
  const { applyMatchMetadata, validateMatchMetadataMutation } = require('../src/lib/matchMetadata.ts')
  for (const change of [{ teamId: fixture.teams[1].id }, { awayTeamId: 'different' }, { homeTeamId: 'different' }]) {
    const safety = validateMatchMetadataMutation(state(), base, { ...base, ...change })
    assert.equal(safety.safe, false); assert.match(safety.message, /ownership|fixture|recorded team/i)
  }
  const legacy = { ...base, competitionAssignment: undefined, competitionStage: undefined, competitionType: undefined }
  const result = applyMatchMetadata(legacy, { assignment: require('../src/engine/competitionContext.ts').assignmentSnapshotForMatch(legacy), date: '2026-11-09' }, state([legacy, { ...legacy, id: 'legacy-duplicate' }]))
  assert.equal(result.date, '2026-11-09'); assert.deepEqual(result.events, legacy.events)
})

test('failed primary metadata replacement keeps original and unrelated draft, and retry keeps same ID/recordedAt', async () => {
  const draft = { ...base, id: 'unrelated' }; let writes = 0
  const h = await storeHarness(state([base], { draftMatch: draft }), async () => { if (++writes === 1) throw new Error('primary unavailable'); return { primarySaved: true, mirrorSaved: false } })
  const edited = convert({ ...base, recordedAt: 9999 }, 'cup')
  await assert.rejects(h.value().saveMatchDurably(edited), /primary unavailable/)
  assert.deepEqual(h.value().matches, [base]); assert.deepEqual(h.value().draftMatch, draft)
  const result = await h.value().saveMatchDurably(edited)
  assert.equal(result.primarySaved, true); assert.equal(h.value().matches.length, 1); assert.equal(h.value().matches[0].recordedAt, 123); assert.deepEqual(h.value().draftMatch, draft)
})

function editorHarness(original = base, options = {}) {
  const calls = { cleared: 0, saved: [], back: 0, completed: 0 }
  const store = { ...state([original], { draftMatch: { ...base, id: 'unrelated' }, ...(options.players ? { players: options.players } : {}) }), clearDraftMatch: () => calls.cleared++, saveDraftMatch() {}, saveMatchDurably: async match => { calls.saved.push(match); if (options.save) return options.save(match); return { primarySaved: true, mirrorSaved: false } } }
  const boundary = screenHarness(root, 'screens/NewMatchScreen.tsx', 'NewMatchScreen', store)
  const props = { editingMatchId: original.id, onBack: () => calls.back++, onReplace: noop, onComplete: () => calls.completed++ }
  const child = boundary.render(props)
  const editor = screenHarness(root, 'screens/NewMatchScreen.tsx', 'MatchEditor', store)
  return { calls, store, props: child.props, render: () => editor.render(child.props) }
}
test('full edit Cancel leaves the unrelated draft untouched', () => {
  const h = editorHarness(); const tree = h.render()
  nodes(tree, n => n.type === 'button' && String(n.props.children).includes('Cancel'))[0].props.onClick()
  assert.equal(h.calls.back, 1); assert.equal(h.calls.cleared, 0)
})

test('edit context/score card opens metadata editor, acceptance stays local, and score routes to events', () => {
  const h = editorHarness()
  let tree = h.render(); const trigger = nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Edit match details')[0]
  assert(trigger, 'completed edit header must open metadata dialog'); trigger.props.onClick()
  tree = h.render()
  const dialog = nodes(tree, n => typeof n.type === 'function' && n.type.name === 'MatchMetadataDialog')[0]
  assert(dialog); dialog.props.onAccept({ assignment: convert(base, 'cup').competitionAssignment, date: '2026-11-08', opponentName: 'New name', homeAway: 'away' })
  tree = h.render(); assert.equal(h.calls.saved.length, 0); assert.equal(h.calls.cleared, 0)
  assert(nodes(tree, n => n.props?.children === 'Season 1 · Cup').length)
  nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Edit match details')[0].props.onClick()
  const reopened = nodes(h.render(), n => typeof n.type === 'function' && n.type.name === 'MatchMetadataDialog')[0]
  reopened.props.onCancel(); assert.equal(h.calls.saved.length, 0)
  const live = nodes(h.render(), n => typeof n.type === 'function' && n.type.name === 'LiveMatchStep')[0]
  assert(live); return live.props.onFinish().then(() => {
    const saved = h.calls.saved[0]; assert.equal(saved.competitionType, 'cup'); assert.equal(saved.opponentName, 'New name'); assert.equal(saved.date, '2026-11-08')
    for (const field of ['events', 'appearances', 'kickoffLineup', 'duration', 'halftimeOpponentSot', 'fulltimeOpponentSot', 'recordedAt']) assert.deepEqual(saved[field], base[field], field)
  })
})

test('canonical validation rejects changed split-brain top-level metadata even when a valid snapshot hides it', async () => {
  const h = await storeHarness(state())
  await assert.rejects(h.value().saveMatchDurably({ ...base, competitionType: 'cup' }), /canonical|agree|identity/i)
  await assert.rejects(h.value().saveMatchDurably({ ...base, competitionPairingId: 'stale', competitionSeriesGame: 2 }), /canonical|agree|identity/i)
})

test('Champions to League form removes stale tournament keys and supports clearing the home/away display label', async () => {
  const original = { ...convert(base, 'champions'), homeAway: 'away' }
  const h = editorHarness(original)
  nodes(h.render(), n => n.props?.['aria-label'] === 'Edit match details')[0].props.onClick()
  const dialog = nodes(h.render(), n => n.type.name === 'MatchMetadataDialog')[0]
  dialog.props.onAccept({ assignment: base.competitionAssignment, date: original.date, homeAway: undefined })
  await nodes(h.render(), n => n.type.name === 'LiveMatchStep')[0].props.onFinish()
  const saved = h.calls.saved[0]
  assert.equal(Object.hasOwn(saved, 'competitionPairingId'), false)
  assert.equal(Object.hasOwn(saved, 'competitionSeriesGame'), false)
  assert.equal(saved.homeAway, undefined)
})

test('metadata-only form preserves a modern kickoff plus deleted, released and transferred historical players', async () => {
  const { kickoffLineupForMatch } = require('../src/engine/kickoffLineup.ts')
  const original = { ...base, kickoffLineup: kickoffLineupForMatch(base, base.teamId) }
  const remaining = fixture.players.filter(p => ![base.appearances[0].playerId, base.appearances[2].playerId].includes(p.id))
  const h = editorHarness(original, { players: remaining })
  nodes(h.render(), n => n.props?.['aria-label'] === 'Edit match details')[0].props.onClick()
  nodes(h.render(), n => n.type.name === 'MatchMetadataDialog')[0].props.onAccept({ assignment: convert(original, 'cup').competitionAssignment, date: '2026-11-10', opponentName: 'Historical visitor' })
  await nodes(h.render(), n => n.type.name === 'LiveMatchStep')[0].props.onFinish()
  assert(h.calls.saved.length, 'a missing current goalkeeper must not block the historical edit')
  for (const field of ['events', 'appearances', 'kickoffLineup', 'duration', 'halftimeOpponentSot', 'fulltimeOpponentSot', 'recordedAt']) assert.deepEqual(h.calls.saved[0][field], original[field], field)
})

test('metadata dialog discards unaccepted details on Cancel and routes score editing to event controls', () => {
  const accepted = []; let cancelled = 0; let score = 0
  const h = screenHarness(root, 'components/MatchMetadataDialog.tsx', 'MatchMetadataDialog', {})
  const props = { match: base, data: state(), onAccept: value => accepted.push(value), onCancel: () => cancelled++, onEditScore: () => score++ }
  const render = () => h.render(props)
  nodes(render(), n => n.props?.['aria-label'] === 'Opponent display name')[0].props.onChange({ target: { value: 'Discard me' } })
  nodes(render(), n => n.type === 'button' && n.props.children === 'Cancel')[0].props.onClick()
  assert.equal(cancelled, 1); assert.equal(accepted.length, 0); assert.equal(base.opponentName, undefined)
  nodes(render(), n => n.type === 'button' && n.props.children === 'Edit score through goal events')[0].props.onClick()
  assert.equal(score, 1); assert.equal(accepted.length, 0)
  assert.equal(nodes(render(), n => n.type === 'input' && /score/i.test(n.props['aria-label'] ?? '')).length, 0)
})

test('failed final save retains accepted metadata and error feedback for retry', async () => {
  let attempts = 0
  const h = editorHarness(base, { save: async () => { if (++attempts === 1) throw new Error('primary test failure'); return { primarySaved: true, mirrorSaved: false } } })
  nodes(h.render(), n => n.props?.['aria-label'] === 'Edit match details')[0].props.onClick()
  nodes(h.render(), n => n.type.name === 'MatchMetadataDialog')[0].props.onAccept({ assignment: convert(base, 'cup').competitionAssignment, date: '2026-11-09' })
  assert.equal(await nodes(h.render(), n => n.type.name === 'LiveMatchStep')[0].props.onFinish(), false)
  assert(nodes(h.render(), n => n.props?.role === 'alert' && n.props.children === 'primary test failure').length)
  assert.equal(await nodes(h.render(), n => n.type.name === 'LiveMatchStep')[0].props.onFinish(), true)
  assert.equal(h.calls.saved.length, 2); assert.deepEqual(h.calls.saved[0], h.calls.saved[1])
})

test('an editor whose durable source changed refuses to overwrite newer football facts', async () => {
  const h = editorHarness(); h.render()
  h.store.matches = [{ ...base, events: [] }]
  assert.equal(await nodes(h.render(), n => n.type.name === 'LiveMatchStep')[0].props.onFinish(), false)
  assert.equal(h.calls.saved.length, 0)
  assert(nodes(h.render(), n => n.props?.role === 'alert' && /changed|reopen/i.test(n.props.children)).length)
})

test('historical Champions stage selection derives the recorded team pairing from its draw', () => {
  const teamId = fixture.teams[4].id
  const original = convert({ ...base, teamId, homeTeamId: teamId, awayTeamId: 'external', events: [], appearances: [] }, 'league')
  const accepted = []
  const h = screenHarness(root, 'components/MatchMetadataDialog.tsx', 'MatchMetadataDialog', {})
  const props = { match: original, data: state([original]), onAccept: p => accepted.push(p), onCancel: noop, onEditScore: noop }
  nodes(h.render(props), n => n.props?.['aria-label'] === 'Competition')[0].props.onChange({ target: { value: 'champions' } })
  nodes(h.render(props), n => n.props?.['aria-label'] === 'Stage')[0].props.onChange({ target: { value: 'quarterFinal' } })
  nodes(h.render(props), n => n.props?.['aria-label'] === 'Stage')[0].props.onChange({ target: { value: 'roundOf16' } })
  nodes(h.render(props), n => n.type === 'button' && n.props.children === 'Apply details')[0].props.onClick()
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].assignment.pairingId, 'roundOf16:2')
})

test('metadata-only form retains an existing recorded formation without projecting it from the current UI', async () => {
  const original = { ...base, formation: 'historical formation' }
  const h = editorHarness(original)
  await nodes(h.render(), n => n.type.name === 'LiveMatchStep')[0].props.onFinish()
  assert.equal(h.calls.saved[0].formation, 'historical formation')
})

test('Cup Final reassignment fails when it would require rewriting the recorded fixture opponent', () => {
  const { applyMatchMetadata, suggestMatchMetadataAssignment } = require('../src/lib/matchMetadata.ts')
  const { cupCompetition } = require('../src/engine/competition.ts')
  const matches = []
  for (let stage = 1; stage <= 7; stage++) {
    const cup = cupCompetition(fixture.teams, matches, 'Season 1', [])
    for (const teamId of cup.activeTeamIds) matches.push(convert({ ...base, id: `s${stage}:${teamId}`, teamId, homeTeamId: teamId, awayTeamId: `external:${teamId}`, events: [], appearances: [] }, 'cup', 'Season 1', { competitionStage: `stage${stage}`, matchDay: stage }))
  }
  const finalists = cupCompetition(fixture.teams, matches, 'Season 1', []).activeTeamIds
  const original = convert({ ...base, id: 'final-edit', teamId: finalists[0], homeTeamId: finalists[0], awayTeamId: 'external', events: [], appearances: [] }, 'league')
  const data = state([...matches, original])
  assert.throws(() => suggestMatchMetadataAssignment(original, 'cup', 'Season 1', data), /fixture|ownership|opponent/i)
  const assignment = { ...original.competitionAssignment, competitionType: 'cup', stage: 'final', matchDay: 8 }
  assert.throws(() => applyMatchMetadata(original, { assignment, date: original.date }, data), /fixture|ownership|opponent/i)
})

test('same-ID durable metadata replacement revises old/new season scopes and emits one optional cloud upsert', async () => {
  const original = convert(base, 'champions'); const replacement = convert(original, 'league', 'Season 2')
  const h = await storeHarness(state([original])); const before = structuredClone(h.value().competitionRevisions)
  await h.value().saveMatchDurably(replacement)
  const value = h.value()
  assert.equal(value.matches.length, 1); assert.equal(value.matches[0].id, original.id)
  assert.equal(value.competitionRevisions['Season 1'].champions, before['Season 1'].champions + 1)
  assert.equal(value.competitionRevisions['Season 2'].league, (before['Season 2']?.league ?? 0) + 1)
  const sync = sourceModule(root, 'lib/sync.ts', { './supabase': { isCloudSyncEnabled: true, getSupabase() { throw new Error('No live cloud access') } } }).SyncManager
  const queued = []; sync.queueOperation = async operation => queued.push(operation)
  await sync.queueStateChange(state([original]), state(value.matches))
  assert.equal(queued.length, 1); assert.equal(queued[0].operation, 'upsert'); assert.equal(queued[0].entityId, original.id)
  assert.equal(serializeCloudEntity(queued[0].payload).competition_pairing_id, null)
})

test('a matching unfinished draft is removed atomically only after verified final save', async () => {
  const draft = { ...base, id: 'draft-final' }; let fail = true
  const h = await storeHarness(state([], { draftMatch: draft }), async () => { if (fail) throw new Error('primary failure'); return { primarySaved: true, mirrorSaved: false } })
  await assert.rejects(h.value().saveMatchDurably(draft), /primary failure/)
  assert.deepEqual(h.value().draftMatch, draft); assert.equal(h.value().matches.length, 0)
  fail = false; await h.value().saveMatchDurably(draft)
  assert.equal(h.value().draftMatch, undefined); assert.equal(h.value().matches[0].id, draft.id)
})

test('moved League/Cup destination rejects a duplicate registered opponent even when both recorded teams differ', () => {
  const { validateMatchMetadataMutation } = require('../src/lib/matchMetadata.ts')
  const [a, b, c] = fixture.teams.map(team => team.id)
  const original = convert({ ...base, homeTeamId: a, teamId: a, awayTeamId: b, events: [], appearances: [] }, 'champions')
  for (const type of ['league', 'cup']) {
    const other = convert({ ...original, id: 'other-owner', homeTeamId: c, teamId: c }, type)
    const safety = validateMatchMetadataMutation(state([original, other]), original, convert(original, type))
    assert.equal(safety.safe, false, type); assert.match(safety.message, /occupied|duplicate/i)
  }
})

test('Cup historical insertion rejects an eliminated registered fixture opponent', () => {
  const { validateMatchMetadataMutation } = require('../src/lib/matchMetadata.ts')
  const stage1 = fixture.teams.map((team, index) => convert({ ...base, id: `stage1:${team.id}`, homeTeamId: team.id, teamId: team.id, awayTeamId: `external:${team.id}`, appearances: [], events: Array.from({ length: 16 - index }, (_, goal) => ({ id: `${team.id}:${goal}`, type: 'goal', minute: goal + 1, teamId: team.id })) }, 'cup'))
  const original = convert({ ...base, id: 'move-to-stage2', awayTeamId: fixture.teams[15].id, events: [], appearances: [] }, 'league')
  const moved = convert(original, 'cup', 'Season 1', { competitionStage: 'stage2', matchDay: 2 })
  const safety = validateMatchMetadataMutation(state([...stage1, original]), original, moved)
  assert.equal(safety.safe, false); assert.match(safety.message, /participant|progress|active|stage/i)
})

test('same-ID update after the primary read remains authoritative when the older metadata save resolves', async () => {
  let release; const held = new Promise(resolve => { release = resolve }); const writes = []
  const h = await storeHarness(state(), async next => { writes.push(structuredClone(next)); if (writes.length === 1) await held; return { primarySaved: true, mirrorSaved: false } })
  const saving = h.value().saveMatchDurably({ ...base, date: '2026-11-08' })
  assert.equal(writes.length, 1, 'metadata primary read already happened')
  h.value().updateMatch(base.id, { ...base, events: [] })
  assert.equal(h.value().matches[0].events.length, 0)
  const revisions = structuredClone(h.value().competitionRevisions)
  release(); const result = await saving
  for (let i = 0; i < 12; i++) await Promise.resolve()
  assert.equal(h.value().matches[0].events.length, 0)
  assert.equal(h.value().matches[0].date, base.date)
  assert.deepEqual(h.value().competitionRevisions, revisions)
  assert.equal(writes.length, 2); assert.equal(writes[0].matches[0].events.length, base.events.length); assert.equal(writes[1].matches[0].events.length, 0)
  assert.equal(result.primarySaved, true); assert.equal(result.superseded, true)
})

test('same-ID deletion after the primary read cannot be resurrected by metadata save publication', async () => {
  let release; const held = new Promise(resolve => { release = resolve }); const writes = []
  const h = await storeHarness(state(), async next => { writes.push(structuredClone(next)); if (writes.length === 1) await held; return { primarySaved: true, mirrorSaved: false } })
  const saving = h.value().saveMatchDurably({ ...base, date: '2026-11-08' })
  assert.equal(writes.length, 1)
  h.value().deleteMatch(base.id); assert.equal(h.value().matches.length, 0)
  release(); const result = await saving
  for (let i = 0; i < 12; i++) await Promise.resolve()
  assert.equal(h.value().matches.length, 0); assert.equal(writes.length, 2); assert.equal(writes[1].matches.length, 0)
  assert.equal(result.primarySaved, true); assert.equal(result.superseded, true)
})

test('editor reports superseded verified metadata without claiming it became authoritative or navigating to a deleted match', async () => {
  const h = editorHarness(base, { save: async () => ({ primarySaved: true, mirrorSaved: false, superseded: true }) })
  const finished = await nodes(h.render(), n => n.type.name === 'LiveMatchStep')[0].props.onFinish()
  assert.equal(finished, false); assert.equal(h.calls.completed, 0)
  assert(nodes(h.render(), n => n.props?.['aria-live'] === 'polite' && /newer|superseded/i.test(n.props.children)).length)
  assert.equal(nodes(h.render(), n => n.props?.role === 'alert').length, 0, 'verified primary is not reported as failed')
})

test('destination occupied after the primary read supersedes publication without losing the newer slot', async () => {
  let release; const held = new Promise(resolve => { release = resolve }); const writes = []
  const h = await storeHarness(state(), async next => { writes.push(structuredClone(next)); if (writes.length === 1) await held; return { primarySaved: true, mirrorSaved: false } })
  const saving = h.value().saveMatchDurably(convert(base, 'cup'))
  assert.equal(writes.length, 1)
  const occupied = { ...convert(base, 'cup'), id: 'new-cup-slot' }
  h.value().addMatch(occupied)
  release(); const result = await saving
  for (let i = 0; i < 12; i++) await Promise.resolve()
  assert.equal(result.primarySaved, true); assert.equal(result.superseded, true)
  assert.equal(h.value().matches.find(match => match.id === base.id).competitionType, 'league')
  assert.equal(h.value().matches.find(match => match.id === occupied.id).competitionType, 'cup')
  assert.equal(writes[1].matches.find(match => match.id === base.id).competitionType, 'league')
  assert.equal(writes[1].matches.find(match => match.id === occupied.id).competitionType, 'cup')
})

test('a downstream source series row added after the primary read supersedes publication without creating a gap', async () => {
  let release; const held = new Promise(resolve => { release = resolve }); const writes = []
  const original = convert(base, 'champions')
  const h = await storeHarness(state([original]), async next => { writes.push(structuredClone(next)); if (writes.length === 1) await held; return { primarySaved: true, mirrorSaved: false } })
  const saving = h.value().saveMatchDurably(convert(original, 'league'))
  assert.equal(writes.length, 1)
  const game2 = convert({ ...base, id: 'new-g2' }, 'champions', 'Season 1', { competitionSeriesGame: 2, matchDay: 2 })
  h.value().addMatch(game2)
  release(); const result = await saving
  for (let i = 0; i < 12; i++) await Promise.resolve()
  assert.equal(result.primarySaved, true); assert.equal(result.superseded, true)
  for (const matchState of [h.value(), writes[1]]) {
    assert.equal(matchState.matches.find(match => match.id === base.id).competitionType, 'champions')
    assert.equal(matchState.matches.find(match => match.id === game2.id).competitionSeriesGame, 2)
  }
})

function legacyBothSides(type) {
  const awayId = fixture.teams[1].id
  const away = fixture.matches.find(match => match.teamId === awayId)
  const combined = convert({ ...base, awayTeamId: awayId, appearances: [...base.appearances, ...away.appearances], events: base.events.map(event => event.teamId === base.awayTeamId ? { ...event, teamId: awayId } : event) }, type)
  const { teamId: _owner, ...ownerless } = combined
  return normalizeMatchCompetitionIdentity(ownerless)
}

test('date-only metadata cannot narrow actual ownerless League/Cup history to one fixture team', () => {
  const { applyMatchMetadata, validateMatchMetadataMutation } = require('../src/lib/matchMetadata.ts')
  for (const type of ['league', 'cup']) {
    const original = legacyBothSides(type); const before = structuredClone(original)
    assert.equal(Object.hasOwn(original, 'teamId'), false)
    assert(original.appearances.some(row => row.teamId === original.homeTeamId)); assert(original.appearances.some(row => row.teamId === original.awayTeamId))
    assert.equal(isRecordedForTeam(original, original.homeTeamId), true); assert.equal(isRecordedForTeam(original, original.awayTeamId), true)
    const replacement = { ...original, teamId: original.homeTeamId, date: '2026-11-09' }
    const safety = validateMatchMetadataMutation(state([original]), original, replacement)
    assert.equal(safety.safe, false, type); assert.match(safety.message, /historical ownership/i)
    assert.throws(() => applyMatchMetadata(original, { assignment: original.competitionAssignment, date: '2026-11-09' }, state([original])), /historical ownership/i)
    assert.deepEqual(original, before); assert.equal(isRecordedForTeam(original, original.awayTeamId), true)
  }
})

test('durable path rejects legacy ownership narrowing before writing and retains away visibility and both appearance payloads', async () => {
  for (const type of ['league', 'cup']) {
    const original = legacyBothSides(type); let writes = 0
    const h = await storeHarness(state([original]), async () => { writes++; return { primarySaved: true, mirrorSaved: false } })
    await assert.rejects(h.value().saveMatchDurably({ ...original, teamId: original.homeTeamId, date: '2026-11-09' }), /historical ownership/i)
    assert.equal(writes, 0); assert.deepEqual(h.value().matches[0], original)
    assert.equal(isRecordedForTeam(h.value().matches[0], original.awayTeamId), true)
    assert.deepEqual(h.value().matches[0].appearances, original.appearances); assert.deepEqual(h.value().matches[0].events, original.events)
  }
})

test('unchanged legacy raw ownership remains durably editable and explicit-owner records still accept date metadata', async () => {
  const { applyMatchMetadata } = require('../src/lib/matchMetadata.ts')
  for (const type of ['league', 'cup']) {
    const original = legacyBothSides(type)
    const h = await storeHarness(state([original]))
    await h.value().saveMatchDurably({ ...original, date: '2026-11-09' })
    assert.equal(Object.hasOwn(h.value().matches[0], 'teamId'), false); assert.equal(isRecordedForTeam(h.value().matches[0], original.awayTeamId), true)
    assert.deepEqual(h.value().matches[0].appearances, original.appearances)
    const explicit = { ...original, teamId: original.homeTeamId }
    const edited = applyMatchMetadata(explicit, { assignment: explicit.competitionAssignment, date: '2026-11-09' }, state([explicit]))
    assert.equal(edited.date, '2026-11-09'); assert.deepEqual(edited.appearances, explicit.appearances)
  }
})

test('ordinary editor final save also fails closed when canonicalization would narrow two-sided legacy ownership', async () => {
  for (const type of ['league', 'cup']) {
    const original = legacyBothSides(type)
    const durable = await storeHarness(state([original]))
    const h = editorHarness(original, { save: match => durable.value().saveMatchDurably(match) })
    assert.equal(await nodes(h.render(), n => n.type.name === 'LiveMatchStep')[0].props.onFinish(), false)
    assert.equal(h.calls.completed, 0)
    assert(nodes(h.render(), n => n.props?.role === 'alert' && /historical ownership/i.test(n.props.children)).length)
    assert.deepEqual(durable.value().matches[0], original); assert.equal(isRecordedForTeam(durable.value().matches[0], original.awayTeamId), true)
  }
})
