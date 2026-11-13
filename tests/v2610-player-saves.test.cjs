require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { players, game, save, cases } = require('./helpers/v2610-saves-fixture.cjs')
const { playerSaveCount } = require('../src/engine/playerMatchFacts.ts')
const { getMatchManOfTheMatch, ratePlayerMatch } = require('../src/engine/rating.ts')
const { ratingTone } = require('../src/components/ui.tsx')
const root = path.resolve(__dirname, '..')
const h = name => screenHarness(root, 'screens/PlayerDetailScreen.tsx', name, {})
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || node === false ? '' : String(node)
const badges = tree => nodes(tree, n => n.type === 'span' && text(n).startsWith('🧤 '))
function row(match, player = players[0], onNavigate = () => {}) {
  return h('MatchRow').render({ match, player, momId: getMatchManOfTheMatch(match, players), onNavigate })
}
for (const { match, want } of cases()) test(`Player Matches ${match.id} displays ${want} official saves`, () => {
  assert.equal(playerSaveCount(match, match.appearances[0]), want, 'hand-checked fixture agrees with the unchanged official rule')
  const tree = row(match), found = badges(tree)
  assert.deepEqual(found.map(text), want ? [`🧤 ${want}`] : [])
  if (want) assert.match(found[0].props.className, /whitespace-nowrap/)
})

test('save badges preserve concurrent goal/assist icons, canonical MOM, rating and match navigation', () => {
  const match = cases().find(c => c.match.id === 'all-contributions').match, routes = [], tree = row(match, players[0], v => routes.push(v))
  const contents = nodes(tree, n => n.type === 'div' && n.props.className === 'mt-1 flex gap-2 text-xs')[0]
  assert.equal(text(contents), '⚽👟🧤 2')
  const rating = ratePlayerMatch(match, players[0]), mom = getMatchManOfTheMatch(match, players)
  assert.equal(mom, 'p')
  const badge = nodes(tree, n => n.type === 'b')[0]
  assert.equal(text(badge), rating.rating.toFixed(1) + ' ★'); assert.equal(badge.props.className, 'text-blue-300')
  nodes(tree, n => n.type === 'button')[0].props.onClick()
  assert.deepEqual(routes, [{ name: 'match', id: match.id }])
  assert.equal(nodes(tree, n => n.type?.name === 'RatingDetails').length, 1)
})

test('same-ID historical match edits immediately update and remove the save badge on the same row lifecycle', () => {
  const harness = h('MatchRow'), original = game('edited', [save('save')])
  for (const [events, want] of [[original.events, 1], [[save('save', { count: 6 })], 6], [[], 0]]) {
    const match = { ...original, events }, tree = harness.render({ match, player: players[0], onNavigate() {} })
    assert.deepEqual(badges(tree).map(text), want ? [`🧤 ${want}`] : [])
    const rating = ratePlayerMatch(match, players[0]), badge = nodes(tree, n => n.type === 'b')[0]
    assert.equal(text(badge), rating.rating.toFixed(1)); assert.equal(badge.props.className, ratingTone(rating.rating))
  }
})

test('saved-player history uses the same positive official counts and keeps exact match navigation', () => {
  const routes = [], matches = [game('saved-positive', [save('six', { count: 6 })]), game('saved-zero')]
  const tree = h('SavedPlayerMatches').render({ playerId: 'p', matches, onNavigate: v => routes.push(v) })
  assert.deepEqual(badges(tree).map(text), ['🧤 6'])
  nodes(tree, n => n.type === 'button')[0].props.onClick()
  assert.deepEqual(routes, [{ name: 'match', id: 'saved-positive' }])
})
