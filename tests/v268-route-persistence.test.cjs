require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { saveLastRoute, clearLastRoute } = require('../src/lib/lastRoute.ts')
test('v268 draft input does not rewrite unchanged device route and clear restores writes', () => {
  let value = null, writes = 0
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; writes++ }, removeItem: () => { value = null } }
  const view = { name: 'new-match', teamId: 'team-a' }
  saveLastRoute(view, { id: 'draft', events: [] }, storage)
  saveLastRoute(view, { id: 'draft', events: [{ type: 'goal' }] }, storage)
  assert.equal(writes, 1)
  clearLastRoute(storage); saveLastRoute(view, undefined, storage); assert.equal(writes, 2)
  saveLastRoute({ ...view, teamId: 'team-b' }, undefined, storage); assert.equal(writes, 3)
})
test('v268 failed route write is retried and each storage target is independent', () => {
  let writes = 0
  const failing = { getItem: () => null, setItem: () => { writes++; throw Error('full') }, removeItem() {} }
  saveLastRoute({ name: 'home' }, undefined, failing); saveLastRoute({ name: 'home' }, undefined, failing)
  assert.equal(writes, 2)
  const independent = { getItem: () => null, setItem: () => { writes++ }, removeItem() {} }
  saveLastRoute({ name: 'home' }, undefined, independent); assert.equal(writes, 3)
})
