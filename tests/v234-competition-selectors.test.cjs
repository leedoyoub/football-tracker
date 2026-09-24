const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { selectCompetitionSeasonComplete, selectCupCompetition, selectChampionsCompetition, selectLeagueCompetition } = require('../src/engine/competitionSelectors.ts')

const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index + 1}`, name: `Team ${index + 1}`, shortName: `T${index + 1}` }))
const players = []
const alternatePlayers = []
const season = 'Season 1'
const championsDraw = () => ({ id: `champions:${season}`, season, kind: 'champions-draw', teamIds: teams.map(team => team.id) })

test('Cup selector returns the same canonical model for unchanged owner and revision inputs', () => {
  const owner = {}
  const diagnostics = []
  const first = selectCupCompetition(owner, teams, [], season, 0, 0, players, value => diagnostics.push(value))
  const revisit = selectCupCompetition(owner, teams, [], season, 0, 0, players, value => diagnostics.push(value))
  assert.strictEqual(revisit, first)
  assert.deepEqual(diagnostics.map(value => value.hit), [false, true])
})

test('Cup selector invalidates for Cup revision, catalog revision, and rating-player identity', () => {
  const owner = {}
  const first = selectCupCompetition(owner, teams, [], season, 0, 0, players)
  const revisionChanged = selectCupCompetition(owner, teams, [], season, 1, 0, players)
  assert.notStrictEqual(revisionChanged, first)
  const catalogChanged = selectCupCompetition(owner, teams, [], season, 1, 1, players)
  assert.notStrictEqual(catalogChanged, revisionChanged)
  const playersChanged = selectCupCompetition(owner, teams, [], season, 1, 1, alternatePlayers)
  assert.notStrictEqual(playersChanged, catalogChanged)
})

test('Champions selector returns the same canonical model for unchanged revision, draw, and players', () => {
  const owner = {}
  const draw = championsDraw()
  const diagnostics = []
  const first = selectChampionsCompetition(owner, draw, [], season, 0, players, value => diagnostics.push(value))
  const revisit = selectChampionsCompetition(owner, draw, [], season, 0, players, value => diagnostics.push(value))
  assert.strictEqual(revisit, first)
  assert.deepEqual(diagnostics.map(value => value.hit), [false, true])
})

test('Champions selector invalidates for a Champions revision, draw replacement, and player identity', () => {
  const owner = {}
  const draw = championsDraw()
  const first = selectChampionsCompetition(owner, draw, [], season, 0, players)
  const revisionChanged = selectChampionsCompetition(owner, draw, [], season, 1, players)
  assert.notStrictEqual(revisionChanged, first)
  const replacementDraw = championsDraw()
  const drawChanged = selectChampionsCompetition(owner, replacementDraw, [], season, 1, players)
  assert.notStrictEqual(drawChanged, revisionChanged)
  const playersChanged = selectChampionsCompetition(owner, replacementDraw, [], season, 1, alternatePlayers)
  assert.notStrictEqual(playersChanged, drawChanged)
})

test('competition selectors keep hit paths free of raw-data serialization and collection scans', () => {
  const source = fs.readFileSync(require.resolve('../src/engine/competitionSelectors.ts'), 'utf8')
  assert.equal(source.includes('JSON.stringify'), false)
  assert.equal(source.includes('.filter('), false)
  assert.equal(source.includes('.sort('), false)
})

test('CompetitionScreen reads all visible competition models through revision-aware selectors', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const immediate = source.slice(source.indexOf('export function CompetitionScreen'), source.indexOf('function DeferredCompetitionPanels'))
  assert.match(immediate, /selectCupCompetition\(competitionCacheOwner/)
  assert.match(immediate, /selectChampionsCompetition\(competitionCacheOwner/)
  assert.equal(immediate.includes('? cupCompetition('), false)
  assert.equal(immediate.includes('? championsCompetition('), false)
})

test('a deferred tournament-scope completion lookup cannot contaminate the all-team League cache', () => {
  const owner = {}
  const allTeams = [...teams, { id: 'CUSTOM', name: 'Custom', shortName: 'CUS' }]
  assert.equal(selectCompetitionSeasonComplete(owner, teams, [], season, 0, 0, 0, 0, players, undefined), false)
  const visibleLeague = selectLeagueCompetition(owner, allTeams, [], season, 0, 0, undefined, players)
  assert.equal(visibleLeague.standings.length, 17)
  assert.equal(visibleLeague.standings.some(row => row.teamId === 'CUSTOM'), true)
})
