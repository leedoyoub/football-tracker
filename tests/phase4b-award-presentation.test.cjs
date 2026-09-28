const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { competitionAwardLabel, seasonAwards } = require('../src/engine/awards.ts')
const { monthlyAwardForStartedBlock } = require('../src/engine/seasonAnalytics.ts')
const { startedCupAwardStages, startedChampionsAwardRounds } = require('../src/engine/awardScopes.ts')
const { awardBestXIProps } = require('../src/components/awardBestXIProps.ts')

const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, displayName: id, fullName: id, teamId, position, number: 9 })
const appearance = (p, teamId = 'A') => ({ playerId: p.id, teamId, role: 'starter', position: p.position, matchPosition: p.position })
const leagueMatch = (id, day, appearances = []) => ({ id, season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances, events: [] })

test('cumulative competition labels use the Phase 4B Best XI wording', () => {
  assert.equal(competitionAwardLabel('league'), 'League Best XI')
  assert.equal(competitionAwardLabel('cup'), 'Cup Best XI')
  assert.equal(competitionAwardLabel('champions'), 'Champions Best XI')
})

test('started monthly blocks expose only canonical started periods and recompute their award', () => {
  const striker = player('month-striker')
  const teams = [{ id: 'A', name: 'Alpha', shortName: 'A' }, { id: 'B', name: 'Beta', shortName: 'B' }]
  const matches = [1, 2, 3, 4, 5].map(day => leagueMatch(`m-${day}`, day, [appearance(striker)]))
  const first = monthlyAwardForStartedBlock(teams, [striker], matches, 'Season 1', 1)
  const second = monthlyAwardForStartedBlock(teams, [striker], matches, 'Season 1', 2)
  const future = monthlyAwardForStartedBlock(teams, [striker], matches, 'Season 1', 3)
  assert.equal(first.scopeLabel, 'Season 1-1')
  assert.equal(second.scopeLabel, 'Season 1-2')
  assert.equal(future, undefined)
})

test('cup and Champions selectors expose only recorded stages and rounds', () => {
  const cup = [
    { ...leagueMatch('cup-1', 1), competitionType: 'cup', competitionStage: 'stage1' },
    { ...leagueMatch('cup-final', 2), competitionType: 'cup', competitionStage: 'finalReplay' },
  ]
  const champions = [
    { ...leagueMatch('cl-r16', 1), competitionType: 'champions', competitionStage: 'roundOf16' },
    { ...leagueMatch('cl-final', 2), competitionType: 'champions', competitionStage: 'final' },
  ]
  assert.deepEqual(startedCupAwardStages(cup, 'Season 1'), ['stage1', 'final'])
  assert.deepEqual(startedChampionsAwardRounds(champions, 'Season 1'), ['roundOf16', 'final'])
})

test('season award presentation preserves raw ratings while its canonical Best XI carries historical teams', () => {
  const striker = player('season-striker')
  const teams = [{ id: 'A', name: 'Alpha', shortName: 'A' }, { id: 'B', name: 'Beta', shortName: 'B' }]
  const award = seasonAwards('Season 1', teams, [striker], [leagueMatch('season', 1, [appearance(striker)])], [])
  const slot = award.bestXI.find(item => item.playerId === striker.id)
  assert.equal(slot.teamId, 'A')
  assert.equal(award.statsByPlayer[striker.id].avgRating, slot.avgRating)
})

test('award pitches opt into historical team crests without affecting standard pitch callers', () => {
  const props = awardBestXIProps({ bestXI: [], statsByPlayer: {} })
  assert.equal(props.showAwardTeamCrest, true)
  assert.match(fs.readFileSync('src/components/Pitch.tsx', 'utf8'), /showAwardTeamCrest/)
})

test('Home renders canonical Season Best XI beneath Global Ranking and Player Detail exposes canonical app subcounts', () => {
  const home = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8')
  const playerDetail = fs.readFileSync('src/screens/PlayerDetailScreen.tsx', 'utf8')
  assert(home.indexOf('Global Ranking') < home.indexOf('Season Best XI'))
  assert.match(home, /seasonAwards\(/)
  assert.match(playerDetail, /data\.starts/)
  assert.match(playerDetail, /data\.subs/)
})

test('competition screen owns historical award selector state rather than local selector state', () => {
  const types = fs.readFileSync('src/types.ts', 'utf8')
  const defaults = fs.readFileSync('src/lib/navigation.ts', 'utf8')
  assert.match(types, /monthlyAwardBlock/)
  assert.match(types, /cupAwardStage/)
  assert.match(types, /championsAwardRound/)
  assert.match(defaults, /monthlyAwardBlock: null/)
})
