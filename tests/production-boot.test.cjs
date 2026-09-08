const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')

const read = name => fs.readFileSync(require.resolve(`../${name}`), 'utf8')

test('the document has a dark bootstrap shell before the module graph runs', () => {
  const html = read('index.html')
  assert(html.includes('Loading your tracker…'))
  assert(html.includes('__footballTrackerBootError'))
  assert(html.includes('Something went wrong while starting Football Tracker.'))
  assert(html.indexOf('__footballTrackerBootError') < html.indexOf('type="module"'))
})

test('React mounts the bootstrap boundary before auth and repository providers', () => {
  const main = read('src/main.tsx')
  assert(main.includes('createRoot(root).render'))
  assert(main.includes('<StartupBoundary>'))
  assert(main.indexOf('<StartupBoundary>') < main.indexOf('<AuthProvider>'))
  assert(main.indexOf('<AuthProvider>') < main.indexOf('<StoreProvider>'))
  assert(main.includes('window.__footballTrackerBootError?.()'))
})

test('Supabase construction is lazy and implicit callback handling remains SDK-owned', () => {
  const client = read('src/lib/supabase.ts')
  const auth = read('src/lib/auth.tsx')
  assert(client.includes('export function getSupabase()'))
  assert(client.includes('detectSessionInUrl: true'))
  assert(auth.includes('const client = getSupabase()'))
  assert(auth.includes('await client.auth.getSession()'))
  assert(!auth.includes('location.href'))
})

test('hydration has loading, ready, and error states without destructive reset', () => {
  const store = read('src/store.tsx')
  const repository = read('src/lib/repository.ts')
  assert(store.includes("'loading' | 'ready' | 'error'"))
  assert(store.includes("hydration === 'error'"))
  assert(store.includes('StartupRecovery'))
  assert(!repository.includes('resetCatalogOnce'))
  assert(!repository.includes('queue.clear()'))
})

test('the service worker serves navigations network-first and only removes its own caches', () => {
  const serviceWorker = read('public/sw.js')
  assert(serviceWorker.includes("event.request.mode === 'navigate'"))
  assert(serviceWorker.includes('fetch(event.request).then'))
  assert(serviceWorker.includes('key.startsWith(CACHE_PREFIX)'))
  assert(serviceWorker.includes("const APP_SHELL = `${BASE_PATH}index.html`"))
})
