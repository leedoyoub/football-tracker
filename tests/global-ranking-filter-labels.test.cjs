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

test('Global Ranking clears all team IDs while preserving the legacy null value', () => {
  const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
  const { defaultScreenState } = require('../src/lib/navigation.ts')
  const path = require('node:path'), teams = [{ id: 'rma', shortName: 'RMA', name: 'Real Madrid' }]
  const harness = screenHarness(path.resolve(__dirname, '..'), 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', { players: [], matches: [], teams })
  let screenState = { ...defaultScreenState({ name: 'global-ranking' }), teamId: 'rma', teamIds: ['rma'] }
  const tree = harness.render({ season: 'S1', screenState, onStateChange: next => { screenState = next }, onNavigate() {}, onBack() {} })
  const filter = nodes(tree, node => node.type?.name === 'TeamFilter')[0]
  filter.props.onChange([])
  assert.equal(screenState.teamId, null)
  assert.deepEqual(screenState.teamIds, [])
})

test('Global Ranking keeps selected team display labels intact', () => {
  const teams = [{ id: 'rma', shortName: 'RMA', name: 'Real Madrid' }, { id: 'liv', shortName: 'Liverpool', name: 'Liverpool' }]
  const render = values => renderToStaticMarkup(React.createElement(TeamFilter, { values, teams, onChange() {}, label: 'Global Ranking team' }))
  assert.match(render(['rma']), />RMA <span/)
  assert.match(render(['rma', 'liv']), />Team \(2\) <span/)
  assert.match(render([]), />Team <span/)
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
