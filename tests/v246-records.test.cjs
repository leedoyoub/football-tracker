const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { playerPersonalRecords } = require('../src/engine/playerDerived.ts')
const player = (id, position = 'ST', teamId = 'A') => ({ id, name: id, displayName: id, teamId, position, number: 1 })
const app = (id, position = 'ST', teamId = 'A', role = 'starter') => ({ playerId: id, teamId, position, role })
const goal = (id, teamId, minute, playerId, extra = {}) => ({ id, type: 'goal', teamId, minute, playerId, ...extra })
const game = (id, date, appearances, events = [], extra = {}) => ({ id, date, season: 'Season 1', competitionType: 'league', matchDay: 1, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances, events, ...extra })
const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
const group = (groups, id) => groups.find(row => row.id === id)

test('player G+A records use canonical credited goals and assists and omit unused bench', () => {
  const p = player('P')
  const games = [game('one', '2026-01-01', [app('P')], [goal('g', 'A', 20, 'P'), goal('a', 'A', 30, 'X', { assistPlayerId: 'P' })]), game('bench', '2026-01-02', [app('P', 'ST', 'A', 'bench')], [goal('invalid', 'A', 30, 'P')])]
  const groups = buildPlayerRecordLeaderboards([p], games)
  assert.equal(group(groups, 'ga').rows[0].numeric, 2)
  assert.equal(group(groups, 'matches-ga').rows[0].numeric, 1)
  assert.deepEqual(groups.slice(0, 5).map(row => row.id), ['goals', 'assists', 'ga', 'matches-scored-in', 'matches-ga'])
})

test('new player boards respect historical team, season, competition and scoped position', () => {
  const p = player('P', 'ST', 'B')
  const midfielder = player('M', 'CAM', 'A')
  const old = game('old', '2026-01-01', [app('P', 'ST', 'A'), app('M', 'CAM', 'A')], [goal('old-goal', 'A', 20, 'P')])
  const recent = game('recent', '2026-02-01', [app('P', 'ST', 'B')], [goal('recent-goal', 'B', 20, 'P')], { season: 'Season 2', competitionType: 'cup', teamId: 'B', homeTeamId: 'B', awayTeamId: 'A' })
  const groups = buildPlayerRecordLeaderboards([p, midfielder], [old, recent], { seasons: ['Season 1'], teamIds: ['A'], competition: 'league', positionFilter: 'st-ss' })
  assert.deepEqual(group(groups, 'ga').rows.map(row => [row.playerId, row.numeric]), [['P', 1]])
  assert.deepEqual(group(groups, 'matches-ga').rows.map(row => [row.playerId, row.numeric]), [['P', 1]])
  const cup = buildPlayerRecordLeaderboards([p, midfielder], [old, recent], { seasons: ['Season 2'], teamIds: ['B'], competition: 'cup', positionFilter: 'st-ss' })
  assert.equal(group(cup, 'ga').rows[0].numeric, 1)
})

test('team records use actual scoring team, chronology, canonical SOT and requested order', () => {
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const games = [
    game('comeback', '2026-01-01', [], [goal('own', 'A', 10, 'A', { ownGoal: true }), goal('a', 'A', 20, 'A'), goal('a2', 'A', 30, 'A')], { halftimeOpponentSot: 2, fulltimeOpponentSot: 4 }),
    game('lead', '2026-01-02', [], [goal('a2', 'A', 10, 'A'), goal('b2', 'B', 20, 'B'), goal('a3', 'A', 30, 'A')]),
  ]
  const groups = recordsLeaderboardGroups({ category: 'team', players: [], teams, matches: games, scope })
  assert.deepEqual(groups.slice(0, 4).map(row => row.id), ['wins', 'win-rate', 'ppg', 'comeback-wins'])
  assert.equal(group(groups, 'opening-goals').rows.find(row => row.id === 'A').numeric, 1)
  assert.equal(group(groups, 'comeback-wins').rows.find(row => row.id === 'A').numeric, 1)
  assert.equal(group(groups, 'ppg').rows.find(row => row.id === 'A').numeric, 3)
  assert.equal(group(groups, 'opponent-sot-rate').rows.find(row => row.id === 'A').numeric, 2.5)
  assert.equal(group(groups, 'biggest-win').rows.some(row => row.id === 'B'), false)
})

test('personal records add raw rolling five average and the contribution streak', () => {
  const p = player('P')
  const games = Array.from({ length: 5 }, (_, index) => game(`g${index}`, `2026-01-0${index + 1}`, [app('P')], [goal(`goal${index}`, 'A', 20, 'P')]))
  const records = playerPersonalRecords(p, [p], games)
  assert.equal(records.contributionStreak, 5)
  assert.equal(typeof records.bestFiveAverage, 'number')
  assert.equal(playerPersonalRecords(p, [p], games.slice(0, 4)).bestFiveAverage, null)
})

test('Together uses scoped position families, actual overlap, starts and five-start PPG', () => {
  const { buildUnitRecords } = require('../src/engine/unitRecords.ts')
  const players = [player('A'), player('B', 'LW'), player('C', 'LAM'), player('D', 'CB'), player('GK', 'GK')]
  const matches = Array.from({ length: 5 }, (_, index) => game(`m${index}`, `2026-02-0${index + 1}`, [app('A'), app('B', 'LW'), app('C', 'LAM'), app('D', 'CB'), app('GK', 'GK')], [goal(`g${index}`, 'A', 25, 'A')]))
  const rows = buildUnitRecords(players, matches, [])
  const attack = rows.find(row => row.position === 'attack' && row.playerIds.join(',') === 'A,B')
  assert.equal(attack.starts, 5)
  assert.equal(attack.minutes, 450)
  assert.equal(attack.memberGoals, 5)
  assert.equal(attack.wins, 5)
  assert.equal(rows.some(row => row.playerIds.includes('GK')), false)
  assert.equal(rows.some(row => row.playerIds.includes('C') && row.position === 'attack'), false)
  assert.equal(rows.some(row => row.playerIds.includes('C') && row.position === 'midfield'), false, 'one midfielder cannot make a unit')
  assert.equal(rows.find(row => row.playerIds.join(',') === 'A,B').starts >= 5, true)
})

test('a substituted defender is charged only for the shared interval', () => {
  const { buildUnitRecords } = require('../src/engine/unitRecords.ts')
  const players = ['D1', 'D2', 'D3', 'D4'].map(id => player(id, 'CB'))
  const appearances = players.map(p => app(p.id, 'CB'))
  const match = game('split', '2026-02-01', appearances, [
    { id: 'sub', type: 'sub', minute: 60, teamId: 'A', playerOutId: 'D4', playerInId: 'X', position: 'CB' },
    goal('late', 'B', 70, 'X'),
  ], { halftimeOpponentSot: 1, fulltimeOpponentSot: 3 })
  const rows = buildUnitRecords(players, [match], [])
  const four = rows.find(row => row.position === 'defence' && row.size === 4)
  assert.deepEqual(buildUnitRecords(players, [match], [], new Set(['defence:4'])), rows.filter(row => row.position === 'defence' && row.size === 4))
  assert.equal(four.minutes, 60)
  assert.equal(four.intervalGA, 0)
  assert.equal(four.intervalSOT, 1 + 2 * 15 / 45)
})

test('own goal opener credits the actual scoring team and clean sheet streak follows dates', () => {
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const games = [
    game('latest', '2026-03-03', [], [goal('b', 'B', 20, 'B')]),
    game('first', '2026-03-01', [], [goal('own', 'B', 10, 'B', { ownGoal: true })]),
    game('second', '2026-03-02', [], [goal('a', 'A', 10, 'A')]),
  ]
  const groups = recordsLeaderboardGroups({ category: 'team', players: [], teams, matches: games, scope })
  assert.equal(group(groups, 'opening-goals').rows.find(row => row.id === 'A').numeric, 2)
  assert(Math.abs(group(groups, 'clean-rate').rows.find(row => row.id === 'A').numeric - 200 / 3) < 1e-10)
  assert.equal(group(groups, 'clean-streak').rows.find(row => row.id === 'A').numeric, 2)
  assert.equal(group(groups, 'conceded').rows.find(row => row.id === 'A').numeric, 1)
  assert.equal(group(groups, 'biggest-win').rows.find(row => row.id === 'A').numeric, 1)
  assert.deepEqual(groups.map(row => row.id).slice(-4), ['goal-difference', 'goal-difference-per-match', 'conceded', 'high-conceded'])
})

test('team lead lost and regained is not a comeback; a deficit reversed is', () => {
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const games = [
    game('not-comeback', '2026-04-01', [], [goal('a1', 'A', 10, 'A'), goal('b1', 'B', 20, 'B'), goal('a2', 'A', 30, 'A')]),
    game('comeback', '2026-04-02', [], [goal('b2', 'B', 10, 'B'), goal('a3', 'A', 20, 'A'), goal('a4', 'A', 30, 'A')]),
  ]
  const groups = recordsLeaderboardGroups({ category: 'team', players: [], teams, matches: games, scope })
  assert.equal(group(groups, 'comeback-wins').rows.find(row => row.id === 'A').numeric, 1)
})

test('Together has 2/3/4 distinct overlap, ignores position changes, and PPG waits for five starts', () => {
  const { buildUnitRecords } = require('../src/engine/unitRecords.ts')
  const players = ['A', 'B', 'C', 'D'].map(id => player(id, 'ST'))
  const appearances = players.map(p => app(p.id))
  appearances[2].positionHistory = [{ minute: 60, position: 'CAM' }]
  const matches = [game('one', '2026-05-01', appearances, [
    { id: 'out', type: 'sub', minute: 70, teamId: 'A', playerOutId: 'B', playerInId: 'X', position: 'ST' },
    { id: 'in', type: 'sub', minute: 20, teamId: 'A', playerOutId: 'Y', playerInId: 'D', position: 'ST' },
  ], { appearances: [...appearances.slice(0, 3), app('D', 'ST', 'A', 'bench'), app('Y')] })]
  const rows = buildUnitRecords(players, matches, [])
  const find = ids => rows.find(row => row.position === 'attack' && row.playerIds.join(',') === ids)
  assert.equal(find('A,B').minutes, 70)
  assert.equal(find('A,B,C').minutes, 70)
  assert.equal(find('A,B,C,D').minutes, 50)
  assert.equal(find('A,B,C,D').starts, 0)
  const teams = [{ id: 'A', name: 'A' }]
  const groups = recordsLeaderboardGroups({ category: 'combination', players, teams, matches, scope })
  assert.equal(group(groups, 'together:attack:2:ppg').rows.length, 0)
})

test('Best Attack uses member goals, Best Midfield uses team GD, and eligibility is five starts', () => {
  const players = [player('A'), player('B', 'LW'), player('C', 'SS'), player('M1', 'CAM'), player('M2', 'LAM'), player('M3', 'CM'), player('M4', 'CDM')]
  const appearances = players.map(p => app(p.id, p.position))
  const matches = Array.from({ length: 5 }, (_, index) => game(`best${index}`, `2026-06-0${index + 1}`, appearances, [
    goal(`member${index}`, 'A', 10, 'A'), goal(`other${index}`, 'A', 20, 'X'), goal(`own${index}`, 'B', 30, 'B', { ownGoal: true }),
  ]))
  const groups = recordsLeaderboardGroups({ category: 'combination', players, teams: [{ id: 'A', name: 'A' }], matches, scope })
  assert.equal(group(groups, 'best-unit:attack:2:goals').rows.find(row => row.playerIds.join(',') === 'A,B').numeric, 1)
  assert.equal(group(groups, 'best-unit:attack:3:goals').rows.find(row => row.playerIds.join(',') === 'A,B,C').numeric, 1)
  assert.equal(group(groups, 'best-unit:midfield:4:gd').rows[0].numeric, 3)
  assert.equal(group(groups, 'best-unit:attack:2:goals').rows[0].detail.includes('5 starts'), true)
  assert.equal(group(recordsLeaderboardGroups({ category: 'combination', players, teams: [{ id: 'A', name: 'A' }], matches: matches.slice(0, 4), scope }), 'best-unit:attack:2:goals').rows.length, 0)
})

test('scoped combination families and team history use the recorded appearance team', () => {
  const players = [player('P', 'LAM', 'B'), player('Q', 'CAM', 'A'), player('R', 'CB', 'A')]
  const games = [game('old', '2026-07-01', [app('P', 'LAM', 'A'), app('Q', 'CAM', 'A')]), game('new', '2026-07-02', [app('P', 'LAM', 'B'), app('Q', 'CAM', 'B')], [], { homeTeamId: 'B', awayTeamId: 'A', teamId: 'B', season: 'Season 2', competitionType: 'cup' })]
  const old = recordsLeaderboardGroups({ category: 'combination', players, teams: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], matches: games, scope: { ...scope, seasons: ['Season 1'], teamIds: ['A'], competition: 'league' } })
  assert.equal(group(old, 'together:midfield:2:starts').rows[0].numeric, 1)
  assert.equal(group(old, 'together:midfield:2:starts').rows[0].detail.startsWith('A'), true)
  assert.equal(group(old, 'together:attack:2:starts').rows.length, 0)
})

test('all team record definitions follow the requested results, attack, defence and balance order', () => {
  const groups = recordsLeaderboardGroups({ category: 'team', players: [], teams: [{ id: 'A', name: 'A' }], matches: [], scope })
  assert.deepEqual(groups.map(row => row.id), [
    'wins', 'win-rate', 'ppg', 'comeback-wins', 'win-streak', 'unbeaten-streak',
    'team-goals', 'gf-rate', 'opening-goals', 'scoring-streak', 'high-score', 'biggest-win',
    'clean', 'clean-rate', 'clean-streak', 'ga-rate', 'opponent-sot-rate', 'saves',
    'goal-difference', 'goal-difference-per-match', 'conceded', 'high-conceded',
  ])
})

test('Combination families retain legacy goal boards and expose every deterministic selector definition', () => {
  const groups = recordsLeaderboardGroups({ category: 'combination', players: [], teams: [], matches: [], scope })
  assert.deepEqual(groups.slice(0, 5).map(row => row.id), ['goal-combinations', 'mutual-goal-combinations', 'both-scored', 'both-ga', 'duo-ga'])
  const together = groups.filter(row => row.id.startsWith('together:'))
  assert.equal(together.length, 27)
  for (const position of ['attack', 'midfield', 'defence']) for (const size of [2, 3, 4]) for (const metric of ['starts', 'minutes', 'ppg']) assert(together.some(row => row.id === `together:${position}:${size}:${metric}`))
  assert.deepEqual(groups.filter(row => row.id.startsWith('best-unit:')).map(row => row.id), [
    'best-unit:attack:2:goals', 'best-unit:attack:3:goals',
    'best-unit:midfield:2:gd', 'best-unit:midfield:3:gd', 'best-unit:midfield:4:gd',
    'best-unit:defence:3:ga', 'best-unit:defence:3:sot', 'best-unit:defence:4:ga', 'best-unit:defence:4:sot',
  ])
  assert.deepEqual(groups.slice(-2).map(row => row.id), ['cb-suppression', 'cb-ga'])
})

test('Best Back Three and Four use shared GA and canonical SOT, with CB GA eligibility', () => {
  const defenders = ['D1', 'D2', 'D3', 'D4'].map(id => player(id, 'CB'))
  const appearances = defenders.map(p => app(p.id, 'CB'))
  const matches = Array.from({ length: 5 }, (_, index) => game(`def${index}`, `2026-08-0${index + 1}`, appearances, [goal(`late${index}`, 'B', 80, 'X')], { halftimeOpponentSot: 1, fulltimeOpponentSot: 3 }))
  const groups = recordsLeaderboardGroups({ category: 'combination', players: defenders, teams: [{ id: 'A', name: 'A' }], matches, scope })
  assert.equal(group(groups, 'best-unit:defence:3:ga').rows[0].numeric, 1)
  assert.equal(group(groups, 'best-unit:defence:4:ga').rows[0].numeric, 1)
  assert.equal(group(groups, 'best-unit:defence:4:sot').rows[0].numeric, 3)
  assert.equal(group(groups, 'cb-ga').rows[0].numeric, 1)
  assert.equal(group(groups, 'cb-ga').rows[0].combinationPair.connector, '&')
  assert.equal(group(recordsLeaderboardGroups({ category: 'combination', players: defenders, teams: [{ id: 'A', name: 'A' }], matches: matches.slice(0, 1), scope }), 'cb-ga').rows.length, 0)
})

test('CB GA/90 stops its CB interval when a centre back moves to fullback', () => {
  const { buildUnitRecords } = require('../src/engine/unitRecords.ts')
  const players = [player('D1', 'CB'), player('D2', 'CB')]
  const left = app('D1', 'CB'); left.positionHistory = [{ minute: 60, position: 'LB' }]
  const match = game('move', '2026-08-07', [left, app('D2', 'CB')], [goal('late', 'B', 70, 'X')], { halftimeOpponentSot: 1, fulltimeOpponentSot: 2 })
  const cb = buildUnitRecords(players, [match], []).find(row => row.position === 'cb')
  assert.equal(cb.minutes, 60)
  assert.equal(cb.intervalGA, 0)
})

test('PPG uses shared starts, not all shared minutes, and includes a zero-point five-start unit', () => {
  const players = [player('A'), player('B')]
  const matches = Array.from({ length: 5 }, (_, index) => game(`loss${index}`, `2026-09-0${index + 1}`, [app('A'), app('B')], [goal(`against${index}`, 'B', 40, 'X')]))
  const groups = recordsLeaderboardGroups({ category: 'combination', players, teams: [{ id: 'A', name: 'A' }], matches, scope })
  assert.equal(group(groups, 'together:attack:2:ppg').rows[0].numeric, 0)
  assert.equal(group(groups, 'together:attack:2:starts').rows[0].numeric, 5)
})

test('personal rolling five uses raw ratings in chronological appearances and skips unused bench', () => {
  const { ratePlayerMatch } = require('../src/engine/rating.ts')
  const p = player('P')
  const games = Array.from({ length: 7 }, (_, index) => game(`roll${index}`, `2026-10-0${index + 1}`, [app('P', 'ST', 'A', index === 2 ? 'bench' : 'starter')], index % 2 ? [goal(`g${index}`, 'A', 30, 'P')] : []))
  const appearances = games.filter((_, index) => index !== 2)
  const raw = appearances.map(match => ratePlayerMatch(match, p).raw)
  const expected = Math.max(raw.slice(0, 5).reduce((a, b) => a + b) / 5, raw.slice(1, 6).reduce((a, b) => a + b) / 5)
  assert.equal(playerPersonalRecords(p, [p], games.slice().reverse()).bestFiveAverage, expected)
})

test('v2.5.3 version, rating revision 13 and Champions entity navigation', () => {
  const source = file => fs.readFileSync(require.resolve(`../${file}`), 'utf8')
  assert.equal(require('../src/config.ts').APP_VERSION, '2.5.3')
  assert.equal(require('../src/engine/ratingRevision.ts').RATING_ENGINE_REVISION, 13)
  assert.equal(require('../package.json').version, '2.5.3')
  assert.equal(require('../package-lock.json').version, '2.5.3')
  const champions = source('src/screens/CompetitionScreen.tsx')
  assert.match(champions, /<ChampionsBracket[^>]*onNavigate=\{onNavigate\}/)
  assert.match(champions, /TeamIdentityAction team=\{teams\[id\]\}/)
  assert.match(champions, /onNavigate=\{teamId => onNavigate\(\{ name: 'team', id: teamId \}\)\}/)
  const { createNavigationEntry, navigateBrowseEntry, backFromTeamDetailEntries } = require('../src/lib/navigation.ts')
  const competitionState = { ...require('../src/lib/navigation.ts').defaultScreenState({ name: 'competition' }), competitionType: 'champions', tab: 'bracket', championsAwardRound: 'quarterFinal' }
  const sourceEntry = createNavigationEntry({ name: 'competition', competitionType: 'champions' }, competitionState, 241)
  const opened = navigateBrowseEntry([sourceEntry], { name: 'team', id: 'A' }, 241)
  assert.deepEqual(backFromTeamDetailEntries(opened), [sourceEntry])
})
