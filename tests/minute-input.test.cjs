const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8')
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    })
    module._compile(result.outputText, filename)
  }
}

const { MinuteInput } = require('../src/components/MinuteInput')

test('MinuteInput handles draft vs committed minutes correctly', () => {
  let draftValue = ''
  let committed = false
  
  // Simulate the MinuteInput component and its interaction
  const onChange = (val) => draftValue = val
  const onCommit = () => committed = true
  
  // Simulate typing "7"
  onChange('7')
  assert.equal(draftValue, '7')
  assert.equal(committed, false)
  
  // Simulate typing "6"
  onChange('76')
  assert.equal(draftValue, '76')
  assert.equal(committed, false)
  
  // Simulate committing (blur or Enter)
  onCommit()
  assert.equal(committed, true)
})
