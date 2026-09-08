const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const insights = require('../src/engine/seasonInsights.ts')

const player = (id, position = 'ST') => ({ id, name: id, displayName: id, fullName: id, position, number: 1, teamId: 'A' })
const p = player('p'); const q = player('q')
const appearance = (item, role = 'starter') => ({ playerId: item.id, teamId: 'A', role, position: item.position, matchPosition: item.position })
const match = (id, day, events = [], appearances = [appearance(p), appearance(q)]) => ({ id, season: 'S1', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances, events })
const goal = (id, minute, props = {}) => ({ id, type: 'goal', teamId: 'A', minute, ...props })

test('form ignores unused bench and streaks track current separately from season best', () => {
  const games = [
    match('one', 1, [goal('g1', 10, { playerId: 'p' })]),
    match('two', 2, [goal('g2', 10, { playerId: 'p' })]),
    match('three', 3, [], [appearance(p, 'bench')]),
    match('four', 4, [goal('g4', 10, { playerId: 'p' })]),
  ]
  const form = insights.playerForm(p, games)
  assert.equal(form.ratings.length, 3)
  const goals = insights.playerStreaks(p, games).find(row => row.key === 'goals')
  assert.deepEqual([goals.current, goals.best], [1, 2])
})

test('clutch classification rebuilds score state in chronological event order', () => {
  const game = match('clutch', 1, [goal('a', 10, { playerId: 'p' }), goal('b', 30, { teamId: 'B' }), goal('c', 80, { playerId: 'p' })])
  const classifications = insights.classifyGoalEvents(game)
  assert.deepEqual(classifications[0].labels, ['Opening Goal', 'Go-ahead Goal'])
  assert(classifications[1].labels.includes('Equalizer'))
  assert.deepEqual(classifications[2].labels, ['Go-ahead Goal', 'Winning Goal', 'Late Goal'])
})

test('starting XI leaders enforce the three-match sample and recap unlocks at 38 match days', () => {
  const games = [1, 2, 3].map(day => match(`xi-${day}`, day, [goal(`g-${day}`, 10, { playerId: 'p' })]))
  const xi = insights.startingXIAnalytics([p, q], games, 'S1')
  assert.equal(xi.length, 1); assert.equal(xi[0].eligible, true); assert.equal(insights.startingXILeaders([p, q], games, 'S1').mostUsed.matches, 3)
  const fullSeason = Array.from({ length: 38 }, (_, index) => match(`m-${index + 1}`, index + 1))
  assert.equal(insights.isSeasonComplete(fullSeason, 'S1'), true)
})

test('home stories are compact, derived output only', () => {
  const games = [1, 2, 3].map(day => match(`story-${day}`, day, [goal(`g-${day}`, 10, { playerId: 'p' })]))
  const stories = insights.homeDataStories([p, q], games, 'S1')
  assert(stories.length > 0 && stories.length <= 4)
  assert(stories.every(story => Array.isArray(story.playerIds) && story.playerIds.length > 0))
})
