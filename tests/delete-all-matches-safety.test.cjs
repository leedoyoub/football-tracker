const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')

test('Data management exposes no bulk-delete control', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/DataManagementScreen.tsx'), 'utf8')
  assert(!source.includes('Delete All Matches'))
  assert(!source.includes('deleteAllMatches'))
})

test('Store deleteAllMatches clears stale draft and competition state', () => {
  const source = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  const deleteAllMatch = source.match(/deleteAllMatches: \(\) => \{\s+update\(\(prev\) => \(\{ \.\.\.prev, matches: \[\], draftMatch: undefined, competitionStates: \[\] \}\),/s)
  assert(deleteAllMatch, 'deleteAllMatches should clear stale dependent state')
})
