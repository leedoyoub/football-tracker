const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { deriveNews } = require('../src/engine/news.ts')

const player = { id: 'p', name: 'Player', displayName: 'Player', fullName: 'Player', number: 9, position: 'ST', teamId: 'A' }
const teams = [{ id: 'A', name: 'Alpha', shortName: 'ALP', logo: '' }, { id: 'B', name: 'Beta', shortName: 'BET', logo: '' }]
const appearance = { playerId: 'p', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }
const game = (id, day, goals) => ({ id, season: 'S1', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: [appearance], events: Array.from({ length: goals }, (_, index) => ({ id: `${id}:${index}`, type: 'goal', teamId: 'A', minute: index + 1, playerId: 'p' })) })

test('news is derived, chronological, and combines multiple crossed career milestones in one item', () => {
  const matches = [game('late', 2, 2), game('early', 1, 9)]
  const news = deriveNews([player], teams, matches)
  const milestone = news.find(item => item.id === 'player:milestone:late:p:goals')
  assert(milestone)
  assert.match(milestone.title, /10 career goals/)
  assert.equal(news.filter(item => item.id === milestone.id).length, 1)
  assert.equal(news[0].date, '2026-01-02')
})
