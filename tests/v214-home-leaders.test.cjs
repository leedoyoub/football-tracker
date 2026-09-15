const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

let owner
const equalDependencies = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index])
const hooks = { ...React,
  useState(initial) { const host = owner, index = host.cursor++; if (!(index in host.state)) host.state[index] = typeof initial === 'function' ? initial() : initial; return [host.state[index], value => { host.state[index] = typeof value === 'function' ? value(host.state[index]) : value }] },
  useMemo(factory, dependencies) { const host = owner, index = host.cursor++, previous = host.memo[index]; if (!previous || !equalDependencies(previous.dependencies, dependencies)) host.memo[index] = { dependencies, value: factory() }; return host.memo[index].value },
}
const load = Module._load
Module._load = function(name, parent, main) {
  if (name === 'react') return hooks
  if (name === '../store' || name === './store') return { useStore: () => owner.store }
  return load.call(this, name, parent, main)
}

const { HomeScreen, SEASON_LEADER_PAGE_SIZE } = require('../src/screens/HomeScreen.tsx')

const player = index => ({ id: `P${String(index).padStart(2, '0')}`, name: `P${String(index).padStart(2, '0')}`, displayName: `P${String(index).padStart(2, '0')}`, position: 'ST', number: index, teamId: 'A' })
const match = (season, players) => ({ id: season, season, matchDay: 1, date: '2026-09-16', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: players.map(item => ({ playerId: item.id, teamId: 'A', role: 'starter', position: item.position, matchPosition: item.position })), events: [] })
const teams = [{ id: 'A', name: 'Team A', shortName: 'A' }, { id: 'B', name: 'Team B', shortName: 'B' }]
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(item => nodes(item, predicate)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
const text = node => Array.isArray(node) ? node.map(text).join('') : !node || typeof node !== 'object' ? node == null ? '' : String(node) : text(node.props?.children)
function screen(players, matches, season = 'S1') {
  const host = { cursor: 0, state: [], memo: [], store: { players, matches, teams, competitionStates: [] } }
  const render = (nextSeason = season) => { owner = host; host.cursor = 0; return HomeScreen({ season: nextSeason, onNavigate() {} }) }
  return { host, render }
}
function leaderArticles(tree) { return nodes(nodes(tree, node => node.props?.['data-home-section'] === 'season-leaders')[0], node => node.type === 'article') }
function playerButtons(article) { return nodes(article, node => node.type === 'button' && text(node) !== 'Show More') }
function showMore(article) { return nodes(article, node => node.type === 'button' && text(node) === 'Show More')[0] }

test('Season Leader page size is ten and Show More only changes presentation state', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  assert.equal(SEASON_LEADER_PAGE_SIZE, 10)
  assert(source.includes("useMemo(() => buildGlobalRankingData(players, matches, { seasons: [season], teams: [], positions: [] }, 'rating'), [players, matches, season])"))
  assert(source.includes('rankGlobalRankingRows(seasonStats, players, item.metric)'))
  assert(source.includes('item.rows.slice(0, visibleCount)'))
  assert(source.includes('setLeaderPresentation'))
  assert(source.includes('})), [seasonStats, players])'))
})

test('25 ranked players expand 10 → 20 → 25 without reordering, independently per category', () => {
  const players = Array.from({ length: 25 }, (_, index) => player(index + 1)), view = screen(players, [match('S1', players)])
  let articles = leaderArticles(view.render())
  assert.deepEqual(articles.map(article => playerButtons(article).length), [10, 10, 10])
  assert(articles.every(showMore))
  const initialIds = playerButtons(articles[0]).map(button => text(button).match(/P\d{2}/)?.[0])
  showMore(articles[0]).props.onClick()
  articles = leaderArticles(view.render())
  assert.deepEqual(articles.map(article => playerButtons(article).length), [20, 10, 10])
  assert.deepEqual(playerButtons(articles[0]).slice(0, 10).map(button => text(button).match(/P\d{2}/)?.[0]), initialIds)
  assert.deepEqual(playerButtons(articles[0]).slice(10).map(button => text(button).match(/P\d{2}/)?.[0]), Array.from({ length: 10 }, (_, index) => `P${String(index + 11).padStart(2, '0')}`))
  showMore(articles[0]).props.onClick()
  articles = leaderArticles(view.render())
  assert.deepEqual(articles.map(article => playerButtons(article).length), [25, 10, 10])
  assert.equal(showMore(articles[0]), undefined)
  assert(showMore(articles[1]))
})

test('short and exact-page leaderboards hide Show More at the end', () => {
  for (const count of [8, 20]) {
    const players = Array.from({ length: count }, (_, index) => player(index + 1)), view = screen(players, [match('S1', players)])
    let articles = leaderArticles(view.render())
    assert.deepEqual(articles.map(article => playerButtons(article).length), Array(3).fill(Math.min(10, count)))
    assert.equal(showMore(articles[0]) !== undefined, count > 10)
    if (count === 20) { showMore(articles[0]).props.onClick(); articles = leaderArticles(view.render()); assert.equal(playerButtons(articles[0]).length, 20); assert.equal(showMore(articles[0]), undefined) }
  }
})

test('changing season resets each Season Leader to ten visible players', () => {
  const players = Array.from({ length: 25 }, (_, index) => player(index + 1)), view = screen(players, [match('S1', players), match('S2', players)])
  let articles = leaderArticles(view.render('S1')); showMore(articles[0]).props.onClick(); articles = leaderArticles(view.render('S1'))
  assert.equal(playerButtons(articles[0]).length, 20)
  articles = leaderArticles(view.render('S2'))
  assert.deepEqual(articles.map(article => playerButtons(article).length), [10, 10, 10])
})
