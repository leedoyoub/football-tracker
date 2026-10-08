const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { AwardRacePanel, AwardRaceRows } = require('../src/components/AwardRacePanel.tsx')
const { awardRacePresentationRows } = require('../src/engine/awardRacePresentation.ts')

const candidates = Array.from({ length: 12 }, (_, index) => ({ playerId: `p${index}`, teamId: 'A', average: 6 + index / 100, selectionScore: 100 - index, appearances: 10, mom: 0, minutes: 900, latestRating: 7, goals: 0, assists: 0 }))
const render = (previewCount, expandable) => renderToStaticMarkup(React.createElement(AwardRacePanel, { candidates: [...candidates, { ...candidates[0], selectionScore: 1 }], title: expandable ? 'Award Race' : 'Season Award Race', previewCount, season: 'S1', type: expandable ? 'league' : 'all', players: candidates.map((row, index) => ({ id: row.playerId, name: `Candidate ${String(index).padStart(2, '0')}`, teamId: 'A', position: 'ST' })), teams: [{ id: 'A', name: 'Team A', shortName: 'A' }], onNavigate() {} }))
const visibleNames = html => [...html.matchAll(/<b\b[^>]*>(Candidate \d{2})<\/b>/g)].map(match => match[1])
const expectedNames = count => Array.from({ length: count }, (_, index) => `Candidate ${String(index).padStart(2, '0')}`)
const renderAll = () => {
  const players = candidates.map((row, index) => ({ id: row.playerId, name: `Candidate ${String(index).padStart(2, '0')}`, teamId: 'A', position: 'ST' }))
  return renderToStaticMarkup(React.createElement(AwardRaceRows, { rows: awardRacePresentationRows([...candidates, { ...candidates[0], selectionScore: 1 }], players, [], 'S1', 'league'), season: 'S1', type: 'league', players, teams: [{ id: 'A', name: 'Team A', shortName: 'A' }], onNavigate() {} }))
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

test('Home Season Award Race previews ten candidates and provides dedicated View All', () => {
  const html = render(10, false)
  assert.deepEqual(visibleNames(html), expectedNames(10))
  assert.equal(visibleNames(html).filter(name => name === 'Candidate 00').length, 1)
  assert.match(html, /Avg Rating shown/)
  assert.doesNotMatch(html, /Candidate 10<\/b>/)
  assert.doesNotMatch(html, /Award Score \d/)
  assert.doesNotMatch(html, /data-award-candidate=/)
  assert.match(html, /View All/)
  assert.doesNotMatch(html, /Show Top 5/)
})

test('full Award Race rows show every distinct player without inline expansion', () => {
  const html = renderAll()
  assert.deepEqual(visibleNames(html), expectedNames(12))
  assert.doesNotMatch(html, /Show Top 5|View All/)
  assert.doesNotMatch(html, /data-award-candidate=/)
})

test('Award Race row displays detailed position and canonical team progress beside the name', () => {
  const status = { league: { matches: [{ id: 'm', teamId: 'A' }], standings: [{ teamId: 'A', rank: 1 }] }, cup: { championId: 'A', runnerUpId: undefined, eliminatedAtByTeam: {}, activeTeamIds: [] }, champions: { championId: undefined, runnerUpId: undefined, currentStage: 'semiFinal', rounds: { roundOf16: [{ teamIds: ['A', 'B'], winnerId: 'A' }], quarterFinal: [{ teamIds: ['A', 'C'], winnerId: 'A' }], semiFinal: [{ teamIds: ['A', 'D'] }], final: [] } } }
  const players = [{ id: 'p', name: 'Player', teamId: 'A', position: 'ST' }]
  const html = renderToStaticMarkup(React.createElement(AwardRaceRows, { rows: [{ candidate: { ...candidates[0], playerId: 'p' }, rank: 2, position: 'CAM' }], season: 'S1', type: 'all', players, teams: [{ id: 'A', name: 'Team A', shortName: 'A' }], status, onNavigate() {} }))
  assert.match(html, /#2/)
  assert.match(html, /A · CAM · L1 · C SF · Cup W/)
  assert.match(html, />6\.00<\/b>/)
  assert.doesNotMatch(html, /\+0\.\d+/)
})
