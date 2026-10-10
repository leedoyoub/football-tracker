const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { restoreDraft } = require('../src/lib/editorRestore.ts')
const { editorSourceCanMount } = require('../src/lib/draftLifecycle.ts')

const positions = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LDM', 'LCM', 'RCM', 'LW', 'ST', 'RW']
const players = [...positions.map((position, index) => ({ id: `p${index}`, name: `p${index}`, teamId: 'A', position, number: index + 1 })), { id: 'bench', name: 'bench', teamId: 'A', position: 'CM', number: 99 }]
const slots = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LDM', 'LCM', 'RCM', 'LW', 'ST', 'RW']
const kickoff = slots.map((slot, index) => ({ id: slot, matchPosition: positions[index], ratingPosition: positions[index], playerId: `p${index}`, x: index, y: index }))
const draft = {
  id: 'draft', season: 'S1', competitionType: 'league', matchDay: 1, date: '2026-01-01', duration: 90,
  teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', halftimeOpponentSot: 2, fulltimeOpponentSot: 5,
  kickoffLineup: kickoff,
  appearances: [...players.slice(0, 11).map((player, index) => ({ playerId: player.id, teamId: 'A', role: 'starter', position: player.position, matchPosition: positions[index], positionHistory: index === 1 ? [{ minute: 50, position: 'LWB', sequence: 5 }] : undefined })), { playerId: 'bench', teamId: 'A', role: 'bench', position: 'CM', matchPosition: 'CM' }],
  events: [
    { id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'p9' },
    { id: 'against', type: 'goal', minute: 30, teamId: 'B' },
    { id: 'sub', type: 'sub', minute: 60, teamId: 'A', playerOutId: 'p7', playerInId: 'bench', position: 'RCM' },
  ],
}

test('a successful resume restores authoritative events, lineup, bench, positions, and manual SOT source data', () => {
  const restored = restoreDraft(draft, players)
  assert(restored)
  assert.deepEqual(restored.draft.events, draft.events)
  assert.deepEqual(restored.starters, Object.fromEntries(kickoff.map(slot => [slot.id, slot.playerId])))
  assert(restored.bench.includes('bench'))
  assert.deepEqual(restored.draft.positionHistories.p1, [{ minute: 50, position: 'LWB', sequence: 5 }])
  assert.deepEqual(restored.sourceSot, { halftimeOpponentSot: 2, fulltimeOpponentSot: 5 })
})

test('a restoration failure prevents resume mounting and cannot activate a draft autosave path', () => {
  assert.equal(editorSourceCanMount('resume', draft, null), false)
  assert.equal(editorSourceCanMount('edit', draft, null), false)
  assert.equal(editorSourceCanMount('fresh', undefined, null), true)
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(source.includes("if ((mode === 'resume' || mode === 'edit') && !restored)"))
  assert(source.includes("if (!draftReady || !editorSourceCanMount(mode, sourceMatch, restored)"))
  assert(source.includes('initialOpponentSotDraft(sourceMatch, mode === \'fresh\')'))
  assert(source.includes('fulltimeOpponentSotAutoLinked: fulltimeOpponentSotAutoLinked'))
  assert(source.includes('halftimeOpponentSot: parseOpponentSot(halftimeOpponentSot)'))
})

test('the production NewMatch boundary returns recovery UI before MatchEditor can initialize a failed resume', () => {
  const Module = require('node:module'); const React = require('react'); const originalLoad = Module._load
  const failedDraft = { ...draft, id: 'failed-draft', kickoffLineup: [] }
  const calls = { autosave: 0, clear: 0 }
  Module._load = function(name, parent, main) {
    if (name === 'react') return { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] }
    if (name === '../store') return { useStore: () => ({ teams: [{ id: 'A', name: 'A' }], players: [], matches: [], draftMatch: failedDraft, clearDraftMatch: () => { calls.clear++ }, saveDraftMatch: () => { calls.autosave++ } }) }
    return originalLoad.call(this, name, parent, main)
  }
  const path = require.resolve('../src/screens/NewMatchScreen.tsx'); delete require.cache[path]
  try {
    const { NewMatchScreen } = require('../src/screens/NewMatchScreen.tsx')
    const rendered = NewMatchScreen({ teamId: 'A', requestedSeason: 'S1', competitionType: 'league', resumeDraft: true, onReplace() {}, onBack() {} })
    assert.equal(rendered.type, 'div')
    assert.equal(rendered.props.role, 'alert')
    assert.match(rendered.props.children, /saved draft was not changed/)
    assert.deepEqual(calls, { autosave: 0, clear: 0 })
  } finally {
    Module._load = originalLoad
    delete require.cache[path]
  }
})
