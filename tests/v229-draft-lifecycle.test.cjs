const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { sanitizeDraftLifecycle, isResumableDraft, draftContext } = require('../src/lib/draftLifecycle.ts')

const match = (id, overrides = {}) => ({
  id, teamId: 'team-a', homeTeamId: 'team-a', awayTeamId: 'opponent', season: 'Season 1', competitionType: 'champions',
  competitionStage: 'roundOf16', competitionPairingId: 'roundOf16:0', competitionSeriesGame: 1,
  matchDay: 1, date: '2026-09-18', duration: 90, appearances: [], events: [], ...overrides,
})
const state = (matches = [], draftMatch) => ({ teams: [{ id: 'team-a' }, { id: 'team-b' }], players: [], matches, competitionStates: [], ...(draftMatch ? { draftMatch } : {}) })

test('v2.2.9 finalized draft is never resumable and cleanup removes only that draft', () => {
  const finalized = match('saved')
  const input = state([finalized], finalized)
  assert.equal(isResumableDraft(input), false)
  const cleaned = sanitizeDraftLifecycle(input)
  assert.equal(cleaned.draftMatch, undefined)
  assert.deepEqual(cleaned.matches, [finalized])
})

test('v2.2.9 a genuinely unfinished draft remains resumable with canonical route context', () => {
  const input = state([], match('draft', { competitionType: 'cup', competitionStage: 'stage3' }))
  assert.equal(isResumableDraft(input), true)
  assert.deepEqual(draftContext(input.draftMatch), { teamId: 'team-a', season: 'Season 1', competitionType: 'cup' })
  assert.equal(sanitizeDraftLifecycle(input), input)
})

test('v2.2.9 a different requested team, season, or competition is a draft conflict rather than an implicit restore', () => {
  const draft = match('draft')
  assert.deepEqual(draftContext(draft), { teamId: 'team-a', season: 'Season 1', competitionType: 'champions' })
  assert.notDeepEqual(draftContext(draft), { teamId: 'team-a', season: 'Season 1', competitionType: 'league' })
  assert.notDeepEqual(draftContext(draft), { teamId: 'team-a', season: 'Season 2', competitionType: 'champions' })
  assert.notDeepEqual(draftContext(draft), { teamId: 'team-b', season: 'Season 1', competitionType: 'champions' })
})
