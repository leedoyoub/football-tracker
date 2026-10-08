const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const teams = [{ id: 'A', name: 'Alpha', shortName: 'AAA' }, { id: 'O', name: 'Opponent', shortName: 'OPP' }]
const players = [{ id: 'league', name: 'League Player', teamId: 'A', position: 'ST' }, { id: 'cup', name: 'Cup Player', teamId: 'A', position: 'ST' }]
const matches = Array.from({ length: 5 }, (_, i) => [
  { id: `league-${i}`, season: 'S1', date: `2026-01-${String(i + 1).padStart(2, '0')}`, matchDay: i + 1, competitionType: 'league', competitionStage: 'regular', teamId: 'A', homeTeamId: 'A', awayTeamId: 'O', duration: 90, appearances: [{ playerId: 'league', teamId: 'A', role: 'starter', position: 'ST' }], events: [{ id: `lg-${i}`, type: 'goal', teamId: 'A', playerId: 'league', minute: 20 }] },
  { id: `cup-${i}`, season: 'S2', date: `2026-02-${String(i + 1).padStart(2, '0')}`, matchDay: 1, competitionType: 'cup', competitionStage: 'stage1', teamId: 'A', homeTeamId: 'A', awayTeamId: 'O', duration: 90, appearances: [{ playerId: 'cup', teamId: 'A', role: 'starter', position: 'ST' }], events: [{ id: `cg-${i}`, type: 'goal', teamId: 'A', playerId: 'cup', minute: 20 }] },
]).flat()
const storePath = require.resolve('../src/store.tsx')
const previousStore = require.cache[storePath]
require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => ({ teams, players, matches, competitionStates: [] }) } }
const { TeamDetailScreen } = require('../src/screens/TeamDetailScreen.tsx')
if (previousStore) require.cache[storePath] = previousStore
else delete require.cache[storePath]

const render = screenState => renderToStaticMarkup(React.createElement(TeamDetailScreen, { teamId: 'A', season: 'S1', screenState, onStateChange() {}, onNavigate() {}, onBack() {} }))

test('one visible Team Analysis scope controls both Current Form and Best Players', () => {
  const base = defaultScreenState({ name: 'team', id: 'A' })
  const league = render({ ...base, bestPlayersSeason: 'S1', bestPlayersCompetition: 'league' })
  const cup = render({ ...base, bestPlayersSeason: 'S2', bestPlayersCompetition: 'cup' })
  assert.equal((league.match(/Team Analysis scope/g) ?? []).length, 1)
  assert.match(league, /Latest 5 recorded matches · S1/)
  assert.match(cup, /Latest 5 recorded matches · S2/)
  assert.match(league, /League Player/)
  assert.doesNotMatch(league, /Cup Player/)
  assert.match(cup, /Cup Player/)
  assert.doesNotMatch(cup, /League Player/)
})

test('Matches tab filter uses matchesCompetition independently of Team Analysis scope', () => {
  const base = defaultScreenState({ name: 'team', id: 'A' })
  const html = render({ ...base, tab: 'matches', bestPlayersSeason: 'S2', bestPlayersCompetition: 'cup', matchesCompetition: 'league' })
  assert.doesNotMatch(html, /Team Analysis scope/)
  assert.match(html, /MD5/)
  assert.equal((html.match(/min-w-0 justify-self-start/g) ?? []).length, 5)
  assert.doesNotMatch(html, /Stage 1/)
})
