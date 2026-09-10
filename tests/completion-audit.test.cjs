const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { combinationStats } = require('../src/engine/analytics.ts')
const { auditDataIntegrity } = require('../src/engine/integrity.ts')
const { playerSearchMatches } = require('../src/lib/normalizedSearch.ts')
const source = path => fs.readFileSync(require.resolve('../' + path), 'utf8')
const player = (id, position = 'CB') => ({ id, name: id, displayName: id, fullName: id, position, number: 1, teamId: 'A' })
const game = (id, events, appearances) => ({ id, season: 'S1', matchDay: 1, date: '2026-03-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', events, appearances })

test('Home competition progress visibly uses distinct League, Cup, and Champions emojis', () => {
  const home = source('src/screens/HomeScreen.tsx')
  assert(home.includes("emoji: '👑', label: 'League'"))
  assert(home.includes("emoji: '🥇', label: 'Cup'"))
  assert(home.includes("emoji: '🏆', label: 'Champions'"))
  assert(home.includes('<span aria-hidden="true">{item.emoji}</span> {item.label}'))
  assert(!home.includes("item.type === 'cup' ? '🏆 '"))
})

test('numeric player IDs use the exact lookup path and text matching remains accent-insensitive', () => {
  const helper = source('src/lib/apiFootball.ts')
  const screen = source('src/screens/NewPlayerScreen.tsx')
  const edge = source('supabase/functions/api-football-player-search/index.ts')
  assert(helper.includes('apiFootballPlayerIdQuery') && helper.includes('if (exactId !== undefined) return [await fetchApiFootballPlayer(exactId)]'))
  assert(helper.indexOf('if (exactId !== undefined)') < helper.indexOf('if (options.externalTeamId)'))
  assert(screen.includes('No API player found for ID'))
  assert(edge.includes("url.searchParams.set('player', String(externalPlayerId))"))
  assert(edge.includes('players.find((item: { id: number }) => item.id === externalPlayerId)'))
  assert(playerSearchMatches('Ake', { name: 'Aké' }))
  assert(playerSearchMatches('Gundogan', { name: 'Gündogan' }))
  assert.equal(playerSearchMatches('Ake', { name: 'Aké' }) ? 'Aké' : '', 'Aké')
})

test('squad-first cache, No Team filtering, and No Team display remain real UI behavior', () => {
  const helper = source('src/lib/apiFootball.ts')
  const filters = source('src/screens/RankingFilters.tsx')
  const players = source('src/screens/PlayersScreen.tsx')
  assert(helper.includes('const squadCache = new Map') && helper.includes('const local = squad.filter(player => playerSearchMatches(query, player))'))
  assert(filters.includes("NO_TEAM_FILTER = '__no-team__'") && filters.includes('>No Team</label>'))
  assert(players.includes("appliedFilters.teams.includes('__no-team__') && playerHasNoCurrentTeam(player)"))
  assert(players.includes("playerHasNoCurrentTeam(player) ? 'No Team'"))
})

test('starting-combination metrics exclude matches where the unit did not start together', () => {
  const left = player('left'); const right = player('right'); const third = player('third')
  const first = game('first', [
    { id: 'a1', type: 'goal', minute: 10, teamId: 'A', playerId: 'left' },
    { id: 'b1', type: 'goal', minute: 20, teamId: 'B' },
    { id: 'a2', type: 'goal', minute: 30, teamId: 'A' },
  ], [
    { playerId: 'left', teamId: 'A', role: 'starter', position: 'CB' },
    { playerId: 'right', teamId: 'A', role: 'starter', position: 'CB' },
  ])
  const second = game('second', [
    { id: 'on', type: 'sub', minute: 60, teamId: 'A', playerOutId: 'third', playerInId: 'right', position: 'CB' },
    { id: 'b2', type: 'goal', minute: 75, teamId: 'B' },
  ], [
    { playerId: 'left', teamId: 'A', role: 'starter', position: 'CB' },
    { playerId: 'third', teamId: 'A', role: 'starter', position: 'CB' },
    { playerId: 'right', teamId: 'A', role: 'bench', position: 'CB' },
  ])
  const row = combinationStats([left, right, third], [first, second], { season: 'S1', teamId: 'A' }, 'cb').find(item => item.playerIds.includes('left') && item.playerIds.includes('right'))
  assert.deepEqual([row.startsTogether, row.matches, row.togetherMinutes], [1, 2, 120])
  assert.deepEqual([row.startingGoalsFor, row.startingGoalsAgainst, row.startingWins, row.startingLosses], [2, 1, 1, 0])
  assert.deepEqual([row.onPitchGoalsFor, row.onPitchGoalsAgainst], [2, 2])
})

test('Records exposes attacking, midfield, and each defensive combination unit with separated on-pitch rates', () => {
  const records = source('src/screens/RecordsScreen.tsx')
  const combinations = source('src/components/CombinationRecords.tsx')
  assert(records.includes('<CombinationRecords players={players} matches={scoped} />'))
  for (const label of ['ATTACKING', 'MIDFIELD', 'DEFENSIVE', 'CB Pair', 'Fullback Pair', 'Back Four', 'Starts Together', 'Matches Together', 'Minutes Together', 'On-Pitch GF / 90', 'On-Pitch GA / 90', 'On-Pitch GD / 90']) assert(combinations.includes(label))
  assert(combinations.includes('SOT Allowed is full-match only.'))
})

test('Player Detail, Match Story, Match Log, and Data Integrity remain reachable from rendered screens', () => {
  const detail = source('src/screens/PlayerDetailScreen.tsx')
  const match = source('src/screens/MatchDetailScreen.tsx')
  const log = source('src/screens/NewMatchScreen.tsx')
  const records = source('src/screens/RecordsScreen.tsx')
  for (const label of ['Recent Form', 'Positions Played', 'Goal Types', 'Starter / Substitute', 'Team Performance When Starting', 'Player Chemistry', 'Career Timeline', 'Personal Records', 'Substitute Impact', 'Rating Details']) assert(detail.includes(label))
  assert(match.includes('Match Story') && match.includes('story.tags.slice(0, 3)'))
  assert(log.includes('Current Matchday') && log.includes('aria-label="Live score"') && log.includes('matchScore(eventMatch)'))
  assert(records.includes("['integrity', 'Data Integrity']") && records.includes("category === 'integrity' ? auditDataIntegrity"))
})

test('integrity audit is read-only, permits unassigned players, and detects a tracked goal without a scorer', () => {
  const unassigned = { ...player('unassigned'), teamId: '', teamIds: [] }
  assert.equal(auditDataIntegrity([], [unassigned], [{ id: 'A' }, { id: 'B' }]).errors, 0)
  const match = game('integrity', [{ id: 'goal', type: 'goal', minute: 20, teamId: 'A' }], [])
  const before = JSON.stringify(match)
  const report = auditDataIntegrity([match], [unassigned], [{ id: 'A' }, { id: 'B' }])
  assert(report.issues.some(issue => issue.message.includes('no scorer')))
  assert.equal(JSON.stringify(match), before)
})
