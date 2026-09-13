
const assert = require('node:assert/strict')
const { recentMatches } = require('../src/screens/recentMatches.ts')

test('recentMatches sorts newest-first', () => {
    const m1 = { id: '1', date: '2026-01-01' }
    const m2 = { id: '2', date: '2026-01-02' }
    const matches = [m1, m2]
    const sorted = recentMatches(matches)
    assert.strictEqual(sorted[0].id, '2')
    assert.strictEqual(sorted[1].id, '1')
})
