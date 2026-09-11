const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { displayedRating, ratingBadgeColor, ratingTone } = require('../src/components/ui.tsx')

test('rating colour uses the same one-decimal value displayed to the user', () => {
  for (const raw of [7.16, 7.20, 7.24]) {
    assert.equal(displayedRating(raw), 7.2)
    assert.match(ratingBadgeColor(raw), /emerald/)
    assert.match(ratingTone(raw), /emerald/)
  }
  assert.equal(displayedRating(7.14), 7.1)
  assert.match(ratingBadgeColor(7.14), /orange/)
  assert.match(ratingTone(7.14), /orange/)
})
