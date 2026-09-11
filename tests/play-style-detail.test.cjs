const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const read = path => fs.readFileSync(require.resolve(`../${path}`), 'utf8')

test('Home style cards show current team crests and navigate without nested controls', () => {
  const home = read('src/screens/HomeScreen.tsx')
  assert(home.includes('trackedStyleTeams(teams, row.style)'))
  assert(home.includes('<TeamIcon team={team}'))
  assert(home.includes("onNavigate({ name: 'play-style', style: row.style })"))
  assert(home.includes('<button key={row.style}'))
})

test('play-style detail uses tracked teams, caps recent matches at ten, and Results caps at twenty', () => {
  const detail = read('src/screens/PlayStyleDetailScreen.tsx')
  const results = read('src/screens/ResultsScreen.tsx')
  assert(detail.includes('trackedStyleMatches(matches, teams, style)'))
  assert(detail.includes('recentMatches(trackedStyleMatches(matches, teams, style)).slice(0, 10)'))
  assert(detail.includes('trackedTeamResult(match, team.id).outcome'))
  assert(results.includes('matches.filter(isCompletedRecordedMatch)') && results.includes('.slice(0, 20)'))
})
