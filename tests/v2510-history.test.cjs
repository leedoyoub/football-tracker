const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Pitch } = require('../src/components/Pitch.tsx')
const { MatchTimeline } = require('../src/components/MatchTimeline.tsx')
const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')
const { restoreDraft } = require('../src/lib/editorRestore.ts')
const { auditDataIntegrity } = require('../src/engine/integrity.ts')
const { prepareImportData } = require('../src/lib/repository.ts')
const { rateMatch } = require('../src/engine/rating.ts')
const { historicalPlayerLabel } = require('../src/lib/historicalPlayerDisplay.ts')
const slotIds = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW']
const kickoff = kickoffFromAssignments(Object.fromEntries(slotIds.map((id, i) => [id, `old-${i}`])))
const match = () => ({ id: 'history', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, kickoffLineup: kickoff,
  appearances: [...kickoff.map(slot => ({ playerId: slot.playerId, teamId: 'A', position: slot.matchPosition, matchPosition: slot.matchPosition, role: 'starter' })), { playerId: 'old-sub', teamId: 'A', position: 'ST', matchPosition: 'RW', role: 'bench' }, { playerId: 'old-unused', teamId: 'A', position: 'CM', role: 'bench' }],
  events: [{ id: 'sub', type: 'sub', minute: 60, teamId: 'A', playerOutId: 'old-10', playerInId: 'old-sub', position: 'RW', tacticalSlotId: 'RW' }, { id: 'goal', type: 'goal', minute: 70, teamId: 'A', playerId: 'old-sub', assistPlayerId: 'old-9' }],
})
const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]

test('a released player with a real roster object retains its real identity and is not a missing historical entity', () => {
  const released = { id: 'old-9', name: 'Former striker', displayName: 'Former', teamId: '', teamIds: [], position: 'ST', number: 9 }
  assert.equal(historicalPlayerLabel(released.id, released), 'Former')
  const game = { ...match(), kickoffLineup: undefined, events: [], appearances: [{ playerId: released.id, teamId: 'A', position: 'ST', role: 'starter' }] }
  assert.equal(auditDataIntegrity([game], [released], teams).issues.length, 0)
})

test('historical Pitch and Timeline retain absent player identity with an explicit display fallback', () => {
  const html = renderToStaticMarkup(React.createElement(Pitch, { slots: [{ slot: 'ST', position: 'ST', playerId: 'old-9', avgRating: 0, matches: 0 }], players: [], presentation: 'history', onSlotClick() {} }))
  assert.match(html, /Historical player/)
  assert.match(html, /old-9/)
  assert.doesNotMatch(html, /Empty ST slot/)
  const timeline = renderToStaticMarkup(React.createElement(MatchTimeline, { events: match().events, players: [], teamId: 'A' }))
  assert.match(timeline, /Historical player/)
  assert.match(timeline, /old-sub/)
  assert.match(timeline, /old-10/)
})

test('historical Match Detail renders missing starter, substitute, unused bench, and rating identities without rating invented players', () => {
  const game = match(), before = JSON.stringify(game)
  const storePath = require.resolve('../src/store.tsx'), prior = require.cache[storePath]
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => ({ teams, players: [], matches: [game], deleteMatch() {} }) } }
  const screenPath = require.resolve('../src/screens/MatchDetailScreen.tsx'); delete require.cache[screenPath]
  try {
    const { MatchDetailScreen } = require(screenPath)
    const props = { matchId: game.id, onStateChange() {}, onNavigate() {}, onBack() {}, onBackToTeam() {}, onReplace() {} }
    const lineup = renderToStaticMarkup(React.createElement(MatchDetailScreen, { ...props, screenState: { tab: 'lineup' } }))
    for (const id of ['old-9', 'old-sub', 'old-unused']) assert.match(lineup, new RegExp(id))
    assert.match(lineup, /Historical player/)
    assert.match(lineup, /RW/)
    const ratings = renderToStaticMarkup(React.createElement(MatchDetailScreen, { ...props, screenState: { tab: 'ratings' } }))
    assert.match(ratings, /Historical player/)
    assert.match(ratings, /old-sub/)
    assert.match(ratings, /90&#x27;/)
    assert.match(ratings, /30&#x27;/)
    assert.deepEqual(rateMatch(game, []), [])
    assert.equal(JSON.stringify(game), before)
  } finally {
    if (prior) require.cache[storePath] = prior; else delete require.cache[storePath]
    delete require.cache[screenPath]
  }
})

test('restore and import retain historical IDs and saved kickoff without adding players', () => {
  const game = match(), before = JSON.stringify(game)
  const restored = restoreDraft(game, [])
  assert(restored)
  assert.equal(restored.draft.slotAssignments.RW, 'old-sub')
  assert.equal(restored.starters.RW, 'old-10')
  assert(restored.draft.homeBench.includes('old-unused'))
  const imported = prepareImportData(JSON.stringify({ teams, players: [], matches: [game] }))
  assert.deepEqual(imported.players, [])
  for (const key of ['appearances', 'events', 'kickoffLineup']) assert.deepEqual(imported.matches[0][key], game[key])
  assert.equal(JSON.stringify(game), before)
})

test('import rejects conflicting modern kickoff slots and event relationships while retaining legacy snapshot compatibility', () => {
  const mutations = [
    game => { game.kickoffLineup = game.kickoffLineup.map((row, index) => index === 1 ? { ...row, id: game.kickoffLineup[0].id } : row) },
    game => { game.kickoffLineup = game.kickoffLineup.map((row, index) => index === 1 ? { ...row, playerId: 'orphan' } : row) },
    game => { game.events[0].tacticalSlotId = 'unknown-slot' },
  ]
  for (const mutate of mutations) {
    const game = match(); mutate(game)
    assert.throws(() => prepareImportData(JSON.stringify({ teams, players: [], matches: [game] })), /Invalid JSON structure/)
  }
  const legacy = match(); legacy.kickoffLineup = [{ id: 'old-0', playerId: 'old-0', matchPosition: 'GK', x: 0, y: 1 }]
  assert.deepEqual(prepareImportData(JSON.stringify({ teams, players: [], matches: [legacy] })).matches[0].kickoffLineup, legacy.kickoffLineup)
})

test('restore rejects duplicate appearances/events, wrong teams, inconsistent kickoff, and invalid tactical slots', () => {
  const mutations = [
    game => game.appearances.push({ ...game.appearances[0], role: 'bench' }),
    game => game.events.push({ ...game.events[1] }),
    game => { game.appearances[0].teamId = 'OTHER' },
    game => { game.events[0].teamId = 'OTHER' },
    game => { game.kickoffLineup = game.kickoffLineup.map((row, i) => i ? row : { ...row, playerId: 'orphan' }) },
    game => { game.events[0].tacticalSlotId = 'unknown-slot' },
  ]
  for (const mutate of mutations) {
    const game = match(); mutate(game); const before = JSON.stringify(game)
    assert.equal(restoreDraft(game, []), null)
    assert.equal(JSON.stringify(game), before)
  }
})

test('integrity separates legitimate historical references from actual malformed match relationships', () => {
  const game = match(), before = JSON.stringify(game)
  const valid = auditDataIntegrity([game], [], teams)
  assert.equal(valid.errors, 0, JSON.stringify(valid.issues))
  assert(valid.issues.some(issue => issue.severity === 'info' && /Historical player/.test(issue.message)))
  const corrupt = match(); corrupt.events.push({ id: 'orphan', type: 'goal', minute: 80, teamId: 'A', playerId: 'not-in-lineup' })
  corrupt.appearances.push({ ...corrupt.appearances[0] })
  const report = auditDataIntegrity([corrupt], [], teams)
  assert(report.errors >= 2)
  assert(report.issues.some(issue => /unknown player|not in.*lineup/.test(issue.message)))
  assert(report.issues.some(issue => /more than once/.test(issue.message)))
  assert.equal(JSON.stringify(game), before)
})

test('editing a historical match keeps missing IDs out of player calculations and preserves them in the saved match', async () => {
  const Module = require('node:module'), originalLoad = Module._load
  let game = match()
  const calculations = [], saved = []
  const stats = require('../src/engine/stats.ts')
  Module._load = function(name, parent, main) {
    if (name === 'react') return { ...React, useMemo: fn => fn(), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useRef: value => ({ current: value }), useEffect() {} }
    if (name === '../store') return { useStore: () => ({ teams, players: [], matches: [game], competitionStates: [], saveMatchDurably: async value => { saved.push(value); return { mirrorSaved: true } }, clearDraftMatch() {}, saveDraftMatch() {} }) }
    if (name === '../engine/stats') return { ...stats, playerSeasonStats: (player, ...args) => { calculations.push(player.id); return stats.playerSeasonStats(player, ...args) } }
    return originalLoad.call(this, name, parent, main)
  }
  const path = require.resolve('../src/screens/NewMatchScreen.tsx'); delete require.cache[path]
  const find = (node, name) => {
    if (!node || typeof node !== 'object') return undefined
    if (node.type?.name === name) return node
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, name); if (found) return found }
  }
  try {
    const { NewMatchScreen } = require(path)
    const boundary = NewMatchScreen({ editingMatchId: game.id, onReplace() {}, onBack() {}, onComplete() {} })
    const editor = boundary.type(boundary.props)
    const live = find(editor, 'LiveMatchStep')
    assert(live)
    assert.deepEqual(calculations, [], 'missing historical references are not Player entities')
    assert.deepEqual(live.props.players, [])
    assert.equal(await live.props.onFinish(), true)
    assert.equal(saved.length, 1)
    assert.deepEqual(saved[0].appearances.map(row => row.playerId), game.appearances.map(row => row.playerId))
    assert.deepEqual(saved[0].events, game.events)
    assert.deepEqual(saved[0].kickoffLineup, game.kickoffLineup)
    game = { ...match(), id: 'away-history', homeTeamId: 'B', awayTeamId: 'A', homeAway: 'away' }
    const awayBoundary = NewMatchScreen({ editingMatchId: game.id, onReplace() {}, onBack() {}, onComplete() {} })
    const awayLive = find(awayBoundary.type(awayBoundary.props), 'LiveMatchStep')
    assert.equal(await awayLive.props.onFinish(), true)
    assert.equal(saved[1].homeAway, 'away')
    assert.deepEqual([saved[1].homeTeamId, saved[1].awayTeamId], ['B', 'A'])
  } finally { Module._load = originalLoad; delete require.cache[path] }
})
