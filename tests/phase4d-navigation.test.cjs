const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const navigation = require('../src/lib/navigation.ts')
const entry = (view, state, scrollTop = 0) => navigation.createNavigationEntry(view, state, scrollTop)

test('Team Detail Back restores the actual prior browse entry and only orphans fall back to Teams', () => {
  const ranking = entry({ name: 'global-ranking', season: 'Season 4', competitionType: 'cup', rankingMetric: 'assists' }, { ...navigation.defaultScreenState({ name: 'global-ranking' }), metric: 'assists', scope: 'cup', positionFilter: 'cam', teamId: 'A', viewAll: true }, 481)
  const fromRanking = navigation.backFromTeamDetailEntries([ranking, entry({ name: 'team', id: 'A' })])
  assert.deepEqual(fromRanking, [ranking])
  assert.deepEqual(navigation.backFromTeamDetailEntries([entry({ name: 'team', id: 'A' })]).map(item => item.view), [{ name: 'teams' }])
})

test('browse detail navigation pops to the nearest exact Team, Player, or Match without rebuilding its state', () => {
  const teamState = { ...navigation.defaultScreenState({ name: 'team', id: 'A' }), tab: 'players', bestPlayersSeason: 'Season 2', bestPlayersMetric: 'goals' }
  const start = [entry({ name: 'global-ranking' }), entry({ name: 'team', id: 'A' }, teamState, 273), entry({ name: 'player', id: 'P' })]
  const recoveredTeam = navigation.navigateBrowseEntry(start, { name: 'team', id: 'A' }, 999)
  assert.equal(recoveredTeam.length, 2)
  assert.equal(recoveredTeam[1].scrollTop, 273)
  assert.deepEqual(recoveredTeam[1].screenState, teamState)
  assert.deepEqual(navigation.popNavigationEntry(recoveredTeam).map(item => item.view), [{ name: 'global-ranking' }])
  assert.equal(navigation.navigateBrowseEntry(start, { name: 'team', id: 'B' }, 0).length, 4)
  assert.equal(navigation.navigateBrowseEntry([entry({ name: 'player', id: 'P' }), entry({ name: 'team', id: 'A' })], { name: 'player', id: 'P' }, 0).length, 1)
  assert.equal(navigation.navigateBrowseEntry([entry({ name: 'match', id: 'M' }), entry({ name: 'player', id: 'P' })], { name: 'match', id: 'M' }, 0).length, 1)
})

test('new-match and edit-match are transient workflow entries that close back to their parent', () => {
  const team = entry({ name: 'team', id: 'A' }, navigation.defaultScreenState({ name: 'team', id: 'A' }), 88)
  const logging = navigation.enterTransientWorkflow([team], { name: 'new-match', teamId: 'A' }, 410)
  assert.deepEqual(navigation.closeTransientWorkflow(logging, { name: 'match', id: 'M' }), [entry({ name: 'team', id: 'A' }, team.screenState, 410)])
  const match = entry({ name: 'match', id: 'M' })
  const editing = navigation.enterTransientWorkflow([match], { name: 'edit-match', id: 'M' }, 22)
  assert.deepEqual(navigation.closeTransientWorkflow(editing, { name: 'match', id: 'M' }), [entry({ name: 'match', id: 'M' }, match.screenState, 22)])
})

test('App routes Team Back and editor completion through root navigation helpers', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8')
  const team = fs.readFileSync('src/screens/TeamDetailScreen.tsx', 'utf8')
  assert.match(app, /navigateBrowseEntry/)
  assert.match(app, /closeTransientWorkflow/)
  assert.match(app, /backFromTeamDetailEntries/)
  assert.match(team, /onClick=\{onBack\}/)
  assert.match(team, /Back<\/button>/)
  assert.doesNotMatch(team, /Back to Teams/)
})
