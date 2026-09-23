const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { PositionFilter } = require('../src/components/PositionFilter.tsx')

const renderPositionFilter = value => renderToStaticMarkup(React.createElement(PositionFilter, {
  value,
  onChange: () => {},
  label: 'Global Ranking position',
  allLabel: 'Position',
  allAccessibilityLabel: 'All positions',
}))

test('Global Ranking renders Position for the all-position value with a descriptive accessible name', () => {
  const html = renderPositionFilter('all')
  assert.match(html, /aria-label="Global Ranking position: All positions"/)
  assert.match(html, />Position <span/)
  assert.equal(html.includes('>All <span'), false)
})

test('Global Ranking keeps a selected position label visible', () => {
  const html = renderPositionFilter('st-ss')
  assert.match(html, /aria-label="Global Ranking position: ST\/SS"/)
  assert.match(html, />ST\/SS <span/)
})

test('Global Ranking keeps empty team filtering mapped to null while showing Team', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/GlobalRankingScreen.tsx'), 'utf8')
  assert.match(source, /<option value="">Team<\/option>/)
  assert.match(source, /value=\{teamId \?\? ''\}/)
  assert.match(source, /setTeamId\(event\.target\.value \|\| null\)/)
  assert.match(source, /aria-label="Global Ranking team"/)
})

test('Global Ranking keeps selected team display labels intact', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/GlobalRankingScreen.tsx'), 'utf8')
  assert.match(source, /teams\.map\(team => <option key=\{team\.id\} value=\{team\.id\}>\{team\.shortName\}<\/option>\)/)
})
