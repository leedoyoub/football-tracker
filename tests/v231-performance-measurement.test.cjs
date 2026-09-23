const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const signed = value => {
  try { return require('../src/lib/signedNumber.ts').formatSignedTwoDecimals(value) } catch { return undefined }
}

test('Best Goal Difference per Match uses signed values with exactly two decimals', () => {
  assert.equal(signed(1.5), '+1.50')
  assert.equal(signed(0), '0.00')
  assert.equal(signed(-0.5), '-0.50')
})

test('DEV performance diagnostics are connected to each requested production path', () => {
  const repository = fs.readFileSync(require.resolve('../src/lib/repository.ts'), 'utf8')
  const store = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  const detail = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  const index = fs.readFileSync(require.resolve('../src/engine/matchChangeIndex.ts'), 'utf8')
  for (const [source, label] of [[repository, 'LocalRepository.saveAppState'], [repository, 'validation'], [repository, 'JSON.stringify'], [repository, 'localStorage write/read-back'], [store, 'saveMatchDurably'], [detail, 'Match Detail base read model'], [index, 'MatchChangeIndex cold build'], [index, 'MatchChangeIndex cached lookup']]) assert(source.includes(`measureInDevelopment('${label}'`))
})
