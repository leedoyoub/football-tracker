const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { AwardRacePanel } = require('../src/components/AwardRacePanel.tsx')

const candidates = Array.from({ length: 12 }, (_, index) => ({ playerId: `p${index}`, teamId: 'A', average: 6 + index / 100, selectionScore: 100 - index, appearances: 10, mom: 0, minutes: 900, latestRating: 7, goals: 0, assists: 0 }))
const render = (previewCount, expandable) => renderToStaticMarkup(React.createElement(AwardRacePanel, { candidates: [...candidates, { ...candidates[0], selectionScore: 1 }], title: expandable ? 'Award Race' : 'Season Award Race', previewCount, expandable, season: 'S1', type: expandable ? 'league' : 'all', players: candidates.map((row, index) => ({ id: row.playerId, name: `Candidate ${String(index).padStart(2, '0')}`, teamId: 'A', position: 'ST' })), teams: [{ id: 'A', name: 'Team A', shortName: 'A' }], onNavigate() {} }))
const visibleNames = html => [...html.matchAll(/<b\b[^>]*>(Candidate \d{2})<\/b>/g)].map(match => match[1])
const expectedNames = count => Array.from({ length: count }, (_, index) => `Candidate ${String(index).padStart(2, '0')}`)
const renderExpanded = () => {
  const useState = React.useState
  React.useState = () => [true, () => {}]
  try { return render(5, true) }
  finally { React.useState = useState }
}

test('competition Award Race previews five distinct official-score candidates with average as the main value', () => {
  const html = render(5, true)
  assert.deepEqual(visibleNames(html), expectedNames(5))
  assert.equal(visibleNames(html).filter(name => name === 'Candidate 00').length, 1)
  assert.match(html, /Avg Rating shown/)
  assert.match(html, />6\.00<\/b>/)
  assert.doesNotMatch(html, /Award Score \d/)
  assert.doesNotMatch(html, /data-award-candidate=/)
  assert.match(html, /View All/)
})

test('Home Season Award Race previews ten candidates from the same presentation without expansion', () => {
  const html = render(10, false)
  assert.deepEqual(visibleNames(html), expectedNames(10))
  assert.equal(visibleNames(html).filter(name => name === 'Candidate 00').length, 1)
  assert.match(html, /Avg Rating shown/)
  assert.doesNotMatch(html, /Candidate 10<\/b>/)
  assert.doesNotMatch(html, /Award Score \d/)
  assert.doesNotMatch(html, /data-award-candidate=/)
  assert.doesNotMatch(html, /View All/)
})

test('expanded competition race shows every distinct player and offers Show Top 5', () => {
  const html = renderExpanded()
  assert.deepEqual(visibleNames(html), expectedNames(12))
  assert.match(html, /Show Top 5/)
  assert.doesNotMatch(html, />View All<\/button>/)
  assert.doesNotMatch(html, /data-award-candidate=/)
})
