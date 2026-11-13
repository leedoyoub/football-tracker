require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test } = require('node:test'), path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { getMatchManOfTheMatch, ratePlayerMatch } = require('../src/engine/rating.ts')
const { playerForm } = require('../src/engine/playerForm.ts')
const { ratingTone } = require('../src/components/ui.tsx')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const root = path.resolve(__dirname, '..'), noop = () => {}
const players = ['p', 'q'].map(id => ({ id, name: id, position: 'ST', number: 9, teamId: '' }))
const teams = ['A', 'B'].map(id => ({ id, name: id, shortName: id }))
function match(id, winner = 'p', day = 1) {
  return { id, season: 'S1', date: `2025-01-${String(day).padStart(2, '0')}`, matchDay: day, duration: 90, competitionType: 'league', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B',
    appearances: players.map(p => ({ playerId: p.id, teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' })),
    events: [1, 2, 3].map(minute => ({ id: `${id}:${minute}`, type: 'goal', teamId: 'A', playerId: winner, minute: minute * 10 })) }
}
const harness = (name, store = {}) => screenHarness(root, 'screens/PlayerDetailScreen.tsx', name, store)
function renderedMatchRows(matches, roster = players) {
  const state = { players: roster, teams, matches }, player = roster[0]
  const shell = harness('PlayerDetailScreen', state).render({ playerId: player.id, season: 'S1', screenState: { ...defaultScreenState({ name: 'player', id: player.id }), season: 'S1', tab: 'matches' }, onStateChange: noop, onNavigate: noop, onBack: noop })
  const content = nodes(shell, n => n.type?.name === 'PlayerMatches')[0]
  return nodes(harness('PlayerMatches', state).render(content.props), n => n.type?.name === 'MatchRow').map(row => ({ match: row.props.match, tree: harness('MatchRow', state).render(row.props) }))
}
function ratingBadge(tree) { return nodes(tree, n => n.type === 'b')[0] }
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || node === false ? '' : String(node)

test('Matches gives historical official MOM a blue star and preserves normal rating numbers and tones', () => {
  const high = match('normal-high', 'q', 3)
  high.events.push(...[1, 2, 3, 4].map(minute => ({ id: `q-goal:${minute}`, type: 'goal', teamId: 'A', playerId: 'q', minute: 40 + minute })))
  high.events = high.events.map((event, index) => index < 3 ? { ...event, playerId: 'p' } : event)
  const low = match('normal-low', 'q', 4)
  low.events.push(...[1, 2, 3, 4, 5, 6].map(minute => ({ id: `conceded:${minute}`, type: 'goal', teamId: 'B', concededGoalCausePlayerId: 'p', minute: 50 + minute })))
  const matches = [match('historical-mom'), match('normal', 'q', 2), high, low]
  const normalTones = new Set()
  for (const row of renderedMatchRows(matches)) {
    const mom = getMatchManOfTheMatch(row.match, players) === 'p', rating = ratePlayerMatch(row.match, players[0]), badge = ratingBadge(row.tree)
    assert.equal(text(badge), `${rating.rating.toFixed(1)}${mom ? ' ★' : ''}`)
    assert.equal(badge.props.className, mom ? 'text-blue-300' : ratingTone(rating.rating))
    if (!mom) normalTones.add(badge.props.className)
    assert.equal(nodes(row.tree, n => n.type?.name === 'RatingDetails').length, 1)
  }
  assert.equal(normalTones.size, 3, 'normal good, average and poor performances retain all three existing tones')
})

test('editing historical goals changes the displayed MOM immediately with the original match ID', () => {
  const original = match('saved-match'), changed = { ...original, events: original.events.map(event => ({ ...event, playerId: 'q' })) }
  assert.match(text(ratingBadge(renderedMatchRows([original])[0].tree)), / ★$/)
  const updated = ratingBadge(renderedMatchRows([changed])[0].tree)
  assert.equal(text(updated), ratePlayerMatch(changed, players[0]).rating.toFixed(1))
  assert.equal(updated.props.className, ratingTone(ratePlayerMatch(changed, players[0]).rating))
})

function graph() {
  const matches = Array.from({ length: 12 }, (_, i) => match(`exact-match-${i}`, i % 2 ? 'q' : 'p', i + 1)), routes = []
  const form = playerForm(matches.map(match => ({ match, rating: ratePlayerMatch(match, players[0]) })))
  const h = harness('RecentForm'), tree = h.render({ form, playerId: 'p', players, teams, onNavigate: route => routes.push(route) })
  const plot = nodes(tree, n => n.props?.['aria-label'] === 'Recent Form horizontal plot')[0]
  return { tree, form, routes, plot, buttons: nodes(tree, n => n.props?.role === 'button') }
}

test('Recent Form exposes one graph control per exact match without duplicate buttons and retains graph/stat labels', () => {
  const { tree, form, buttons } = graph()
  assert.equal(nodes(tree, n => n.type === 'button').length, 0)
  assert.equal(buttons.length, form.points.length)
  assert.equal(nodes(tree, n => n.type === 'svg')[0].props.role, 'group', 'interactive descendants must be exposed to accessibility APIs')
  for (const [index, button] of buttons.entries()) {
    assert.equal(button.props.tabIndex, 0)
    assert.match(button.props['aria-label'], new RegExp(form.points[index].match.date))
    assert.equal(nodes(button, n => n.type === 'text')[0].props.children, form.points[index].rating.rating.toFixed(1))
  }
  for (const label of ['Last 5 avg', 'Season avg', 'Trend']) assert(text(tree).includes(label))
})

test('graph point/label click, Enter and Space activate their exact historical match', () => {
  const { buttons, routes, form } = graph()
  assert.equal(buttons.length, 12)
  buttons[2].props.onClick({ detail: 1 })
  let prevented = 0
  buttons[7].props.onKeyDown({ key: 'Enter', repeat: false, preventDefault() { prevented++ } })
  buttons[10].props.onKeyDown({ key: ' ', repeat: false, preventDefault() { prevented++ } })
  buttons[0].props.onKeyDown({ key: 'ArrowRight', repeat: false, preventDefault() { throw Error('unrelated key consumed') } })
  assert.deepEqual(routes, [2, 7, 10].map(index => ({ name: 'match', id: form.points[index].match.id })))
  assert.equal(prevented, 2)
})

test('horizontal or vertical pointer drags, native scroll and cancelled touches do not navigate; next tap works', () => {
  for (const mode of ['horizontal', 'vertical', 'scroll', 'cancel']) {
    const { plot, buttons, routes } = graph(), surface = { scrollLeft: 80 }
    assert.equal(buttons.length, 12)
    const event = (x = 50, y = 40) => ({ pointerId: 1, clientX: x, clientY: y, currentTarget: surface })
    plot.props.onPointerDownCapture(event())
    if (mode === 'horizontal') plot.props.onPointerMoveCapture(event(90))
    if (mode === 'vertical') plot.props.onPointerMoveCapture(event(50, 80))
    if (mode === 'scroll') { surface.scrollLeft = 110; plot.props.onScroll({ currentTarget: surface }) }
    if (mode === 'cancel') plot.props.onPointerCancelCapture(event())
    else plot.props.onPointerUpCapture(event(mode === 'horizontal' ? 90 : 50, mode === 'vertical' ? 80 : 40))
    buttons[3].props.onClick({ detail: 1 })
    assert.deepEqual(routes, [], mode)
    buttons[3].props.onKeyDown({ key: 'Enter', repeat: false, preventDefault() {} })
    assert.equal(routes.length, 1, 'keyboard stays usable after a drag')
    plot.props.onPointerDownCapture(event()); plot.props.onPointerUpCapture(event())
    buttons[3].props.onClick({ detail: 1 })
    assert.equal(routes.length, 2, 'next tap resets drag suppression')
    assert.match(plot.props.className, /overflow-x-auto/)
  }
})
