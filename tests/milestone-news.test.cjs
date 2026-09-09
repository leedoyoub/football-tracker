const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { deriveNews, homeMilestoneNews } = require('../src/engine/news.ts')

const striker = { id: 'P', name: 'Player', displayName: 'Player', position: 'ST', number: 9, teamId: 'A' }
const assister = { id: 'Q', name: 'Creator', displayName: 'Creator', position: 'CAM', number: 10, teamId: 'A' }
const keeper = { id: 'GK', name: 'Keeper', displayName: 'Keeper', position: 'GK', number: 1, teamId: 'A' }
const players = [striker, assister, keeper]
const teams = [{ id: 'A', name: 'Alpha', shortName: 'ALP' }, { id: 'B', name: 'Beta', shortName: 'BET' }]
function match(id, day, { goals = 0, assists = goals, saves = 0, type = 'league', scoreAgainst = 0 } = {}) {
  const appearances = players.map(player => ({ playerId: player.id, teamId: 'A', role: 'starter', position: player.position, matchPosition: player.position }))
  return { id, season: 'Season 1', competitionType: type, competitionStage: type === 'cup' ? 'stage1' : type === 'champions' ? 'roundOf16' : 'regular', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances, manOfMatchPlayerId: 'P', events: [
    ...Array.from({ length: goals }, (_, index) => ({ id: `${id}:g${index}`, type: 'goal', minute: index + 1, teamId: 'A', playerId: 'P', ...(index < assists ? { assistPlayerId: 'Q' } : {}) })),
    ...Array.from({ length: scoreAgainst }, (_, index) => ({ id: `${id}:o${index}`, type: 'goal', minute: index + 50, teamId: 'B' })),
    ...(saves ? [{ id: `${id}:s`, type: 'save', minute: 80, teamId: 'A', playerId: 'GK', count: saves }] : []),
  ] }
}

test('season, competition, career and 10–10 milestone IDs fire once under duplicate hydration input', () => {
  const combo = match('combo', 2)
  combo.events = Array.from({ length: 10 }, (_, index) => ({ id: `combo:g${index}`, type: 'goal', minute: index + 1, teamId: 'A', playerId: 'Q', assistPlayerId: 'P' }))
  const games = [match('one', 1, { goals: 10, assists: 10, type: 'champions' }), combo, match('career', 3, { goals: 40, assists: 0 })]
  const items = deriveNews(players, teams, [...games, games[2]])
  for (const id of ['season-goals:Season 1:P:10', 'competition-goals:Season 1:champions:P:5', 'season-combo:Season 1:P:10', 'career-goals:P:50']) assert.equal(items.filter(item => item.id === id).length, 1, id)
})

test('player partnership uses stable unordered IDs and reaches its 10-goal combination once', () => {
  const items = deriveNews(players, teams, [match('pair', 1, { goals: 10, assists: 10 })])
  const pair = items.find(item => item.id === 'combo-goals:P:Q:10')
  assert(pair); assert.match(pair.title, /combine for their 10th goal/)
})

test('rare match news chooses one more-impressive headline and goalkeeper thresholds derive from save events', () => {
  const items = deriveNews(players, teams, [match('rare', 1, { goals: 4, assists: 4, saves: 100 })])
  assert.equal(items.filter(item => item.id.startsWith('rare:rare:P:')).length, 1)
  assert(items.some(item => item.id === 'career-saves:GK:100'))
})

test('five appearance-based scoring/contribution games and team wins produce stable streak milestones', () => {
  const games = Array.from({ length: 5 }, (_, index) => match(`run${index + 1}`, index + 1, { goals: 1, assists: 1 }))
  const items = deriveNews(players, teams, games)
  assert(items.some(item => item.id.startsWith('streak:scoring:')))
  assert(items.some(item => item.id.startsWith('streak:contribution:')))
  assert(items.some(item => item.id.startsWith('team-win-streak:')))
})

test('Home milestone feed is deterministic, newest-first and capped at five', () => {
  const games = Array.from({ length: 6 }, (_, index) => match(`news${index + 1}`, index + 1, { goals: 4 }))
  const first = homeMilestoneNews(players, teams, games)
  const second = homeMilestoneNews(players, teams, games)
  assert.equal(first.length, 5)
  assert.deepEqual(first.map(item => item.id), second.map(item => item.id))
  assert(first.every((item, index) => !index || item.date <= first[index - 1].date))
})

test('news engine includes stable title, double, treble and record identifiers derived from history', () => {
  const source = fs.readFileSync(require.resolve('../src/engine/news.ts'), 'utf8')
  for (const token of ['title:${history.season}', "'treble' : 'double'", 'record:all-time-${field}', 'record:season-${field}', 'competitionHistory']) assert(source.includes(token), token)
  assert(!source.includes('Math.random'))
})
