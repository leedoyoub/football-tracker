const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { appContentOverflowClass } = require('../src/lib/routeLayout.ts')

test('the actual App scroll owner contains horizontal movement only for Log Match', () => {
  const logMatch = appContentOverflowClass({ name: 'new-match' })
  assert.match(logMatch, /overflow-x-hidden/)
  assert.match(logMatch, /overflow-y-auto/)
  assert.match(logMatch, /overscroll-x-none/)
  assert.match(logMatch, /touch-pan-y/)
  assert.equal(appContentOverflowClass({ name: 'home' }), 'overflow-y-auto')
})

test('App and the Log Match inner scroller both use the route-level containment policy', () => {
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  const match = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(app.includes('appContentOverflowClass(view)'))
  assert(match.includes('overflow-x-hidden overflow-y-auto overscroll-x-none touch-pan-y'))
})
