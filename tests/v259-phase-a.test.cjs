require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test, after } = require('node:test')
const { renderToStaticMarkup } = require('react-dom/server')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const navigation = require('../src/lib/navigation.ts')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v259-phase-a-'))
if (!path.resolve(baseline).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected baseline path')
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: execFileSync('git', ['archive', '090d6f07d7d9910b41fd1fbb05382dcf0d884258', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
after(() => fs.rmSync(baseline, { recursive: true, force: true }))
const noop = () => {}
const props = { season: 'Season 1', onStateChange: noop, onNavigate: noop, onBack: noop }
const harness = (name, store, base = root) => screenHarness(base, `screens/${name}.tsx`, name, store)
function spy(object, key, fn) {
  const original = object[key]; let calls = 0
  object[key] = (...args) => { calls++; return original(...args) }
  try { fn(() => calls) } finally { object[key] = original }
}

test('Players without season/team filters skips every historical match query during continuous search', () => {
  const store = performanceFixture(1); const h = harness('PlayersScreen', store)
  const state = navigation.defaultScreenState({ name: 'players' })
  spy(require('../src/screens/RankingFilters.tsx'), 'matchesForPlayer', calls => {
    for (const search of ['', 'S', 'Syn', 'Synthetic', 'no match']) h.render({ ...props, screenState: { ...state, search } })
    assert.equal(calls(), 0)
  })
})

test('Players queries preserve baseline markup for scope combinations, former teams, No Team and released history', () => {
  const store = performanceFixture(2)
  for (const filters of [
    { seasons: [], teams: [], positions: [] }, { seasons: ['Season 1'], teams: [], positions: [] },
    { seasons: ['Season 2'], teams: [store.teams[0].id], positions: [] },
    { seasons: [], teams: ['__no-team__'], positions: [] },
    { seasons: ['Season 1'], teams: ['__no-team__', store.teams[0].id], positions: ['ST'] },
    { seasons: [], teams: [store.teams[1].id], positions: ['CB'] },
  ]) for (const search of ['', 'synthetic', '0', 'missing']) {
    const p = { ...props, screenState: { ...navigation.defaultScreenState({ name: 'players' }), filters, search } }
    assert.equal(renderToStaticMarkup(harness('PlayersScreen', store).render(p)), renderToStaticMarkup(harness('PlayersScreen', store, baseline).render(p)))
  }
})

test('shared appearance index serves duplicate/legacy membership and invalidates replacements without exposing filtered mutations', () => {
  const facts = require('../src/engine/playerMatchFacts.ts')
  const matches = [{ id: 'a', season: 'S1', appearances: [{ playerId: 'p', teamId: 'old' }, { playerId: 'p', teamId: 'old' }] }]
  assert.equal(typeof facts.playerAppearanceMatchIndex, 'function')
  const index = facts.playerAppearanceMatchIndex(matches)
  assert.deepEqual(index.get('p'), matches)
  assert.equal(facts.playerAppearanceMatchIndex(matches), index)
  const filters = { seasons: ['S1'], teams: ['old'], positions: [] }
  const selected = require('../src/screens/RankingFilters.tsx').matchesForPlayer({ id: 'p', teamId: 'new' }, matches, filters, index)
  selected.length = 0; assert.equal(index.get('p').length, 1)
  matches[0].appearances = [{ playerId: 'other', teamId: 'old' }]
  assert.notEqual(facts.playerAppearanceMatchIndex(matches), index)
  assert.equal(facts.playerAppearanceMatchIndex(matches).has('p'), false)
  matches[0] = { ...matches[0], appearances: [{ playerId: 'p', teamId: 'old' }] }
  assert.equal(facts.playerAppearanceMatchIndex(matches).get('p').length, 1)
})

test('historical filters still notice legacy player ID edits inside an existing appearance array', () => {
  const { matchesForPlayer } = require('../src/screens/RankingFilters.tsx')
  const matches = [{ id: 'legacy', season: 'S1', appearances: [{ playerId: 'before', teamId: 'old' }] }]
  const filters = { seasons: ['S1'], teams: ['old'], positions: [] }
  assert.equal(matchesForPlayer({ id: 'before' }, matches, filters).length, 1)
  matches[0].appearances[0].playerId = 'after'
  assert.equal(matchesForPlayer({ id: 'before' }, matches, filters).length, 0)
  assert.equal(matchesForPlayer({ id: 'after' }, matches, filters).length, 1)
})

test('Teams logo mode avoids all competition calculations and Progress revisits use selector caches', () => {
  const store = { ...performanceFixture(1), competitionCacheOwner: {}, competitionRevisions: {}, teamCatalogRevision: 0 }
  const h = harness('TeamsScreen', store)
  const engine = require('../src/engine/competition.ts')
  spy(engine, 'cupCompetition', calls => {
    let tree = h.render(props); assert.equal(calls(), 0)
    const toggle = () => { const button = nodes(tree, n => n.type === 'button' && /competition progress|logos and names/.test(n.props['aria-label'] ?? ''))[0]; button.props.onClick(); tree = h.render(props) }
    toggle(); assert.equal(calls(), 1)
    assert.match(renderToStaticMarkup(tree), /Team competition progress/)
    toggle(); toggle(); assert.equal(calls(), 1)
  })
  assert.equal(nodes(h.render(props), n => n.type?.name === 'TeamGridCard').length, 16)
})

test('Teams Progress preserves tournament Cup scope after Home caches a catalog containing historical teams', () => {
  const { game } = require('./helpers/v258-fixture.cjs')
  const s = performanceFixture(1)
  const matches = s.teams.map((team, i) => game(`scope:${team.id}`, team.id, { season: 'Season 1', gf: 16 - i, ga: i }))
  const teams = [{ id: 'historical-team', name: 'Historical team', shortName: 'HIS' }, ...s.teams]
  const store = { ...s, teams, matches, competitionCacheOwner: {}, competitionRevisions: {}, teamCatalogRevision: 0 }
  require('../src/engine/competitionSelectors.ts').selectCupCompetition(store.competitionCacheOwner, teams, matches, 'Season 1', 0, 0, s.players)
  const progress = base => {
    const h = harness('TeamsScreen', store, base)
    const tree = h.render(props)
    nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Show competition progress')[0].props.onClick()
    return renderToStaticMarkup(h.render(props))
  }
  assert.equal(progress(root), progress(baseline))
})

test('Team Overview uses only light League history with exact baseline rank/movement and statistics', () => {
  const store = performanceFixture(1); const id = store.teams[0].id
  const p = { ...props, teamId: id, screenState: navigation.defaultScreenState({ name: 'team', id }) }
  const expected = renderToStaticMarkup(harness('TeamDetailScreen', store, baseline).render(p))
  spy(require('../src/engine/seasonAnalytics.ts'), 'buildSeasonAnalytics', calls => {
    assert.equal(renderToStaticMarkup(harness('TeamDetailScreen', store).render(p)), expected)
    assert.equal(calls(), 0)
  })
})

test('Season Highlight monthly/review do not generate News and kind changes retain exact output', () => {
  const store = performanceFixture(1); const h = harness('SeasonHighlightScreen', store)
  spy(require('../src/engine/news.ts'), 'majorNewsEvents', calls => {
    for (const kind of ['monthly', 'review']) {
      const p = { ...props, kind }
      assert.equal(renderToStaticMarkup(h.render(p)), renderToStaticMarkup(harness('SeasonHighlightScreen', store, baseline).render(p)))
      assert.equal(calls(), 0)
    }
    const p = { ...props, kind: 'news' }
    assert.equal(renderToStaticMarkup(h.render(p)), renderToStaticMarkup(harness('SeasonHighlightScreen', store, baseline).render(p)))
    assert.equal(calls(), 1)
  })
})
