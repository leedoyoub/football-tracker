const { assertPolicyEquivalence } = require('./helpers/v2512-policy-comparison.cjs')
require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test, after } = require('node:test')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { teams, game, cupFixture } = require('./helpers/v258-fixture.cjs')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v258-equivalence-'))
if (!path.resolve(baseline).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected baseline root')
const archive = execFileSync('git', ['archive', '53ea649b56741e7f50954e61023a19f65982f2e4', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: archive })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
after(() => fs.rmSync(baseline, { recursive: true, force: true }))
const before = file => require(path.join(baseline, 'src', file))
const current = file => require(path.join(root, 'src', file))
function equal(file, name, ...args) { assertPolicyEquivalence(current(file)[name](...args), before(file)[name](...args), file, name) }
const s = performanceFixture()

test('v2.5.7 equivalence: every saved rating/MOM and team score/ownership remains exact', () => {
  const snapshot = JSON.stringify(s)
  for (const match of s.matches) {
    equal('engine/rating.ts', 'rateMatch', match, s.players)
    equal('engine/rating.ts', 'getMatchManOfTheMatch', match, s.players)
    equal('engine/matchPerspective.ts', 'teamsCreditedWithResult', match)
    for (const teamId of before('engine/matchPerspective.ts').teamsCreditedWithResult(match)) equal('engine/matchPerspective.ts', 'teamPerspectiveScore', match, teamId)
  }
  assert.equal(JSON.stringify(s), snapshot)
})

test('v2.5.7 equivalence: official Cup decisions, complete Stage history and neutral Total stay exact', () => {
  const matches = cupFixture(7)
  const finalists = before('engine/competition.ts').cupCompetition(teams, matches, 'S1').activeTeamIds
  const final = finalists.map(id => game(`final:${id}`, id, { competitionStage: 'final' }))
  const replay = finalists.map((id, i) => game(`replay:${id}`, id, { competitionStage: 'finalReplay', gf: 2 - i }))
  const scenarios = [[], ...[1, 2, 7].map(n => cupFixture(n)), [...matches, ...final], [...matches, ...final, ...replay], teams.map(t => game(`tie:${t.id}`, t.id))]
  for (const games of scenarios) {
    const oldCup = before('engine/competition.ts').cupCompetition(teams, games, 'S1')
    const cup = current('engine/competition.ts').cupCompetition(teams, games, 'S1')
    const snapshot = JSON.stringify({ games, cup, oldCup })
    assert.deepStrictEqual(cup, oldCup)
    const oldModel = before('lib/cupTable.ts')
    const model = current('lib/cupTable.ts')
    const choices = oldModel.cupTableModel(teams, games, 'S1', [], oldCup, null).availableStages
    for (const selection of [...choices.filter(stage => stage !== cup.stage || !/^stage/.test(stage)), 'total']) {
      assert.deepStrictEqual(model.cupTableModel(teams, games, 'S1', [], cup, selection), oldModel.cupTableModel(teams, games, 'S1', [], oldCup, selection), selection)
    }
    assert.equal(JSON.stringify({ games, cup, oldCup }), snapshot)
  }
})

test('v2.5.7 equivalence: League history, Champions winners/bracket and every award/Best XI stay exact', () => {
  for (const season of ['Season 1', 'Season 2']) {
    const draw = s.competitionStates.find(d => d.season === season)
    equal('engine/competition.ts', 'leagueCompetition', s.teams, s.matches, season, s.players)
    equal('engine/competition.ts', 'cupCompetition', s.teams, s.matches, season, s.players)
    equal('engine/competition.ts', 'championsCompetition', draw, s.matches, season, s.players)
    equal('engine/seasonAnalytics.ts', 'buildSeasonAnalytics', s.teams, s.players, s.matches, season)
    equal('engine/awards.ts', 'seasonAwards', season, s.teams, s.players, s.matches, s.competitionStates)
    for (const type of ['league', 'cup', 'champions']) equal('engine/awards.ts', 'competitionAwardResult', type, season, s.teams, s.players, s.matches, s.competitionStates)
  }
})

test('v2.5.7 equivalence: all ranking metrics and shared Results preserve facts/order/scopes', () => {
  const metrics = before('lib/rankingMetrics.ts').RANKING_METRICS
  for (const metric of [...metrics.map(row => row.value), 'goalsConceded']) {
    const filters = { seasons: ['Season 2'], teams: [], positions: [] }
    equal('engine/stats.ts', 'buildGlobalRankingData', s.players, s.matches, filters, metric)
    const oldRows = before('engine/stats.ts').buildGlobalRankingData(s.players, s.matches, filters, metric)
    assert.deepStrictEqual(current('engine/stats.ts').rankGlobalRankingRows(oldRows, s.players, metric), before('engine/stats.ts').rankGlobalRankingRows(oldRows, s.players, metric))
  }
  equal('lib/results.ts', 'derivedResults', s.matches, s.teams)
  for (const team of s.teams) equal('lib/results.ts', 'derivedResults', s.matches, s.teams, team.id)
  equal('lib/validation.ts', 'validateState', s)
})
