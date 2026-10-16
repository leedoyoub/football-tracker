require('./helpers/register-ts.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const nav = require('../src/lib/navigation.ts')
const { saveLastRoute, loadLastNavigationEntry } = require('../src/lib/lastRoute.ts')
const { playerSeasonStats, teamBestEleven } = require('../src/engine/stats.ts')
const { COMPETITION_OPTIONS } = require('../src/lib/competitionOptions.ts')
const root = path.resolve(__dirname, '..')
const teams = ['A', 'B', 'C'].map(id => ({ id, name: id, shortName: id }))
const players = ['p', 'q', 'unused', 'released'].map((id, i) => ({ id, name: id, number: i, teamId: i === 3 ? 'C' : 'A', position: 'ST' }))
const { TACTICAL_SLOT_DEFINITIONS } = require('../src/engine/tacticalSlots.ts')
const fillerSlots = TACTICAL_SLOT_DEFINITIONS.filter(s => s.id !== 'LST').slice(0, 10)
players.push(...fillerSlots.map((slot, i) => ({ id: `f${i}`, name: `F${i}`, number: 20 + i, teamId: 'A', position: slot.ratingPosition })))
function game(id, type, starter, day, extra = {}) {
  return { id, season: 'S1', date: `2026-01-${String(day).padStart(2, '0')}`, matchDay: day, recordedAt: day, duration: 90, competitionType: type, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', formation: day % 2 ? '4-3-3' : '4-2-3-1',
    appearances: [...['p', 'q', 'released'].map(playerId => ({ playerId, teamId: 'A', role: playerId === starter ? 'starter' : 'bench', position: 'ST', matchPosition: 'ST' })), ...fillerSlots.map((slot, i) => ({ playerId: `f${i}`, teamId: 'A', role: 'starter', position: slot.ratingPosition, matchPosition: slot.ratingPosition }))],
    kickoffLineup: [{ id: 'LST', playerId: starter, matchPosition: 'ST', displayPosition: 'LST', x: 37, y: 18 }, ...fillerSlots.map((slot, i) => ({ ...slot, playerId: `f${i}` }))],
    events: [{ id: `${id}:goal`, type: 'goal', teamId: 'A', playerId: starter, minute: 10 }], ...extra }
}
const matches = [game('league1', 'league', 'p', 1), game('league2', 'league', 'p', 2), game('cup', 'cup', 'released', 3), game('champions', 'champions', 'q', 4), game('opponent', 'champions', 'q', 5, { teamId: 'B', homeTeamId: 'B', awayTeamId: 'A', appearances: [{ playerId: 'q', teamId: 'B', role: 'starter', position: 'ST', matchPosition: 'ST' }], events: [{ id: 'other-team-goal', type: 'goal', teamId: 'B', playerId: 'q', minute: 10 }] })]
matches[2].events.push({ id: 'cup-sub', type: 'sub', teamId: 'A', playerOutId: 'released', playerInId: 'p', position: 'ST', minute: 40 }, { id: 'cup-p-goal', type: 'goal', teamId: 'A', playerId: 'p', minute: 60 }, { id: 'cup-p-goal2', type: 'goal', teamId: 'A', playerId: 'p', minute: 70 })
function render(scope, games = matches) {
  const state = { ...nav.defaultScreenState({ name: 'team', id: 'A' }), tab: 'players', playersCompetition: scope }
  let changed; let destination
  const h = screenHarness(root, 'screens/TeamDetailScreen.tsx', 'TeamDetailScreen', { teams, players, matches: games })
  const tree = h.render({ teamId: 'A', season: 'S1', screenState: state, onStateChange: s => { changed = s }, onNavigate: v => { destination = v }, onBack() {} })
  return { tree, get changed() { return changed }, get destination() { return destination } }
}
for (const scope of ['all', 'league', 'cup', 'champions']) test(`Players ${scope}: canonical kickoff, all starter/Bench stats and current roster membership`, () => {
  const snapshot = JSON.stringify({ players, matches })
  const { tree } = render(scope)
  const pitch = nodes(tree, n => n.type?.name === 'Pitch')[0].props
  assert.equal(pitch.emptyRatingLabel, '—')
  const canonical = teamBestEleven(players, scope === 'all' ? matches : matches.filter(m => m.competitionType === scope), 'A', 'S1')
  assert.deepEqual(pitch.slots.map(({ avgRating: _avgRating, matches: _matches, ...slot }) => slot), canonical.slots.map(({ avgRating: _avgRating, matches: _matches, ...slot }) => slot))
  for (const slot of pitch.slots) {
    const p = players.find(p => p.id === slot.playerId)
    const stats = playerSeasonStats(p, players, matches, 'S1', 'A', scope === 'all' ? undefined : scope)
    assert.equal(slot.avgRating, stats.avgRating); assert.equal(slot.matches, stats.matches)
    assert.equal(pitch.statsByPlayer[p.id].goals, stats.goals)
    assert.equal(pitch.statsByPlayer[p.id].assists, stats.assists)
  }
  const cards = nodes(tree, n => n.type?.name === 'SubstitutePlayerCard')
  const starters = new Set(canonical.slots.map(s => s.playerId))
  assert.deepEqual(cards.map(c => c.props.player.id).sort(), players.filter(p => p.teamId === 'A' && !starters.has(p.id)).map(p => p.id).sort())
  for (const { props } of cards) {
    const stats = playerSeasonStats(props.player, players, matches, 'S1', 'A', scope === 'all' ? undefined : scope)
    assert.equal(props.rating, stats.matches ? stats.avgRating : undefined)
    assert.deepEqual(props.stats, { goals: stats.goals, assists: stats.assists })
  }
  assert.equal(JSON.stringify({ players, matches }), snapshot)
})
test('empty competition keeps every current roster player on Bench and never falls back to another XI', () => {
  const { tree } = render('cup', matches.filter(m => m.competitionType !== 'cup'))
  assert.equal(nodes(tree, n => n.type?.name === 'Pitch').length, 0)
  const cards = nodes(tree, n => n.type?.name === 'SubstitutePlayerCard')
  assert.equal(cards.length, players.filter(p => p.teamId === 'A').length)
  for (const card of cards) { assert.equal(card.props.rating, undefined); assert.equal(card.props.emptyRatingLabel, '—'); assert.deepEqual(card.props.stats, { goals: 0, assists: 0 }) }
})
test('same metric tabs precede Latest XI; Roster Management follows Bench and retains import action', () => {
  const result = render('league')
  const bench = nodes(result.tree, n => n.type?.name === 'SubstitutePlayerCard')[0]
  bench.props.onClick()
  assert.deepEqual(result.destination, { name: 'player', id: bench.props.player.id, season: 'S1', competitionType: 'league' })
  const tabs = nodes(result.tree, n => n.type?.name === 'RankingMetricTabs')[0]
  assert.ok(tabs); assert.equal(tabs.props.options, COMPETITION_OPTIONS); assert.equal(tabs.props.size ?? 'metric', 'metric')
  tabs.props.onChange('cup')
  assert.equal(result.changed.playersCompetition, 'cup'); assert.equal(result.changed.bestPlayersCompetition, 'all'); assert.equal(result.changed.matchesCompetition, 'all')
  const sections = nodes(result.tree, n => n.type === 'section')
  assert.equal(sections.at(-1).props['aria-label'], 'Roster management')
  const button = nodes(sections.at(-1), n => n.type === 'button')[0]
  button.props.onClick(); assert.deepEqual(result.destination, { name: 'import-squad', teamId: 'A' })
})
test('Players scope survives Player Back, tab switching and cold route restore; old/invalid scope defaults to All', () => {
  const view = { name: 'team', id: 'A' }
  assert.equal(nav.defaultScreenState(view).playersCompetition, 'all')
  let entries = [nav.createNavigationEntry(view, { ...nav.defaultScreenState(view), tab: 'players', playersCompetition: 'cup' }, 999)]
  entries = nav.pushNavigationEntry(entries, { name: 'player', id: 'p' }, 999)
  entries = nav.popNavigationEntry(entries)
  assert.equal(entries[0].screenState.playersCompetition, 'cup'); assert.equal(entries[0].scrollTop, 999)
  const values = new Map(); const storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }
  for (const scope of ['cup', 'all', undefined, 'invalid']) {
    saveLastRoute(view, undefined, storage, { ...entries[0].screenState, playersCompetition: scope })
    assert.equal(loadLastNavigationEntry({ teams, players, matches }, storage).screenState.playersCompetition, scope === 'cup' ? 'cup' : 'all')
  }
})
test('All rating weights individual matches and ignores another recorded team despite current membership', () => {
  const { ratePlayerMatch } = require('../src/engine/rating.ts')
  const pitch = nodes(render('all').tree, n => n.type?.name === 'Pitch')[0].props
  const p = players.find(p => p.id === 'p')
  const ratings = matches.slice(0, 3).map(m => ratePlayerMatch(m, p).raw)
  assert.equal(pitch.statsByPlayer.p.matches, 3)
  assert.equal(pitch.statsByPlayer.p.avgRating, ratings.reduce((a,b) => a+b, 0) / 3)
  assert.equal(pitch.statsByPlayer.p.goals, 4)
  assert.equal(pitch.statsByPlayer.q.goals, 1)
})
