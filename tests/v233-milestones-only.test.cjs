const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { buildMatchChangeIndex } = require('../src/engine/matchChangeIndex.ts')
const { deriveNews } = require('../src/engine/news.ts')

const teams = [{ id: 'A', name: 'A', shortName: 'A' }, { id: 'B', name: 'B', shortName: 'B' }]
const player = { id: 'P', name: 'Player', displayName: 'Player', teamId: 'A', position: 'ST', number: 9 }
const appearance = { playerId: 'P', teamId: 'A', position: 'ST', matchPosition: 'ST', role: 'starter' }
const game = (id, day, goals) => ({ id, season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: `2026-09-${String(day).padStart(2, '0')}`, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: [appearance], events: Array.from({ length: goals }, (_, index) => ({ id: `${id}:${index}`, type: 'goal', minute: index + 1, teamId: 'A', playerId: 'P' })) })

test('What Changed returns all canonical milestones but excludes personal-best, rare, and ranking events', () => {
  const matches = [game('first', 1, 8), game('crossing', 2, 3)]
  const items = (buildMatchChangeIndex([player], teams, matches, []).get('crossing') ?? []).flatMap(group => group.items)
  assert(items.some(item => item.label === 'Career 10 Goals'))
  assert(items.every(item => item.kind === 'milestone'))
  assert.equal(items.some(item => /Personal best|Hat-trick|TAKES #1/i.test(item.label)), false)
  assert(deriveNews([player], teams, matches, []).some(item => item.id === 'rare:crossing:P:performance'))
})

test('Match Detail keeps What Changed lazy and renders the milestone-only empty state', () => {
  const index = fs.readFileSync(require.resolve('../src/engine/matchChangeIndex.ts'), 'utf8')
  const detail = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  assert.equal(index.includes('compareCoreLeaderboardRows'), false)
  assert.equal(index.includes('Personal best'), false)
  assert.equal(index.includes('const rare ='), false)
  assert.match(detail, /open \? presentMatchChanges\(matchChangesForMatch/)
  assert(detail.includes('>What Changed{open &&'))
  assert.equal(detail.includes('What Changed?'), false)
  assert(detail.includes('No milestones reached in this match.'))
})
