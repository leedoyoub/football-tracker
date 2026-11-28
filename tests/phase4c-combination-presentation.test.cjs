const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { combinationBestUnitOptions, combinationPairPresentation, recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..')
const component = name => node => typeof node.type === 'function' && node.type.name === name

const player = (id, position = 'ST') => ({ id, name: id, displayName: id, fullName: id, teamId: 'A', position, number: 9 })
const appearance = (entry) => ({ playerId: entry.id, teamId: 'A', role: 'starter', position: entry.position, matchPosition: entry.position })
const match = (id, events) => ({ id, season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: events.length ? [appearance(assist), appearance(scorer), appearance(other), appearance(cb1), appearance(cb2)] : [], events })
const assist = player('Zulu Assist')
const scorer = player('Alpha Scorer')
const other = player('Bravo Other')
const cb1 = player('CB One', 'CB')
const cb2 = player('CB Two', 'CB')
const players = [assist, scorer, other, cb1, cb2]
const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }

test('all six Records combination leaderboards use their exact shared connector mapping', () => {
  assert.deepEqual(combinationPairPresentation('goal-combinations', ['assist', 'scorer']), { playerIds: ['assist', 'scorer'], connector: '→', directional: true })
  assert.equal(combinationPairPresentation('mutual-goal-combinations', ['a', 'b']).connector, '↔')
  assert.equal(combinationPairPresentation('both-scored', ['a', 'b']).connector, '&')
  assert.equal(combinationPairPresentation('both-ga', ['a', 'b']).connector, '&')
  assert.equal(combinationPairPresentation('duo-ga', ['a', 'b']).connector, '+')
  assert.equal(combinationPairPresentation('cb-suppression', ['a', 'b']).connector, '&')
})

test('Most Goal Combinations preserves assist-to-scorer direction rather than alphabetizing', () => {
  const matches = [
    match('a-to-b', [{ id: 'g1', type: 'goal', minute: 20, teamId: 'A', playerId: scorer.id, assistPlayerId: assist.id }]),
    match('b-to-a', [{ id: 'g2', type: 'goal', minute: 30, teamId: 'A', playerId: assist.id, assistPlayerId: scorer.id }]),
  ]
  const groups = recordsLeaderboardGroups({ category: 'combination', players, teams: [], matches, scope })
  const direct = groups.find(group => group.id === 'goal-combinations').rows
  assert.deepEqual(direct.map(row => row.combinationPair.playerIds), [[assist.id, scorer.id], [scorer.id, assist.id]])
  assert.equal(direct[0].combinationPair.connector, '→')
  assert.notEqual(direct[0].id, direct[1].id)
})

test('a selected Combination leaderboard matches its full projection and reuses an unchanged scope', () => {
  const matches = [match('selected', [{ id: 'selected-goal', type: 'goal', minute: 20, teamId: 'A', playerId: scorer.id, assistPlayerId: assist.id }])]
  const input = { category: 'combination', players, teams: [], matches, scope }
  const all = recordsLeaderboardGroups(input)
  assert.strictEqual(recordsLeaderboardGroups(input), all)
  assert.deepEqual(combinationBestUnitOptions, all.filter(group => group.id.startsWith('best-unit:')).map(group => ({ id: group.id, title: group.title })))
  for (const id of all.map(group => group.id)) {
    assert.deepEqual(recordsLeaderboardGroups({ ...input, selectedIds: [id] }), all.filter(group => group.id === id))
  }
  const changed = { ...input, matches: [{ ...matches[0], events: [] }] }
  assert.notStrictEqual(recordsLeaderboardGroups(changed), all)
  assert.equal(recordsLeaderboardGroups(changed).find(group => group.id === 'goal-combinations').rows.length, 0)
})

test('preview and View All use the same structured pair renderer with independent player actions', () => {
  const preview = fs.readFileSync('src/screens/RecordsScreen.tsx', 'utf8')
  const full = fs.readFileSync('src/screens/RecordsLeaderboardScreen.tsx', 'utf8')
  const shared = fs.readFileSync('src/components/RecordRows.tsx', 'utf8')
  assert.match(preview, /<RecordPreview[^>]+group=\{group\}/)
  assert.match(full, /renderRow=\{\(\{ row \}\) => <RecordRow/)
  assert.match(shared, /<RecordRow[^>]+group=\{group\}/)
  assert.match(shared, /<CombinationPairIdentity pair=\{row\.combinationPair\}/)
  const pair = combinationPairPresentation('goal-combinations', [assist.id, scorer.id])
  const navigation = []
  const renderer = screenHarness(root, 'components/CombinationPairIdentity.tsx', 'CombinationPairIdentity', {})
  const tree = renderer.render({ pair, playerById: new Map(players.map(player => [player.id, player])), onNavigate: view => navigation.push(view) })
  const connectors = nodes(tree, node => Object.hasOwn(node.props, 'data-combination-connector'))
  assert.deepEqual(connectors.map(node => node.props.children), ['→'])
  const actions = nodes(tree, component('PlayerIdentityAction'))
  assert.deepEqual(actions.map(node => node.props.player.id), pair.playerIds)
  actions.forEach(node => node.props.onNavigate(node.props.player.id))
  assert.deepEqual(navigation, pair.playerIds.map(id => ({ name: 'player', id })))
  assert.equal(nodes(tree, node => node.type === 'button').length, 0, 'player actions are independent')
})

test('previews focus on tied leaders and View all exposes every partnership with its shared rank', () => {
  const matches = [match('shared-leaders', [[assist, scorer], [scorer, other], [other, assist]].map(([from, to], index) => ({
    id: `goal-${index}`, type: 'goal', minute: 10 + index, teamId: 'A', playerId: to.id, assistPlayerId: from.id,
  })))]
  const [group] = recordsLeaderboardGroups({ category: 'combination', players, teams: [], matches, scope, selectedIds: ['goal-combinations'] })
  assert.deepEqual(group.rows.map(row => row.rank), [1, 1, 1])
  const navigation = []
  const preview = screenHarness(root, 'components/RecordRows.tsx', 'RecordPreview', {})
    .render({ group, players: new Map(), teams: new Map(), matches: new Map(), scope, onNavigate: view => navigation.push(view) })
  assert.deepEqual(nodes(preview, component('RecordRow')).map(node => node.props.row), group.rows)
  assert(nodes(preview, node => node.type === 'span' && /^3 leaders · view all$/i.test(node.props.children)).length)
  nodes(preview, node => node.type === 'button')[0].props.onClick()
  assert.equal(navigation[0].leaderboardId, group.id)
  const full = screenHarness(root, 'screens/RecordsLeaderboardScreen.tsx', 'RecordsLeaderboardScreen', { players, teams: [], matches })
    .render({ screenState: defaultScreenState(navigation[0]), onStateChange() {}, onNavigate() {}, onBack() {} })
  const [list] = nodes(full, component('VirtualRankingList'))
  assert.deepEqual(list.props.rows.map(entry => entry.row), group.rows)
  for (const entry of list.props.rows) {
    assert.equal(list.props.renderRow(entry).props.row.rank, 1)
  }
})
