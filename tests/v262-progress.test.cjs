require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { compactTeamCompetitionProgress: progress, compactTeamCompetitionProgressMap, competitionSeasonStatus, cupCompetition, CUP_STAGES, competitionAssignment } = require('../src/engine/competition.ts')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const teams = Array.from({ length: 16 }, (_, i) => ({ id: `T${i}`, name: `Team ${i}`, abbreviation: `T${i}` }))
const draw = { id: 'champions:S1', kind: 'champions-draw', season: 'S1', teamIds: teams.map(t => t.id) }
const game = (id, teamId, type, stage, number = 1, extra = {}) => ({ id, teamId, season: 'S1', competitionType: type, competitionStage: stage, ...(type === 'champions' ? { competitionPairingId: `${stage}:0`, competitionSeriesGame: number } : {}), matchDay: number, date: '2026-10-21', duration: 90, homeTeamId: teamId, awayTeamId: `opponent-${teamId}`, appearances: [], events: [], ...extra })
const status = games => competitionSeasonStatus(teams, games, 'S1', [], draw)

test('Cup completion is team-specific until official stage advancement; League is unchanged', () => {
  assert.equal(progress('T0', status([])).cup, 'NS')
  const matches = [game('first', 'T0', 'cup', 'stage1')]
  assert.equal(progress('T0', status(matches)).cup, 'S1 1/1')
  assert.equal(progress('T1', status(matches)).cup, 'S1 0/1')
  for (const t of teams.slice(1)) matches.push(game(`cup-${t.id}`, t.id, 'cup', 'stage1'))
  const derived = status(matches), survivor = derived.cup.activeTeamIds[0], eliminated = derived.cup.eliminatedTeamIds[0]
  assert.equal(progress(survivor, derived).cup, 'S2 0/1')
  assert.equal(progress(eliminated, derived).cup, 'Out S1')
  assert.deepEqual([progress('T0', status([])).league, progress('T0', { ...derived, league: { standings: [{ teamId: 'T0', played: 12 }] } }).league], ['0/30', '12/30'])
})

test('Champions counts completed own games and advances only official resolved pairings before other ties finish', () => {
  const matches = []
  assert.equal(progress('T0', status(matches)).champions, 'R16 0/3')
  for (let n = 1; n <= 3; n++) {
    matches.push(game(`a${n}`, 'T0', 'champions', 'roundOf16', n, { events: [{ id: `g${n}`, type: 'goal', minute: 10, teamId: 'T0' }] }))
    assert.equal(progress('T0', status(matches)).champions, `R16 ${n}/3`)
  }
  assert.equal(status(matches).champions.rounds.roundOf16[0].winnerId, undefined)
  for (let n = 1; n <= 3; n++) matches.push(game(`b${n}`, 'T1', 'champions', 'roundOf16', n))
  const derived = status(matches), before = JSON.stringify(derived)
  assert.equal(derived.champions.rounds.roundOf16[0].winnerId, 'T0')
  assert.equal(derived.champions.rounds.quarterFinal.length, 0)
  const all = compactTeamCompetitionProgressMap(teams.map(t => t.id), derived)
  assert.equal(all.size, 16)
  assert.equal(all.get('T0').champions, 'QF 0/3')
  assert.equal(all.get('T1').champions, 'Out R16')
  assert.equal(all.get('T2').champions, 'R16 0/3')
  assert.equal(JSON.stringify(derived), before)
  assert.equal(competitionAssignment('champions', 'S1', 'T0', teams, matches, draw, []).available, false, 'read model does not unlock actual next round')
})

test('later Champions rounds, legacy replay, integrity failures and terminal states keep official semantics', () => {
  const base = status([])
  const pair = (stage, extra = {}) => ({ id: `${stage}:0`, stage, teamIds: ['T0', 'T1'], requiredMatches: stage === 'final' ? 2 : 3, matches: [], teamGames: { T0: [], T1: [] }, tied: false, ...extra })
  const model = (stage, pairing, extra = {}) => ({ ...base, champions: { ...base.champions, currentStage: stage, rounds: { ...base.champions.rounds, [stage === 'finalReplay' ? 'final' : stage]: [pairing] }, ...extra } })
  for (const [stage, next] of [['quarterFinal', 'SF 0/3'], ['semiFinal', 'F 0/2']]) {
    assert.equal(progress('T0', model(stage, pair(stage, { winnerId: 'T0' }))).champions, next)
    assert.equal(progress('T1', model(stage, pair(stage, { winnerId: 'T0' }))).champions, `Out ${stage === 'quarterFinal' ? 'QF' : 'SF'}`)
  }
  for (let count = 0; count <= 2; count++) assert.equal(progress('T0', model('final', pair('final', { teamGames: { T0: Array(count).fill({}), T1: [] } }))).champions, `F ${count}/2`)
  const bad = model('roundOf16', pair('roundOf16', { winnerId: 'T0', integrityError: 'duplicate slot' }))
  assert.equal(progress('T0', bad).champions, 'R16 0/3')
  assert.equal(progress('T1', bad).champions, 'R16 0/3')
  const replay = model('finalReplay', pair('final', { requiredMatches: 1, teamGames: undefined, matches: [game('final', 'T0', 'champions', 'final')], tied: true }))
  assert.equal(progress('T0', replay).champions, 'FR 0/1')
  assert.equal(progress('T0', model('final', pair('final', { winnerId: 'T0' }), { championId: 'T0', runnerUpId: 'T1' })).champions, 'Champ')
  assert.equal(progress('T1', model('final', pair('final', { winnerId: 'T0' }), { championId: 'T0', runnerUpId: 'T1' })).champions, 'Out F')
  assert.equal(progress('T0', { ...base, champions: { ...base.champions, drawn: false } }).champions, 'NS')
})

test('Cup finals and replays show per-team completion until canonical winner resolves', () => {
  const matches = []
  for (const stage of CUP_STAGES) for (const teamId of cupCompetition(teams, matches, 'S1').activeTeamIds) matches.push(game(`${stage}:${teamId}`, teamId, 'cup', stage))
  const [a, b] = cupCompetition(teams, matches, 'S1').activeTeamIds
  assert.equal(progress(a, status(matches)).cup, 'F 0/1')
  matches.push(game('final:a', a, 'cup', 'final'))
  assert.equal(progress(a, status(matches)).cup, 'F 1/1')
  assert.equal(progress(b, status(matches)).cup, 'F 0/1')
  matches.push(game('final:b', b, 'cup', 'final'))
  assert.equal(progress(a, status(matches)).cup, 'FR 0/1')
  matches.push(game('replay:a', a, 'cup', 'finalReplay'))
  assert.equal(progress(a, status(matches)).cup, 'FR 1/1')
  matches.push(game('replay:b', b, 'cup', 'finalReplay'))
  const derived = status(matches)
  assert.equal(progress(derived.cup.championId, derived).cup, 'Champ')
  assert.equal(progress(derived.cup.runnerUpId, derived).cup, 'Out F')
})

test('Individual Honors names prefer full saved name while counts, disclosures and player links persist', () => {
  const ps = [{ id: 'p', name: 'Ronaldo', fullName: '  Cristiano Ronaldo dos Santos Aveiro  ', displayName: 'Ronaldo', teamId: '' }, { id: 'fallback', name: '', fullName: 'Full fallback', displayName: 'Short' }]
  const events = ps.map(p => ({ id: p.id, kind: 'monthly-player', label: 'Player of the Month', playerId: p.id, teamId: 'T0', season: 'S1', period: 2, finalized: true, category: 'individual' }))
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/TeamHistory.tsx', 'TeamHistory', {}, { '../engine/teamHistory': { ...require('../src/engine/teamHistory.ts'), teamHistoryHonors: () => ({ seasonHistory: [], championships: 0, runnerUps: 0, finals: 0, individual: require('../src/engine/teamHistory.ts').groupTeamIndividualHonors(events) }) } })
  const destinations = [], patches = []
  const state = { ...defaultScreenState({ name: 'team', id: 'T0' }), historyDisclosures: ['kind:monthly-player', 'kind:monthly-player:player:p'] }
  const tree = h.render({ teamId: 'T0', season: 'S1', teams, players: ps, matches: [], states: [], screenState: state, onNavigate: v => destinations.push(v), onStateChange: p => patches.push(p) })
  const full = nodes(tree, n => n.type === 'button' && n.props.children === 'Cristiano Ronaldo dos Santos Aveiro')[0]
  assert(full)
  assert(nodes(tree, n => n.type === 'button' && n.props.children === 'Full fallback').length)
  assert.match(full.props.className, /overflow-wrap:anywhere/)
  full.props.onClick(); assert.equal(destinations[0].id, 'p'); assert.equal(patches.length, 0)
  assert(nodes(tree, n => n.type === 'span' && n.props.children === 'Season 1-2').length)
})

test('Teams Progress retains sixteen same-sized cards and passes the shared read model to each', () => {
  const { STATIC_TEAMS } = require('../src/data/teams.ts')
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/TeamsScreen.tsx', 'TeamsScreen', { teams: STATIC_TEAMS, players: [], matches: [], competitionStates: [] })
  const props = { season: 'S1', onNavigate() {} }
  let tree = h.render(props)
  nodes(tree, n => n.type === 'button' && n.props.children === 'Progress')[0].props.onClick()
  tree = h.render(props)
  const cards = nodes(tree, n => typeof n.type === 'function' && n.type.name === 'TeamGridCard')
  assert.equal(cards.length, 16)
  assert(cards.every(card => card.props.showProgress && card.props.progress.league === '0/30'))
  const card = screenHarness(path.resolve(__dirname, '..'), 'screens/TeamsScreen.tsx', 'TeamGridCard', {}).render({ ...cards[0].props, progress: { league: '30/30', cup: 'S3 1/1', champions: 'Out R16' } })
  assert.match(card.props.className, /aspect-\[0.82\]/)
  assert(nodes(card, n => n.type === 'dd').every(n => n.props.className.includes('min-w-0')))
})
