require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createEdgeBackGesture, hasEdgeBack, usesNativeEdgeBack } = require('../src/lib/edgeSwipeBack.ts')
const point = (x, y = 100, id = 1) => ({ clientX: x, clientY: y, identifier: id })
function gesture() { let backs = 0; return { g: createEdgeBackGesture(() => backs++), backs: () => backs } }

test('v268 one completed edge touch calls the exact Back callback once', () => {
  const { g, backs } = gesture()
  g.start([point(24)])
  assert.equal(g.move([point(65, 105)]), true)
  assert.equal(g.end([point(110, 108)], []), true)
  assert.equal(g.end([point(110, 108)], []), false)
  assert.equal(backs(), 1)
})
test('v268 taps, short, central, vertical, diagonal and leftward touches preserve navigation', () => {
  for (const [start, moves, end] of [
    [point(10), [], point(10)], [point(10), [point(40)], point(60)],
    [point(25), [point(150)], point(180)], [point(10), [point(15, 140)], point(140, 145)],
    [point(10), [point(90, 160)], point(110, 175)], [point(10), [point(0)], point(100)],
    [point(10), [point(110), point(70)], point(110)],
  ]) {
    const { g, backs } = gesture(); g.start([start]); moves.forEach(p => g.move([p])); g.end([end], [])
    assert.equal(backs(), 0, JSON.stringify({ start, moves, end }))
  }
})
test('v268 cancellation, changed finger, multi-touch, overlays and route cleanup invalidate gestures', () => {
  for (const cancel of [g => g.cancel(), g => g.move([point(80), point(90, 100, 2)]), g => g.move([point(80, 100, 2)]), g => g.move([point(80)], true)]) {
    const { g, backs } = gesture(); g.start([point(10)]); cancel(g); g.end([point(130)], []); assert.equal(backs(), 0)
  }
  const { g, backs } = gesture()
  g.start([point(10)], true); g.end([point(130)], []); assert.equal(backs(), 0)
  g.start([point(10)]); g.end([point(130)], [], true); assert.equal(backs(), 0)
  g.start([point(10), point(12, 100, 2)]); g.end([point(130)], []); assert.equal(backs(), 0)
})
test('v268 read-only Back coverage is explicit and excludes editors/import/data management', () => {
  for (const name of ['player','match','team','global-ranking','award-race','records-leaderboard','results','latest-changes','season-recap','season-highlight','chemistry']) assert.equal(hasEdgeBack({ name }), true, name)
  for (const name of ['home','teams','players','records','competition','standings','comparison','new-match','edit-match','new-player','edit-player','import-squad','data-management']) assert.equal(hasEdgeBack({ name }), false, name)
})
test('v268 iOS browser leaves native navigation alone, standalone PWA uses custom Back', () => {
  for (const userAgent of ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18 Safari/604.1', 'Mozilla/5.0 (iPad) CriOS/130']) {
    assert.equal(usesNativeEdgeBack(userAgent, 'iPhone', 5, false), true)
    assert.equal(usesNativeEdgeBack(userAgent, 'iPhone', 5, true), false)
  }
  assert.equal(usesNativeEdgeBack('Mozilla/5.0 Macintosh Safari', 'MacIntel', 5, false), true)
  assert.equal(usesNativeEdgeBack('Mozilla/5.0 Macintosh Safari', 'MacIntel', 0, false), false)
  assert.equal(usesNativeEdgeBack('Mozilla/5.0 Android Chrome', 'Linux', 5, false), false)
})
test('v268 detail Back scrolls with content and player sticky tabs have no Back offset', () => {
  const detail = fs.readFileSync('src/components/DetailBack.tsx','utf8')
  assert(!/className="[^"]*\bsticky\b/.test(detail))
  assert(!fs.readFileSync('src/screens/PlayerDetailScreen.tsx','utf8').includes('stickyOffset="var(--detail-back-height)"'))
  assert(!fs.readFileSync('src/index.css','utf8').includes('--detail-back-height'))
})
