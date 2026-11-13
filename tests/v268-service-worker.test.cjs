const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { test } = require('node:test')

for (const mode of ['navigate', 'cors']) test(`service worker caches ${mode === 'navigate' ? 'navigation' : 'asset'} responses after the browser consumes their bodies`, async () => {
  const handlers = new Map(), cached = new Map(), writes = [], lifetimes = []
  let releaseCache, responsePromise
  const cacheReady = new Promise(resolve => { releaseCache = resolve })
  const request = { method: 'GET', mode, url: 'https://example.test/football-tracker/assets/app.js' }
  const body = mode === 'navigate' ? '<html>saved app shell</html>' : 'window.appLoaded = true'
  const response = new Response(body)
  const cache = { async put(key, value) { cached.set(typeof key === 'string' ? key : key.url, await value.text()) } }
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    URL,
    self: { location: new URL('https://example.test/football-tracker/sw.js?v=2.6.8'), addEventListener: (type, handler) => handlers.set(type, handler) },
    fetch: async () => response,
    caches: {
      match: async () => undefined,
      open: () => ({ then(onReady) {
        const write = cacheReady.then(() => onReady(cache))
        // Observe detached cache failures as test results, including the legacy
        // worker's rejected clone, instead of leaking an unhandled rejection.
        write.catch(() => {})
        writes.push(write)
        return write
      } }),
    },
  }, { filename: 'public/sw.js' })
  handlers.get('fetch')({ request, respondWith: promise => { responsePromise = promise }, waitUntil: promise => lifetimes.push(promise) })
  assert.equal(await (await responsePromise).text(), body, 'network response remains immediately consumable')
  let lifetimeFinished = false
  const finished = Promise.all(lifetimes).then(() => { lifetimeFinished = true })
  await Promise.resolve()
  const retainedUntilCacheReady = !lifetimeFinished
  releaseCache()
  const results = await Promise.allSettled(writes)
  await finished
  assert.deepEqual(results.map(result => result.status), ['fulfilled'], 'delayed cache opening must not clone an already consumed response')
  assert.equal(retainedUntilCacheReady, true, 'fetch lifetime includes the pending cache write')
  assert.equal(cached.get(mode === 'navigate' ? '/football-tracker/index.html' : request.url), body)
})
