const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const {
  initialOpponentSotDraft,
  updateHalftimeOpponentSot,
  updateFulltimeOpponentSot,
} = require('../src/screens/opponentSotWorkflow.ts')

test('SOT workflow auto-links cumulative FT to HT until the user changes FT', () => {
  let state = initialOpponentSotDraft(undefined, true)
  assert.deepEqual(state, { halftimeOpponentSot: '', fulltimeOpponentSot: '', fulltimeOpponentSotAutoLinked: true })
  state = updateHalftimeOpponentSot(state, '3')
  assert.deepEqual(state, { halftimeOpponentSot: '3', fulltimeOpponentSot: '3', fulltimeOpponentSotAutoLinked: true })
  state = updateHalftimeOpponentSot(state, '4')
  assert.deepEqual(state, { halftimeOpponentSot: '4', fulltimeOpponentSot: '4', fulltimeOpponentSotAutoLinked: true })
  state = updateFulltimeOpponentSot(state, '7')
  assert.deepEqual(state, { halftimeOpponentSot: '4', fulltimeOpponentSot: '7', fulltimeOpponentSotAutoLinked: false })
  assert.deepEqual(updateHalftimeOpponentSot(state, '5'), { halftimeOpponentSot: '5', fulltimeOpponentSot: '7', fulltimeOpponentSotAutoLinked: false })
})

test('SOT workflow keeps unknown distinct from explicit zero and never infers old draft auto state', () => {
  const untouched = initialOpponentSotDraft(undefined, true)
  assert.equal(untouched.halftimeOpponentSot, '')
  assert.equal(untouched.fulltimeOpponentSot, '')
  assert.deepEqual(updateHalftimeOpponentSot(untouched, '0'), { halftimeOpponentSot: '0', fulltimeOpponentSot: '0', fulltimeOpponentSotAutoLinked: true })
  assert.deepEqual(initialOpponentSotDraft({ halftimeOpponentSot: 3, fulltimeOpponentSot: 3 }, false), { halftimeOpponentSot: '3', fulltimeOpponentSot: '3', fulltimeOpponentSotAutoLinked: false })
})

test('Log Match owns the one editable SOT popup while End Match retains only Saves', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(source.includes('aria-label="Opponent SOT"'), 'Log Match should expose the single SOT action')
  assert(source.includes('1H SOT') && source.includes('Full Match SOT'), 'the popup should expose HT and cumulative FT rows')
  assert(!source.includes('2H SOT'), 'the popup must not expose a second-half SOT row')
  assert(!source.includes('aria-label="Opponent SOT HT"') && !source.includes('aria-label="Opponent SOT FT"'), 'End Match must not retain editable SOT controls')
  assert(source.includes('fulltimeOpponentSotAutoLinked'), 'draft checkpoints should retain explicit auto/manual workflow state')
  assert(source.includes('validateManualOpponentSot'), 'SOT changes and finalization must use canonical validation')
})

test('new-match finalization requires the SOT popup values without changing legacy edit behavior', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(source.includes("mode !== 'edit'"), 'new and resumed draft saves should require manual SOT')
  assert(source.includes('SOT control before finishing.'), 'missing SOT guidance should direct the user to the Log Match control')
  assert(source.includes('fulltimeOpponentSotAutoLinked: fulltimeOpponentSotAutoLinked'), 'draft persistence should include the workflow flag')
  assert(source.includes('const finalMatchData'), 'final save must be built separately from the draft checkpoint')
})

test('End Match keeps missing or invalid SOT guidance actionable inside its modal', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(source.includes('OPEN SOT'), 'End Match should offer a direct route back to the sole SOT editor after SOT validation fails')
  assert(source.includes("setFinishStage(null); setSotOpen(true)"), 'opening SOT should close End Match rather than leave modal state stacked')
})
