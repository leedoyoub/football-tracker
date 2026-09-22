const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')

test('team-scoped global ranking never presents movement calculated from the overall league population', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/GlobalRankingScreen.tsx'), 'utf8')
  assert.match(source, /analytics && !teamId \? rankingMovement/)
  assert.match(source, /teamId \? new Map<string, number \| null>\(\) : movement/)
})
