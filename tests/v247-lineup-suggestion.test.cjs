const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { fillFormationSlots } = require('../src/engine/lineupSuggestion.ts')

test('initial lineup respects exact tactical side within the dominant family', () => {
  const squad = [{ id: 'r', position: 'RCB' }, { id: 'l', position: 'LCB' }, { id: 'mid', position: 'CM' }]
  const families = new Map([['r', 'CB'], ['l', 'CB'], ['mid', 'CM']])
  assert.deepEqual(fillFormationSlots(squad, [{ slot: 'LCB', position: 'LCB' }, { slot: 'RCB', position: 'RCB' }], [], undefined, families), ['l', 'r'])
})

test('dominant family can override a different registration family without rewriting registration', () => {
  const squad = [{ id: 'moved', position: 'CM' }, { id: 'central', position: 'CM' }]
  const families = new Map([['moved', 'CB'], ['central', 'CM']])
  assert.deepEqual(fillFormationSlots(squad, [{ slot: 'LCB', position: 'LCB' }, { slot: 'CM', position: 'CM' }], [], undefined, families), ['moved', 'central'])
  assert.equal(squad[0].position, 'CM')
})

test('recent exact kickoff assignments remain authoritative', () => {
  const squad = [{ id: 'one', position: 'CM' }, { id: 'two', position: 'CB' }]
  assert.deepEqual(fillFormationSlots(squad, [{ slot: 'LCB', position: 'LCB' }, { slot: 'RCB', position: 'RCB' }], [], { LCB: 'two', RCB: 'one' }, new Map()), ['two', 'one'])
})
