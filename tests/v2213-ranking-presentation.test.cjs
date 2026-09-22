const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')

test('v2.2.13 puts 7.2+ Matches immediately after MOM and uses requested visible ranking names', () => {
  const metrics = require('../src/lib/rankingMetrics.ts').RANKING_METRICS
  assert.deepEqual(metrics.slice(4, 7).map(item => item.value), ['minutes', 'mom', 'goodMatches'])
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  const competition = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const global = fs.readFileSync(require.resolve('../src/screens/GlobalRankingScreen.tsx'), 'utf8')
  assert(home.includes('title="Global Ranking"'))
  assert(competition.includes('`${LABELS[type]} Ranking`'))
  assert(global.includes("teamId ? 'Team Ranking'"))
})
