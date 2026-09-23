const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { deriveFootballEvents, majorNewsEvents } = require('../src/engine/news.ts')
const { matchChangesForMatch } = require('../src/engine/matchChanges.ts')

const player = (id, position = 'ST') => ({ id, name: id, displayName: id, teamId: 'A', position, number: 1 })
const teams = [
  { id: 'A', name: 'Alpha', shortName: 'A', abbreviation: 'A', visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white' },
  { id: 'B', name: 'Beta', shortName: 'B', abbreviation: 'B', visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white' },
]
const match = (id, day, goals) => ({ id, season: 'Season 1', competitionType: 'league', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: [{ playerId: 'p', teamId: 'A', position: 'ST', role: 'starter' }], events: Array.from({ length: goals }, (_, index) => ({ id: `${id}-g${index}`, type: 'goal', minute: index + 1, teamId: 'A', playerId: 'p' })) })

test('canonical event projections keep major News separate from detailed match changes', () => {
  const players = [player('p')]
  const matches = [match('ordinary', 1, 1), match('exceptional', 2, 4)]
  const states = []
  const events = deriveFootballEvents(players, teams, matches, states)
  const news = majorNewsEvents(players, teams, matches, states, 'Season 1')
  const changes = matchChangesForMatch(players, teams, matches, states, 'ordinary')

  assert(events.some(event => event.matchId === 'exceptional' && (event.surface === 'news' || event.surface === 'both')))
  assert(events.some(event => event.matchId === 'ordinary' && (event.surface === 'match-change' || event.surface === 'both')))
  assert(news.every(item => item.surface === 'news' || item.surface === 'both'))
  assert(news.every(item => item.date >= '2026-01-01'))
  assert.equal(changes.length, 0)
})

test('match changes are cached by collection identity and never mutate raw history', () => {
  const players = [player('p')]
  const matches = [match('m1', 1, 1)]
  const states = []
  const before = JSON.stringify(matches)
  const first = matchChangesForMatch(players, teams, matches, states, 'm1')
  const second = matchChangesForMatch(players, teams, matches, states, 'm1')
  assert.strictEqual(first, second)
  assert.equal(JSON.stringify(matches), before)
  assert.notStrictEqual(matchChangesForMatch(players, teams, [...matches], states, 'm1'), first)
})

test('same-date News events use canonical recorded chronology before stable ids', () => {
  const players = [player('p')]
  const matches = [
    { ...match('zeta', 1, 1), date: '2026-01-10', recordedAt: 1 },
    { ...match('alpha', 2, 1), date: '2026-01-10', recordedAt: 2 },
  ]
  const performanceIds = deriveFootballEvents(players, teams, matches, [])
    .filter(event => event.id.startsWith('match-performance:'))
    .map(event => event.id)
  assert.deepEqual(performanceIds, ['match-performance:alpha:p', 'match-performance:zeta:p'])
})

test('only a newly taken #1 in a core metric is promoted from ranking data to News', () => {
  const p = player('p')
  const r = { ...player('r'), teamId: 'B' }
  const rankingMatch = (id, day, pGoals, rGoals) => ({
    id, season: 'Season 1', competitionType: 'league', matchDay: day, date: `2026-02-0${day}`, duration: 90,
    homeTeamId: 'A', awayTeamId: 'B',
    appearances: [{ playerId: 'p', teamId: 'A', position: 'ST', role: 'starter' }, { playerId: 'r', teamId: 'B', position: 'ST', role: 'starter' }],
    events: [
      ...Array.from({ length: pGoals }, (_, index) => ({ id: `${id}-p${index}`, type: 'goal', minute: index + 1, teamId: 'A', playerId: 'p' })),
      ...Array.from({ length: rGoals }, (_, index) => ({ id: `${id}-r${index}`, type: 'goal', minute: index + 10, teamId: 'B', playerId: 'r' })),
    ],
  })
  const matches = [rankingMatch('md1', 1, 1, 0), rankingMatch('md2', 2, 0, 2)]
  const events = deriveFootballEvents([p, r], teams, matches, [])
  const takeover = events.find(event => event.id === 'rank:player:Season 1:2:goals:r')
  assert.equal(takeover?.surface, 'news')
  assert.match(takeover?.title ?? '', /takes #1 in Goals/)
  assert(majorNewsEvents([p, r], teams, matches, [], 'Season 1').some(event => event.id === takeover?.id))
  assert.equal(events.some(event => event.id.startsWith('rank:team:')), false)
})
