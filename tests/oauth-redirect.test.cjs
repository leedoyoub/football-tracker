const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { oauthRedirectUrl } = require('../src/lib/oauthRedirect.ts')

test('OAuth redirect preserves Vite base paths for local and GitHub Pages', () => {
  assert.equal(oauthRedirectUrl('https://leedoyoub.github.io', '/football-tracker/'), 'https://leedoyoub.github.io/football-tracker/')
  assert.equal(oauthRedirectUrl('http://127.0.0.1:5174', '/'), 'http://127.0.0.1:5174/')
  const auth = fs.readFileSync(require.resolve('../src/lib/auth.tsx'), 'utf8')
  assert(auth.includes('oauthRedirectUrl(window.location.origin, import.meta.env.BASE_URL)'))
})
