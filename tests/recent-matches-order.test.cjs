
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { recentMatches } = require('../src/screens/recentMatches.ts')

test('recentMatches sorts newest-first', () => {
    const m1 = { id: '1', date: '2026-01-01' }
    const m2 = { id: '2', date: '2026-01-02' }
    const matches = [m1, m2]
    const sorted = recentMatches(matches)
    assert.strictEqual(sorted[0].id, '2')
    assert.strictEqual(sorted[1].id, '1')
})
