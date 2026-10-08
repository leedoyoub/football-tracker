const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')

test('all whole-match SOT consumers import the canonical Opponent SOT domain', () => {
  for (const file of ['src/engine/rating.ts', 'src/engine/defensiveRanking.ts', 'src/engine/analytics.ts', 'src/engine/competition.ts', 'src/engine/teamMetrics.ts']) {
    const source = fs.readFileSync(file, 'utf8')
    assert(source.includes("from '../engine/opponentSot'") || source.includes("from './opponentSot"), file)
  }
  assert(fs.readFileSync('src/engine/stats.ts', 'utf8').includes("from './defensiveRanking'"), 'Ranking must consume the shared defensive facts')
  const records = fs.readFileSync('src/screens/RecordsScreen.tsx', 'utf8')
  assert(records.includes("from '../engine/teamMetrics'"), 'Records must consume the shared canonical team metrics')
  assert(!records.includes('opponentSot += theirs + match.events.reduce'), 'Records must not retain a local saves-plus-conceded proxy')
})
