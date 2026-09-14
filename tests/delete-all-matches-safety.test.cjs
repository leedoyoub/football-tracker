const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')

test('UI confirms 1001 and disables button until then', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/DataManagementScreen.tsx'), 'utf8')
  // Verify button disabled state until 1001
  assert(source.includes('disabled={confirmationInput !== \'1001\'}'))
  // Verify input placeholder
  assert(source.includes('placeholder="Enter 1001"'))
  // Verify confirmation code logic
  assert(source.includes('confirmationInput !== \'1001\''))
})

test('Store deleteAllMatches clears stale draft and competition state', () => {
  const source = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  const deleteAllMatch = source.match(/deleteAllMatches: \(\) => \{\s+update\(\(prev\) => \(\{ \.\.\.prev, matches: \[\], draftMatch: undefined, competitionStates: \[\] \}\),/s)
  assert(deleteAllMatch, 'deleteAllMatches should clear stale dependent state')
})
