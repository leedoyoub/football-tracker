const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const root = path.resolve(__dirname, '..')
const { APP_VERSION } = require('../src/config.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { STORAGE_KEY } = require('../src/lib/repository.ts')

test('v2.3.4 release metadata aligns without changing rating or storage invariants', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  assert.equal(packageJson.version, '2.3.4')
  assert.equal(lockfile.packages[''].version, '2.3.4')
  assert.equal(APP_VERSION, '2.3.4')
  assert.equal(RATING_ENGINE_REVISION, 10)
  assert.equal(STORAGE_KEY, 'football-tracker-v1')
})
