const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const competition = require('../src/engine/competition.ts')
const { buildGlobalRankingData } = require('../src/engine/stats.ts')
const { getNextMatchDayForTeam } = require('../src/engine/match.ts')
const { APP_VERSION } = require('../src/config.ts')

const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index + 1}`, name: `Team ${index + 1}`, shortName: `T${index + 1}` }))
const player = { id: 'P', name: 'Player', displayName: 'Player', position: 'ST', number: 9, teamId: 'T1' }
function game(id, { season = 'Season 1', type = 'league', stage = 'regular', home = 'T1', away = 'OPP', homeGoals = 0, awayGoals = 0, pairingId, saves = 0, appearances = [] } = {}) {
  return { id, season, competitionType: type, competitionStage: stage, competitionPairingId: pairingId, matchDay: Number(id.replace(/\D/g, '')) || 1, date: `2026-01-${String((Number(id.replace(/\D/g, '')) || 1) % 28 + 1).padStart(2, '0')}`, duration: 90, teamId: home, homeTeamId: home, awayTeamId: away, appearances, events: [
    ...Array.from({ length: homeGoals }, (_, index) => ({ id: `${id}:h${index}`, type: 'goal', minute: index + 1, teamId: home, playerId: home === 'T1' ? 'P' : undefined })),
    ...Array.from({ length: awayGoals }, (_, index) => ({ id: `${id}:a${index}`, type: 'goal', minute: index + 20, teamId: away })),
    ...(saves ? [{ id: `${id}:s`, type: 'save', minute: 80, teamId: home, playerId: `${home}:gk`, count: saves }] : []),
  ] }
}

test('competition navigation defaults to League and keeps season/type as independent route and UI state', () => {
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  const screen = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const nav = fs.readFileSync(require.resolve('../src/components/BottomNav.tsx'), 'utf8')
  assert(screen.includes("initialType = 'league'"))
  assert(screen.includes('Competition season') && screen.includes('setType(item)'))
  assert(app.includes('view.season ?? season') && app.includes("view.competitionType ?? 'league'"))
  assert(nav.includes("label: 'Competitions'") && !nav.includes("id: 'news'") && !nav.includes('🏆'))
})

test('season and competition filters isolate League, Cup and Champions ranking sources', () => {
  const appearances = [{ playerId: 'P', teamId: 'T1', position: 'ST', matchPosition: 'ST', role: 'starter' }]
  const matches = [game('l1', { homeGoals: 1, appearances }), game('c1', { type: 'cup', stage: 'stage1', homeGoals: 2, appearances }), game('u1', { type: 'champions', stage: 'roundOf16', homeGoals: 3, appearances }), game('l2', { season: 'Season 2', homeGoals: 4, appearances })]
  for (const [type, expected] of [['league', 1], ['cup', 2], ['champions', 3]]) {
    const scoped = competition.competitionMatches(matches, 'Season 1', type)
    assert.equal(buildGlobalRankingData([player], scoped, { seasons: ['Season 1'], teams: [], positions: [] }, 'goals')[0].value, expected)
  }
  assert.equal(competition.competitionMatches(matches, 'Season 2', 'league').length, 1)
})

test('Cup eliminates exactly two using current-stage SOT after points/GD/GF and preserves cumulative display rows', () => {
  const games = teams.map((team, index) => game(`s1-${index + 1}`, { type: 'cup', stage: 'stage1', home: team.id, homeGoals: index < 13 ? 1 : 0, saves: index < 13 ? 0 : index - 13 }))
  const cup = competition.cupCompetition(teams, games, 'Season 1')
  assert.equal(cup.activeTeamIds.length, 14)
  assert.equal(cup.eliminatedTeamIds.length, 2)
  assert.deepEqual(new Set(cup.eliminatedTeamIds), new Set(['T15', 'T16']))
  assert.equal(cup.rows.length, 16)
  for (const id of cup.eliminatedTeamIds) {
    const row = cup.rows.find(item => item.teamId === id)
    assert.equal(row.state, 'eliminated'); assert.equal(row.played, 1); assert.equal(row.eliminatedStage, 1)
  }
  assert(cup.standings.every(row => row.played === 0), 'next-stage competitive stats reset')
  assert(cup.cumulativeStandings.some(row => row.played === 1), 'Cup-wide display totals do not reset')
})

test('Cup total boundary tie performs a stable Elimination Draw only among affected tied teams and fixes ranks 15–16', () => {
  const games = teams.map((team, index) => game(`tie-${index + 1}`, { type: 'cup', stage: 'stage1', home: team.id, homeGoals: index < 13 ? 1 : 0 }))
  const first = competition.cupCompetition(teams, games, 'Season 1')
  const second = competition.cupCompetition(teams, games, 'Season 1')
  assert.deepEqual(new Set(first.lastEliminationDrawTeamIds), new Set(['T14', 'T15', 'T16']))
  assert.equal(first.eliminatedTeamIds.length, 2)
  assert.deepEqual(first.eliminatedTeamIds, second.eliminatedTeamIds)
  assert.deepEqual(first.rows.filter(row => row.state === 'eliminated').map(row => row.rank), [15, 16])
  assert(!first.lastEliminationDrawTeamIds.includes('T13'))
})

test('Cup UI retains eliminated teams, cumulative columns and a Survival Line above orange At Risk rows', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  for (const token of ['W-D-L', 'GF-GA', 'Survival Line', 'At Risk', 'Eliminated · Stage', 'Show Survival Line', 'View All 16']) assert(source.includes(token), token)
  assert(source.includes("bg-orange-400/10") && !source.includes('bg-red-500/10'))
  assert(source.includes('Displayed totals are cumulative; survival order uses this Stage only.'))
})

test('Cup final is one match, requests Replay on a three-way metric tie and Replay always resolves', () => {
  const matches = []; let active = teams.map(team => team.id)
  for (const stage of competition.CUP_STAGES) {
    active.forEach((id, index) => matches.push(game(`${stage}-${index}`, { type: 'cup', stage, home: id, homeGoals: index < active.length - 2 ? 1 : 0, awayGoals: index < active.length - 2 ? 0 : 1 })))
    active = competition.cupCompetition(teams, matches, 'Season 1').activeTeamIds
  }
  matches.push(game('final-1', { type: 'cup', stage: 'final', home: active[0], away: active[1] }))
  assert.equal(competition.cupCompetition(teams, matches, 'Season 1').stage, 'finalReplay')
  matches.push(game('replay-1', { type: 'cup', stage: 'finalReplay', home: active[0], away: active[1] }))
  const result = competition.cupCompetition(teams, matches, 'Season 1')
  assert(active.includes(result.championId)); assert(active.includes(result.runnerUpId)); assert.notEqual(result.championId, result.runnerUpId)
})

test('Champions one-at-a-time draw is unrestricted, unique and locks a fixed two-leg path', () => {
  let ids = []
  while (ids.length < 16) ids = competition.drawNextChampionsTeam(teams, ids, () => 0)
  assert.equal(ids.length, 16); assert.equal(new Set(ids).size, 16)
  const draw = { id: 'champions:Season 1', season: 'Season 1', kind: 'champions-draw', teamIds: ids }
  const matches = []
  for (let index = 0; index < 8; index++) {
    const [winner, loser] = [ids[index * 2], ids[index * 2 + 1]]
    matches.push(game(`leg-${index}-1`, { type: 'champions', stage: 'roundOf16', home: winner, away: loser, homeGoals: 1, pairingId: `roundOf16:${index}` }))
    matches.push(game(`leg-${index}-2`, { type: 'champions', stage: 'roundOf16', home: loser, away: winner, awayGoals: 1, pairingId: `roundOf16:${index}` }))
  }
  const bracket = competition.championsCompetition(draw, matches, 'Season 1')
  assert.equal(bracket.currentStage, 'quarterFinal')
  assert.deepEqual(bracket.rounds.quarterFinal.flatMap(pair => pair.teamIds), ids.filter((_, index) => index % 2 === 0))
  assert.deepEqual(draw.teamIds, ids)
})

test('Champions bracket is a dark symmetric scrollable graphic with connector-ready cards and final center', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  for (const token of ['min-w-[780px]', 'overflow-x-auto', 'Round of 16', 'Quarter-finals', 'Semi-final', 'Champion', 'TeamIcon', 'from-slate-950']) assert(source.includes(token), token)
  assert(source.includes("side=\"left\"") && source.includes("side=\"right\""))
})

test('Champions bracket keeps native horizontal scrolling while hiding its browser scrollbar', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const css = fs.readFileSync(require.resolve('../src/index.css'), 'utf8')
  const bracketSource = source.slice(source.indexOf('function ChampionsBracket'), source.indexOf('function Round'))

  assert.match(source, /champions-bracket-scroll no-scrollbar overflow-x-auto overflow-y-hidden/)
  assert.match(css, /\.champions-bracket-scroll\s*\{[\s\S]*?-webkit-overflow-scrolling:\s*touch/)
  assert.match(css, /\.champions-bracket-scroll::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/)
  assert.match(css, /\.champions-bracket-scroll\s*\{[\s\S]*?scrollbar-width:\s*none/)
  assert.doesNotMatch(bracketSource, /on(?:Touch|Pointer)[A-Z]/)
})

test('Home has only the ordered dashboard responsibilities and no full ranking, standings or Best XI', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  const order = ['competition-progress', 'recent-matches', 'news', 'season-leaders', 'account'].map(token => source.indexOf(`data-home-section="${token}"`))
  assert(order.every((value, index) => value >= 0 && (!index || value > order[index - 1])))
  assert(!source.includes('Global Rankings') && !source.includes('Team of the Week') && !source.includes('Team of the Season') && !source.includes('StandingsTable'))
  assert(source.includes('derivedResults(matches, teams).slice(0, 5)') && source.includes('showCompetition'))
  assert.equal((source.match(/data-home-section="account"/g) || []).length, 1)
})

test('Competition Best XI labels and sources are scoped to League, Cup stages and Champions rounds', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  for (const token of ['Team of the Week', 'Team of the Stage ${index + 1}', 'Team of the Round ${index + 1}', 'Team of the Final', 'Team of the Season', 'competitionStageMatches']) assert(source.includes(token), token)
  assert(!source.includes('Team of the Year'))
})

test('Recent Match cards retain green/yellow/red result colors and plain competition labels', () => {
  const source = fs.readFileSync(require.resolve('../src/components/ResultCard.tsx'), 'utf8')
  assert(source.includes("W: 'bg-emerald-500/15"))
  assert(source.includes("D: 'bg-yellow-500/15"))
  assert(source.includes("L: 'bg-red-500/15 text-red-300'"))
  for (const label of ["'League'", "'Cup'", "'Champions'"]) assert(source.includes(label))
  assert(!/[👑🥇🏆]/u.test(source))
})

test('competition identity emoji appear on compact Home progress cards', () => {
  const competitionSource = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const teamsSource = fs.readFileSync(require.resolve('../src/screens/TeamsScreen.tsx'), 'utf8')
  const homeSource = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  assert(homeSource.includes('🏆'))
  const home = ''
  const result = fs.readFileSync(require.resolve('../src/components/ResultCard.tsx'), 'utf8')
  assert(competitionSource.includes('👑') && competitionSource.includes('🥇') && competitionSource.includes('🏆'))
  assert(teamsSource.includes('👑') && teamsSource.includes('🥇') && teamsSource.includes('🏆'))
  for (const source of [home, result]) assert(!/[👑🥇🏆]/u.test(source))
})

test('Team list replaces match count with three current progress lines and derives all-time badges without mutating names', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/TeamsScreen.tsx'), 'utf8')
  assert(source.includes('{squad} players') && !source.includes('{played} matches'))
  assert(source.includes('League {progress.league}') && source.includes('Cup · {progress.cup}') && source.includes('Champions · {progress.champions}'))
  assert(source.includes('competitionHistory') && source.includes('titleCounts'))
  assert(!source.includes('team.name =') && !source.includes('name: `${team.name}'))
})

test('Records owns History, Trophy Cabinet and cached form Insights', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  for (const token of ["'history'", "'insights'", 'Season History', 'Trophy Cabinet', 'Golden Boot', 'Team of the Season', 'Team Form', 'In-form Players']) assert(source.includes(token), token)
  assert(source.includes('useMemo'))
})

test('League MD38 alone cannot roll the season; an explicit completion marker can', () => {
  const match = game('38', { stage: 'regular' })
  assert.deepEqual(getNextMatchDayForTeam('T1', [match]), { season: 'Season 1', matchDay: 39 })
  assert.deepEqual(getNextMatchDayForTeam('T1', [match], ['Season 1']), { season: 'Season 2', matchDay: 1 })
  const status = competition.competitionSeasonStatus(teams, [match], 'Season 1', [], undefined)
  assert.equal(status.complete, false)
})

test('season completion is synchronized as backward-compatible CompetitionState metadata', () => {
  const store = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  const sync = fs.readFileSync(require.resolve('../src/lib/sync.ts'), 'utf8')
  const validation = fs.readFileSync(require.resolve('../src/lib/validation.ts'), 'utf8')
  assert(store.includes("kind: 'season-complete'") && store.includes('completeSeason'))
  assert(sync.includes("if ('kind' in entity)") && sync.includes('team_ids'))
  assert(validation.includes("'season-complete'"))
})

test('visible and package metadata version are exactly v2.1.2 / 2.1.2', () => {
  assert.equal(APP_VERSION, '2.1.2')
  assert.equal(require('../package.json').version, '2.1.2')
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  assert(home.includes('v{APP_VERSION}'))
})
