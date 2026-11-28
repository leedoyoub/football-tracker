const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')

test('the default order places Appearances before Minutes and keeps the 7.2+ Matches record', () => {
  const metrics = require('../src/lib/rankingMetrics.ts').RANKING_METRICS
  assert.deepEqual(metrics.slice(4, 7).map(item => item.value), ['appearances', 'minutes', 'mom'])
  const records = fs.readFileSync(require.resolve('../src/engine/playerRecords.ts'), 'utf8')
  assert.match(records, /'good', 'Most 7\.2\+ Matches'/)
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  const competition = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const global = fs.readFileSync(require.resolve('../src/screens/GlobalRankingScreen.tsx'), 'utf8')
  assert(home.includes('title="Global Ranking"'))
  assert(competition.includes("rankingTitle('league')"))
  assert(competition.includes('rankingTitle(type)'))
  assert(global.includes('rankingTitle(scope, Boolean(teamIds.length))'))
})
