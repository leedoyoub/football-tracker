const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')

test('Cup and Champions previews are compact Top 10 routes to their canonical Global Ranking scope', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const preview = source.slice(source.indexOf('function CompetitionRankings'), source.indexOf('function RaceHistoryPanel'))
  assert(preview.includes("competitionType: type"))
  assert(preview.includes('rows.slice(0, 10)'))
  for (const removed of ['RankingFilterButton', 'compareMode', 'viewAllMetric', 'rankingTeamIds', 'Show Top 10']) assert.equal(preview.includes(removed), false, `${removed} must not remain in compact previews`)
})

test('Global Ranking owns a source-level team filter', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/GlobalRankingScreen.tsx'), 'utf8')
  assert(source.includes('label="Global Ranking team"'))
  assert(source.includes('teams: teamId ? [teamId] : []'))
  assert(source.includes('onChange={setTeamId}'))
})
