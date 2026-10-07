const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const root = path.resolve(__dirname, '..')
const { APP_VERSION } = require('../src/config.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { STATIC_TEAMS, currentStaticTeams } = require('../src/data/teams.ts')
const { teamCompetitionOverview } = require('../src/engine/competition.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')

const approvedTeamIds = [
  'real-madrid', 'barcelona', 'atletico-madrid', 'inter-miami',
  'manchester-united', 'manchester-city', 'liverpool', 'arsenal',
  'chelsea', 'tottenham-hotspur', 'bayern-munich', 'borussia-dortmund',
  'ac-milan', 'inter-milan', 'juventus', 'paris-saint-germain',
]

test('v2.5.0 aligns actual release metadata while preserving rating revision 12', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  assert.equal(packageJson.version, '2.5.0')
  assert.equal(lockfile.version, '2.5.0')
  assert.equal(lockfile.packages[''].version, '2.5.0')
  assert.equal(APP_VERSION, '2.5.0')
  assert.equal(RATING_ENGINE_REVISION, 12)
})

test('the current catalog has the exact approved order without mutating saved records or match references', () => {
  assert.deepEqual(STATIC_TEAMS.map(team => team.id), approvedTeamIds)
  const savedRealMadrid = { ...STATIC_TEAMS[0], name: 'Saved Real Madrid', customFlag: true }
  const savedLiverpool = { ...STATIC_TEAMS.find(team => team.id === 'liverpool'), customFlag: 'liverpool' }
  const persisted = [savedLiverpool, savedRealMadrid]
  const historicalMatch = { homeTeamId: savedLiverpool.id, awayTeamId: savedRealMadrid.id }
  const catalog = currentStaticTeams(persisted)
  assert.strictEqual(catalog[0], savedRealMadrid)
  assert.strictEqual(catalog[6], savedLiverpool)
  assert.deepEqual(persisted.map(team => team.id), ['liverpool', 'real-madrid'])
  assert.deepEqual(historicalMatch, { homeTeamId: 'liverpool', awayTeamId: 'real-madrid' })
})

test('Teams renders the resolved catalog in a four-column grid rather than the persisted order', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/TeamsScreen.tsx'), 'utf8')
  assert.match(source, /className="grid grid-cols-4 gap-2"/)
  assert.match(source, /compactTeamCompetitionProgressMap\(catalogTeams\.map\(team => team\.id\), status\)/)
  assert.match(source, /\{catalogTeams\.map\(team => \{/)
  assert.doesNotMatch(source, /\{teams\.map\(team => \{\s*const progress = progressByTeamId/)
})

const competitionTeams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index}`, name: `Team ${index}`, shortName: `T${index}`, abbreviation: `T${index}`, visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white' }))
const competitionMatch = (id, type, homeTeamId, awayTeamId, homeGoals, awayGoals, extra = {}) => ({
  id, season: 'S', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId, awayTeamId, teamId: homeTeamId,
  competitionType: type, competitionStage: type === 'champions' ? 'roundOf16' : 'stage1',
  ...(type === 'champions' ? { competitionPairingId: 'roundOf16:0', competitionSeriesGame: 1 } : {}),
  appearances: [], events: [...Array.from({ length: homeGoals }, (_, index) => ({ id: `${id}-h${index}`, type: 'goal', minute: index + 1, teamId: homeTeamId })), ...Array.from({ length: awayGoals }, (_, index) => ({ id: `${id}-a${index}`, type: 'goal', minute: index + 1, teamId: awayTeamId }))], ...extra,
})

test('teamCompetitionOverview owns canonical Cup and Champions W-D-L alongside GF-GA', () => {
  const cup = teamCompetitionOverview('T0', competitionTeams, [competitionMatch('cw', 'cup', 'T0', 'T1', 2, 0), competitionMatch('cd', 'cup', 'T0', 'T2', 1, 1), competitionMatch('cl', 'cup', 'T3', 'T0', 3, 1)], 'S', [])
  assert.deepEqual([cup.cup.wins, cup.cup.draws, cup.cup.losses, cup.cup.goalsFor, cup.cup.goalsAgainst], [1, 1, 1, 4, 4])
  const draw = { id: 'champions:S', kind: 'champions-draw', season: 'S', teamIds: competitionTeams.map(team => team.id) }
  const champions = teamCompetitionOverview('T0', competitionTeams, [competitionMatch('ch', 'champions', 'T0', 'T1', 2, 1)], 'S', [], [draw])
  assert.deepEqual([champions.champions.wins, champions.champions.draws, champions.champions.losses, champions.champions.goalsFor, champions.champions.goalsAgainst], [1, 0, 0, 2, 1])
  assert.equal(champions.champions.status, 'Round of 16 (2/3)')
})

test('Team Detail presents canonical competition fields in a 2 plus 1 plus 1 layout without Game copy', () => {
  const engine = fs.readFileSync(path.join(root, 'src/engine/competition.ts'), 'utf8')
  const screen = fs.readFileSync(path.join(root, 'src/screens/TeamDetailScreen.tsx'), 'utf8')
  assert.match(engine, /champions: \{ status: string; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number \}/)
  assert.match(engine, /cup: \{ status: string; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number \}/)
  assert.match(engine, /quarterFinal: 'Quarter Final', semiFinal: 'Semi Final'/)
  assert.match(screen, /overview\.champions\.wins.*overview\.champions\.draws.*overview\.champions\.losses/)
  assert.match(screen, /overview\.cup\.wins.*overview\.cup\.draws.*overview\.cup\.losses/)
  assert.match(screen, /col-span-2[\s\S]*W-D-L[\s\S]*GF-GA/)
  assert.doesNotMatch(engine, /\$\{championsRoundLabel\(stage\)\} · Game/)
})

test('Player Detail Overview presents canonical Apps with starts/subs, Minutes, and MOM while unused bench remains outside Apps', () => {
  const player = { id: 'P1', name: 'Player', displayName: 'Player', number: 8, teamId: 'T1', position: 'CM', rating: 6.5 }
  const base = { season: 'S', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'T1', awayTeamId: 'T2', teamId: 'T1', competitionType: 'league', competitionStage: 'regular', events: [] }
  const started = { ...base, id: 'played', appearances: [{ playerId: 'P1', teamId: 'T1', role: 'starter', position: 'CM', matchPosition: 'CM' }] }
  const unused = { ...base, id: 'unused', matchDay: 2, appearances: [{ playerId: 'P1', teamId: 'T1', role: 'bench', position: 'CM', matchPosition: 'CM' }] }
  const data = derivePlayerScope(player, [player], [started, unused], { season: 'S', competition: 'league' })
  assert.equal(data.apps, 1)
  const source = fs.readFileSync(path.join(root, 'src/screens/PlayerDetailScreen.tsx'), 'utf8')
  assert.match(source, /RankedMetric label="Avg Rating"[\s\S]*RankedMetric label="Goals"[\s\S]*RankedMetric label="Assists"/)
  assert.match(source, /<AppsMetric apps=\{data\.apps\} starts=\{data\.starts\} subs=\{data\.subs\} \/>\{metric\('Minutes', data\.minutes\)\}\{metric\('MOM', data\.mom\)\}/)
})

test('Home limits only final selected-metric rows to ten after the filtered ranking index', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/HomeScreen.tsx'), 'utf8')
  assert.match(source, /buildGlobalRankingData\(players, seasonMatches, \{ seasons: \[season\], teams: \[\], positions: positionFilterFamilies\(screenState\.positionFilter\) \}, 'rating'\)/)
  assert.match(source, /rankGlobalRankingRows\(rankingIndex, players, metric\)\.slice\(0, 10\)/)
  assert.match(source, /leaderRows\.slice\(0, 10\)/)
  assert.match(source, /competitionType: 'all', rankingMetric: metric/)
})
