const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { monthlyAwardForBlock, canonicalBlockLabel } = require('../src/engine/seasonAnalytics.ts')
const { deriveNews, sortNewsNewestFirst } = require('../src/engine/news.ts')
const { competitionAwardLabel, monthlyCanonicalAwardResult } = require('../src/engine/awards.ts')
const { awardNewsFromResult } = require('../src/engine/news.ts')
const { awardBestXIProps } = require('../src/components/awardBestXIProps.ts')

const teams = [
  { id: 'A', name: 'Alpha', shortName: 'ALP', logo: '' },
  { id: 'B', name: 'Beta', shortName: 'BET', logo: '' },
]
const salah = { id: 'salah', name: 'Salah', displayName: 'Salah', fullName: 'Mohamed Salah', number: 11, position: 'ST', teamId: 'A' }
const rival = { id: 'rival', name: 'Rival', displayName: 'Rival', fullName: 'Rival Player', number: 9, position: 'ST', teamId: 'B' }
const players = [salah, rival]
const appearance = (player, teamId) => ({ playerId: player.id, teamId, role: 'starter', position: player.position, matchPosition: player.position })
const leagueMatch = (id, day, { salahGoals = 0, rivalGoals = 0 } = {}) => ({
  id, season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: day,
  date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B',
  appearances: [appearance(salah, 'A'), appearance(rival, 'B')],
  events: [
    ...Array.from({ length: salahGoals }, (_, index) => ({ id: `${id}:s:${index}`, type: 'goal', teamId: 'A', minute: index + 1, playerId: 'salah' })),
    ...Array.from({ length: rivalGoals }, (_, index) => ({ id: `${id}:r:${index}`, type: 'goal', teamId: 'B', minute: index + 30, playerId: 'rival' })),
  ],
})

test('v2.2.8 reuses the canonical Season N-B label and block-only award stats', () => {
  const matches = [
    leagueMatch('b1d1', 1, { salahGoals: 1 }), leagueMatch('b1d2', 2, { salahGoals: 1 }), leagueMatch('b1d3', 3, { salahGoals: 1 }),
    leagueMatch('b2d4', 4, { salahGoals: 3 }), leagueMatch('b2d5', 5, { salahGoals: 2 }), leagueMatch('b2d6', 6, { salahGoals: 1 }),
  ]
  const award = monthlyAwardForBlock(teams, players, matches, 'Season 1', 2)
  assert.equal(canonicalBlockLabel('Season 1', 2), 'Season 1-2')
  assert.equal(award.scopeLabel, 'Season 1-2')
  assert.equal(award.bestPlayerId, 'salah')
  assert.equal(award.statsByPlayer.salah.goals, 6)
  assert.equal(award.bestXI.find(slot => slot.playerId === 'salah').avgRating, award.statsByPlayer.salah.avgRating)
})

test('v2.2.8 News emits stable separate player and Team of the Month articles using block labels', () => {
  const matches = [leagueMatch('d1', 1, { salahGoals: 1 }), leagueMatch('d2', 2, { salahGoals: 1 }), leagueMatch('d3', 3, { salahGoals: 1 })]
  const news = deriveNews(players, teams, matches, [])
  const playerAward = news.find(item => item.id === 'award:player-of-month:Season 1-1:salah')
  const teamAward = news.find(item => item.id.startsWith('award:team-of-month:Season 1-1:'))
  assert(playerAward)
  assert(teamAward)
  assert.equal(playerAward.title, 'Salah wins Season 1-1 Player of the Month')
  assert.equal(teamAward.title, 'Season 1-1 Best XI revealed')
  assert.equal(news.filter(item => item.id === playerAward.id).length, 1)
  assert.equal(news.filter(item => item.id === teamAward.id).length, 1)
})

test('v2.2.8 News is newest-first with a deterministic id tie-break', () => {
  const rows = sortNewsNewestFirst([
    { id: 'a', date: '2026-01-02' }, { id: 'z', date: '2026-01-02' }, { id: 'middle', date: '2026-01-01' },
  ])
  assert.deepEqual(rows.map(row => row.id), ['z', 'a', 'middle'])
})

test('v2.2.8 competition award labels do not call Cup or Champions a Team of the Season', () => {
  assert.equal(competitionAwardLabel('league', 'season'), 'Team of the Season')
  assert.equal(competitionAwardLabel('league', 'monthly'), 'Team of the Month')
  assert.equal(competitionAwardLabel('cup'), 'Team of the Cup')
  assert.equal(competitionAwardLabel('champions'), 'Team of the Tournament')
})

test('v2.2.8 award News projects canonical Cup and Tournament results without selecting a winner again', () => {
  const articles = awardNewsFromResult({
    scopeLabel: 'Season 1', playerLabel: 'Player of the Cup', teamLabel: 'Team of the Cup', bestPlayerId: 'salah',
    bestXI: [{ playerId: 'salah' }, { playerId: 'rival' }], anchorMatch: { id: 'cup-final', date: '2026-02-01' },
  }, id => id === 'salah' ? 'Salah' : 'Rival')
  assert.equal(articles[0].id, 'award:player-of-the-cup:Season 1:salah')
  assert.equal(articles[0].title, 'Salah wins Player of the Cup')
  assert.equal(articles[1].id, 'award:team-of-the-cup:Season 1:salah:rival')
  assert.equal(articles[1].title, 'Team of the Cup revealed')
  const tournament = awardNewsFromResult({
    scopeLabel: 'Season 1', playerLabel: 'Player of the Tournament', teamLabel: 'Team of the Tournament', bestPlayerId: 'salah',
    bestXI: [{ playerId: 'salah' }, { playerId: 'rival' }], anchorMatch: { id: 'ucl-final', date: '2026-03-01' },
  }, id => id === 'salah' ? 'Salah' : 'Rival')
  assert.equal(tournament[0].title, 'Salah wins Player of the Tournament')
  assert.equal(tournament[1].title, 'Team of the Tournament revealed')
})

test('v2.2.8 every award Best XI forwards scoped stats and its canonical best player to the existing blue-star treatment', () => {
  const props = awardBestXIProps({ bestXI: [{ slot: 'ST', position: 'ST', playerId: 'salah', avgRating: 8.7, matches: 3 }], bestPlayerId: 'salah', statsByPlayer: { salah: { goals: 3, assists: 2, avgRating: 8.7 } } })
  assert.equal(props.motmPlayerId, 'salah')
  assert.deepEqual(props.statsByPlayer.salah, { goals: 3, assists: 2, avgRating: 8.7 })
  assert.equal(props.layout, 'free')
})

test('v2.2.8 converts a finalized monthly result once for both Best XI and News consumers', () => {
  const result = monthlyCanonicalAwardResult({ scopeLabel: 'Season 1-2', bestPlayerId: 'salah', bestXI: [{ playerId: 'salah' }], statsByPlayer: { salah: { goals: 3, assists: 2, avgRating: 8.7 } } }, { id: 'md6', date: '2026-01-06' })
  assert.deepEqual(result, {
    scopeLabel: 'Season 1-2', playerLabel: 'Player of the Month', teamLabel: 'Team of the Month', bestPlayerId: 'salah',
    bestXI: [{ playerId: 'salah' }], statsByPlayer: { salah: { goals: 3, assists: 2, avgRating: 8.7 } }, anchorMatch: { id: 'md6', date: '2026-01-06' },
  })
})
