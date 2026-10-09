const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { competitionMatches } = require('../src/engine/competition.ts')

test('competition scope observes same-reference changes to season and competition fields', () => {
  const row = { id: 'M', season: 'S1', competitionType: 'league' }
  const matches = [row]
  assert.equal(competitionMatches(matches, 'S1', 'league').length, 1)
  row.competitionType = 'cup'
  assert.equal(competitionMatches(matches, 'S1', 'league').length, 0)
  row.season = 'S2'
  assert.equal(competitionMatches(matches, 'S1', 'cup').length, 0)
  assert.equal(competitionMatches(matches, 'S2', 'cup').length, 1)
})

test('mutating a returned projection cannot affect source records or later scope results', () => {
  const match = { id: 'M', season: 'S1', competitionType: 'league' }
  const matches = [match]
  const projection = competitionMatches(matches, 'S1', 'league')
  projection.splice(0, 1)
  projection.push({ id: 'FAKE', season: 'S1', competitionType: 'league' })
  assert.deepEqual(matches, [match])
  assert.deepEqual(competitionMatches(matches, 'S1', 'league'), [match])
})

test('scopes remain independent across calculation order and an in-place same-length replacement', () => {
  const matches = [{ id: 'A', season: 'S1', competitionType: 'league' }]
  assert.equal(competitionMatches(matches, 'S2', 'cup').length, 0)
  assert.equal(competitionMatches(matches, 'S1', 'league').length, 1)
  matches[0] = { id: 'B', season: 'S2', competitionType: 'cup' }
  assert.equal(competitionMatches(matches, 'S1', 'league').length, 0)
  assert.equal(competitionMatches(matches, 'S2', 'cup')[0].id, 'B')
})
