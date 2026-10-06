const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { RecordsSeasonFilter } = require('../src/components/RecordsSeasonFilter.tsx')
const { PositionFilter } = require('../src/components/PositionFilter.tsx')

test('shared season trigger names zero, one, and multiple selections', () => {
  const render = value => renderToStaticMarkup(React.createElement(RecordsSeasonFilter, { value, seasons: ['2026/27', '2025/26'], onChange: () => {} }))
  assert.match(render([]), />Season /)
  assert.match(render(['2026/27']), />2026\/27 /)
  assert.match(render(['2026/27', '2025/26']), />2 Seasons /)
  assert.match(render(['2026/27', '2025/26']), /aria-expanded="false"/)
})

test('legacy fb navigation value presents LB/RB and both filter families', () => {
  const html = renderToStaticMarkup(React.createElement(PositionFilter, { value: 'fb', onChange: () => {} }))
  assert.match(html, /LB\/RB/)
  assert.doesNotMatch(html, />FB/)
})

test('Records and related analytical selectors use the shared compact menus', () => {
  const records = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  const season = fs.readFileSync(require.resolve('../src/components/RecordsSeasonFilter.tsx'), 'utf8')
  assert.match(records, /CompactFilterMenu value=\{String\(value\)\}/)
  assert.doesNotMatch(records, /<select/)
  assert.match(season, /CompactMultiFilterMenu/)
  assert.doesNotMatch(season, /<details/)
  for (const path of ['ComparisonScreen', 'PlayerDetailScreen', 'TeamDetailScreen', 'CompetitionScreen', 'ChemistryScreen']) assert.doesNotMatch(fs.readFileSync(require.resolve(`../src/screens/${path}.tsx`), 'utf8'), /<select aria-label="(?:Comparison (?:competition|team) filter|Player detail (?:season|competition)|Best Players season|Competition season|Chemistry team filter)"/)
})
