const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { PositionFilter } = require('../src/components/PositionFilter.tsx')
const { TeamFilter } = require('../src/components/TeamFilter.tsx')

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
  assert.match(source, /const setTeamId = \(next: string \| null\) => onStateChange\(\{ \.\.\.screenState, teamId: next \}\)/)
  assert.match(source, /<TeamFilter value=\{teamId\} teams=\{teams\} onChange=\{setTeamId\} label="Global Ranking team" \/>/)
})

test('Global Ranking keeps selected team display labels intact', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/GlobalRankingScreen.tsx'), 'utf8')
  assert.match(source, /<TeamFilter value=\{teamId\} teams=\{teams\} onChange=\{setTeamId\} label="Global Ranking team" \/>/)
  assert.equal(/<select[^>]*global-ranking-team/.test(source), false)
})

test('Global Ranking Team filter shares the compact menu contract and keeps null as all teams', () => {
  const html = renderToStaticMarkup(React.createElement(TeamFilter, {
    value: null,
    teams: [{ id: 'rma', shortName: 'RMA', name: 'Real Madrid' }],
    onChange: () => {},
    label: 'Global Ranking team',
  }))
  assert.match(html, /aria-label="Global Ranking team: All teams"/)
  assert.match(html, /aria-haspopup="menu"/)
  assert.match(html, />Team <span/)
  const teamFilterSource = fs.readFileSync(require.resolve('../src/components/TeamFilter.tsx'), 'utf8')
  assert.match(teamFilterSource, /max-h-64/)
})

test('compact Team menu restores trigger focus and supports menu-keyboard navigation', () => {
  const source = fs.readFileSync(require.resolve('../src/components/CompactFilterMenu.tsx'), 'utf8')
  assert.match(source, /trigger\.current\?\.focus\(\)/)
  assert.match(source, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]\.includes\(event\.key\)/)
  assert.match(source, /items\[next\]\.focus\(\)/)
  assert.match(source, /event\.key === 'Tab'\).*setOpen\(false\)/)
  assert.match(source, /tabIndex=\{-1\}/)
})
