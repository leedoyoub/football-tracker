const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { clearSupabaseAuthCallbackHash, hasSupabaseAuthCallbackHash } = require('../src/lib/oauthCallback.ts')
const { shouldRestoreLastRoute, startupScreen } = require('../src/lib/startup.ts')

const base = { authLoading: false, authError: false, isSupabaseConfigured: true, hasUser: false, localOnly: false, routeRestored: false }

test('OAuth return remains on a loading surface until Supabase auth resolution completes', () => {
  const oauthReturn = { ...base, authLoading: true }
  assert.equal(startupScreen(oauthReturn), 'loading')
  assert.equal(shouldRestoreLastRoute(oauthReturn), false)
})

test('session resolution precedes route restore and supports signed-in, signed-out, and local-only starts', () => {
  const signedIn = { ...base, hasUser: true }
  assert.equal(shouldRestoreLastRoute(signedIn), true)
  assert.equal(startupScreen(signedIn), 'loading')
  assert.equal(startupScreen({ ...signedIn, routeRestored: true }), 'app')
  assert.equal(startupScreen(base), 'auth-entry')
  assert.equal(shouldRestoreLastRoute(base), false)
  assert.equal(shouldRestoreLastRoute({ ...base, localOnly: true }), true)
})

test('OAuth cleanup removes only a confirmed auth callback fragment and preserves GitHub Pages path', () => {
  assert.equal(hasSupabaseAuthCallbackHash('#access_token=secret&refresh_token=secret&token_type=bearer'), true)
  assert.equal(hasSupabaseAuthCallbackHash('#teams'), false)
  const calls = []
  const history = { state: { route: 'safe' }, replaceState: (...args) => calls.push(args) }
  const changed = clearSupabaseAuthCallbackHash({ hash: '#access_token=secret&expires_at=1', pathname: '/football-tracker/', search: '?from=google' }, history)
  assert.equal(changed, true)
  assert.deepEqual(calls, [[{ route: 'safe' }, '', '/football-tracker/?from=google']])
})

test('startup failures show an in-app error instead of a blank root', () => {
  assert.equal(startupScreen({ ...base, authLoading: false, authError: true }), 'error')
  assert.equal(startupScreen({ ...base, authLoading: false, authError: true, hasUser: true }), 'error')
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  const store = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  assert(app.includes('Loading your tracker…') && app.includes('Unable to start securely'))
  assert(store.includes('Loading your tracker…') && !store.includes('if (!isLoaded) return null'))
})

test('Supabase browser auth owns URL detection and no callback token values are logged', () => {
  const client = fs.readFileSync(require.resolve('../src/lib/supabase.ts'), 'utf8')
  const auth = fs.readFileSync(require.resolve('../src/lib/auth.tsx'), 'utf8')
  assert(client.includes('detectSessionInUrl: true'))
  assert(auth.includes('await client.auth.getSession()'))
  assert(!auth.includes('console.error(\'[Football Tracker auth]\', error)'))
  assert(!auth.includes('console.log('))
})

test('logout resets the in-memory route as well as the persisted route', () => {
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  assert(app.includes("setHistory([{ name: 'home' }])") && app.includes('setRouteRestored(false)'))
})
