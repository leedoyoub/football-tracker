const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.resolve(__dirname, '..')
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('shared identity actions require a resolved canonical entity and expose accessible buttons', () => {
  const file = path.join(root, 'src/components/EntityActions.tsx')
  assert.equal(fs.existsSync(file), true)
  const actions = source('src/components/EntityActions.tsx')
  assert.match(actions, /export function TeamIdentityAction/)
  assert.match(actions, /export function PlayerIdentityAction/)
  assert.match(actions, /if \(!team \|\| !onNavigate\)/)
  assert.match(actions, /if \(!player \|\| !onNavigate\)/)
  assert.match(actions, /onNavigate\(team\.id\)/)
  assert.match(actions, /onNavigate\(player\.id\)/)
  assert.match(actions, /aria-label=/)
})

test('shared ranking and result controls provide sibling destinations rather than nested buttons', () => {
  const ranking = source('src/components/RankingRow.tsx')
  const result = source('src/components/ResultCard.tsx')
  assert.match(ranking, /onPlayerNavigate/)
  assert.match(ranking, /onTeamNavigate/)
  assert.match(ranking, /TeamIdentityAction/)
  assert.doesNotMatch(ranking, /return onClick \? <button[\s\S]*<button/)
  assert.match(result, /onMatchNavigate/)
  assert.match(result, /onTeamNavigate/)
  assert.match(result, /TeamIdentityAction/)
  assert.doesNotMatch(result, /return <button[\s\S]*<button/)
})

test('editor and API candidate selectors remain navigation-free', () => {
  for (const file of ['src/screens/NewMatchScreen.tsx', 'src/screens/NewPlayerScreen.tsx', 'src/screens/SquadImportScreen.tsx']) {
    assert.doesNotMatch(source(file), /EntityActions/)
  }
})

test('browse surfaces pass canonical sibling navigation callbacks while editor and picker visuals remain excluded', () => {
  const home = source('src/screens/HomeScreen.tsx')
  const results = source('src/screens/ResultsScreen.tsx')
  const globalRanking = source('src/screens/GlobalRankingScreen.tsx')
  const competition = source('src/screens/CompetitionScreen.tsx')
  const playerDetail = source('src/screens/PlayerDetailScreen.tsx')
  assert.match(home, /TeamIdentityAction/)
  assert.match(home, /onTeamNavigate=\{id => onNavigate\(\{ name: 'team', id \}\)\}/)
  assert.match(results, /onMatchNavigate=\{\(\) => onNavigate\(\{ name: 'match', id: result\.match\.id \}\)\}/)
  assert.match(results, /onTeamNavigate=\{id => onNavigate\(\{ name: 'team', id \}\)\}/)
  assert.match(globalRanking, /onPlayerNavigate=\{id => onNavigate\(\{ name: 'player', id, season, competitionType: scope/)
  assert.match(globalRanking, /onTeamNavigate=\{id => onNavigate\(\{ name: 'team', id \}\)\}/)
  assert.match(competition, /onPlayerNavigate=\{id => onNavigate\(\{ name: 'player', id, season, competitionType: 'league'/)
  assert.match(competition, /onPlayerNavigate=\{id => onNavigate\(\{ name: 'player', id, season, competitionType: type/)
  assert.match(competition, /onTeamNavigate=\{id => onNavigate\(\{ name: 'team', id \}\)\}/)
  assert.match(playerDetail, /TeamIdentityAction team=\{currentTeam\} onNavigate=\{id => onNavigate\(\{ name: 'team', id \}\)\}/)
})
