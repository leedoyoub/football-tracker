require('./helpers/register-ts.cjs')
const test = require('node:test'), assert = require('node:assert/strict')
const path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const { execFileSync } = require('node:child_process')
const { sourceModule } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { teams, game, cupFixture } = require('./helpers/v258-fixture.cjs')
const root = path.resolve(__dirname, '..')
const competition = require('../src/engine/competition.ts')
const rating = require('../src/engine/rating.ts')
const news = require('../src/engine/news.ts')
const latest = require('../src/engine/latestChanges.ts')
function baseline(file, overrides = {}) {
  const filename = path.join(root, 'src/engine', file + '.ts'), compiled = new Module(filename)
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = compiled.require.bind(compiled)
  compiled.require = request => request in overrides ? overrides[request] : original(request)
  const source = execFileSync('git', ['show', `e97d391fc763f5f146cc116e25fb2aad60189fd9:src/engine/${file}.ts`], { cwd: root, encoding: 'utf8' })
  compiled._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename)
  return compiled.exports
}
const oldNews = baseline('news'), oldLatest = baseline('latestChanges', { './news': oldNews })
function equivalent(s, label) {
  const args = [s.players, s.teams, s.matches, s.competitionStates ?? []]
  assert.deepEqual(news.deriveNews(...args), oldNews.deriveNews(...args), `${label}: News`)
  assert.deepEqual(news.deriveFootballEvents(...args), oldNews.deriveFootballEvents(...args), `${label}: Match Changes`)
  assert.deepEqual(latest.deriveLatestChanges(...args), oldLatest.deriveLatestChanges(...args), `${label}: Latest Changes`)
  for (const id of [...new Set([0, 9, 15, 60].map(index => s.players[index]?.id).filter(Boolean)), 'deleted-player']) {
    // A fresh module also exercises the dedicated path before the full-feed cache exists.
    const isolated = sourceModule(root, 'engine/news.ts')
    assert.deepEqual(isolated.derivePlayerMilestones(id, ...args), oldNews.derivePlayerMilestones(id, ...args), `${label}: ${id} milestones`)
  }
}

test('Latest Changes opts out of unused match-performance work while default Match Changes stays identical', () => {
  const s = performanceFixture(1), args = [s.players, s.teams, s.matches.slice(0, 1), s.competitionStates]
  const full = news.deriveFootballEvents(...args)
  assert.ok(full.some(item => item.id.startsWith('match-performance:')))
  assert.deepEqual(news.deriveFootballEvents(...args, { includeMatchPerformance: false }), full.filter(item => !item.id.startsWith('match-performance:')))
  let options
  const isolated = sourceModule(root, 'engine/latestChanges.ts', { './news': { ...news, deriveFootballEvents(...values) { options = values[4]; return news.deriveFootballEvents(...values) } } })
  assert.deepEqual(isolated.deriveLatestChanges(...args), oldLatest.deriveLatestChanges(...args))
  assert.equal(options.includeMatchPerformance, false)
  const facts = require('../src/engine/playerMatchFacts.ts')
  let contributionReads = 0
  const measured = sourceModule(root, 'engine/news.ts', { './playerMatchFacts': { ...facts,
    playerGoalEvents(...values) { contributionReads++; return facts.playerGoalEvents(...values) },
    playerAssistEvents(...values) { contributionReads++; return facts.playerAssistEvents(...values) },
  } })
  measured.deriveNews(...args)
  contributionReads = 0
  measured.deriveFootballEvents(...args, { includeMatchPerformance: false })
  assert.equal(contributionReads, 0, 'no discarded contribution facts are computed')
  measured.deriveFootballEvents(...args)
  assert.ok(contributionReads > 0, 'Match Changes still derives contribution facts')
})

test('dedicated milestones avoid MOM derivation for matches without the target on the pitch', () => {
  const s = performanceFixture(1), id = s.players[9].id, matches = s.matches.slice(0, 16)
  let calls = 0
  const isolated = sourceModule(root, 'engine/news.ts', { './rating': { ...rating, getMatchManOfTheMatch(...args) { calls++; return rating.getMatchManOfTheMatch(...args) } } })
  assert.deepEqual(isolated.derivePlayerMilestones(id, s.players, s.teams, matches), oldNews.derivePlayerMilestones(id, s.players, s.teams, matches))
  assert.equal(calls, 1)
})

test('News reuses unchanged incomplete knockout snapshots without moving historical events', () => {
  const s = performanceFixture(1), matches = s.matches.filter(match => match.competitionType !== 'league')
  const calls = { cup: 0, champions: 0 }
  const isolated = sourceModule(root, 'engine/news.ts', { './competition': { ...competition,
    cupCompetition(...args) { calls.cup++; return competition.cupCompetition(...args) },
    championsCompetition(...args) { calls.champions++; return competition.championsCompetition(...args) },
  } })
  assert.deepEqual(isolated.deriveNews(s.players, s.teams, matches, s.competitionStates), oldNews.deriveNews(s.players, s.teams, matches, s.competitionStates))
  assert.ok(calls.cup < 48, `Cup checkpoint calls: ${calls.cup}`)
  assert.ok(calls.champions < 20, `Champions checkpoint calls: ${calls.champions}`)
})

test('participant iteration preserves duplicate roster, first appearance, transfer, release, deletion and match identity semantics', () => {
  const s = performanceFixture(1)
  s.matches = s.matches.slice(0, 32)
  s.players = [s.players[9], ...s.players, { ...s.players[9], displayName: 'Duplicate name', position: 'GK' }]
  s.matches[0] = { ...s.matches[0], appearances: [s.matches[0].appearances[20], ...s.matches[0].appearances, { ...s.matches[0].appearances[9], role: 'bench' }] }
  s.matches.push({ ...s.matches[0], events: s.matches[0].events.slice(0, -1) })
  equivalent(s, 'duplicates')
  s.matches[0] = { ...s.matches[0], events: [] }; s.players[0] = { ...s.players[0], displayName: 'Edited transfer', teamId: s.teams[2].id }
  equivalent(s, 'same-array replacements')
  s.matches.splice(-1, 1); s.players.splice(0, 1)
  equivalent(s, 'deletions')
})

test('News avoids repeated appearance searches for players absent from each match', () => {
  const searches = {}
  for (const [side, api] of [['before', oldNews], ['after', news]]) {
    const s = performanceFixture(1); s.matches = s.matches.slice(0, 16)
    let count = 0
    for (const match of s.matches) {
      const find = match.appearances.find
      match.appearances.find = function (...args) { count++; return find.apply(this, args) }
    }
    const result = api.deriveNews(s.players, s.teams, s.matches, s.competitionStates)
    assert.ok(result.length > 0)
    searches[side] = count
  }
  assert.ok(searches.after < searches.before / 2, JSON.stringify(searches))
})

test('one and three season canonical feeds remain identical including season filters', () => {
  for (const count of [1, 3]) {
    const s = performanceFixture(count), args = [s.players, s.teams, s.matches, s.competitionStates]
    assert.deepEqual(news.deriveNews(...args), oldNews.deriveNews(...args))
    assert.deepEqual(latest.deriveLatestChanges(...args, `Season ${count}`), oldLatest.deriveLatestChanges(...args, `Season ${count}`))
  }
})

test('Cup checkpoints preserve every prefix through all stages, final replay and earlier-stage late records', () => {
  const matches = cupFixture(7), active = competition.cupCompetition(teams, matches, 'S1').activeTeamIds
  matches.push(game('final', active[0], { competitionStage: 'final', awayTeamId: active[1] }))
  matches.push(game('replay', active[0], { competitionStage: 'finalReplay', awayTeamId: active[1] }))
  matches.push(game('late-stage1', teams[0].id, { gf: 4 }))
  matches.forEach((match, index) => { match.recordedAt = index + 1 })
  for (let end = 1; end <= matches.length; end++) {
    const prefix = matches.slice(0, end)
    assert.deepEqual(news.deriveNews([], teams, prefix), oldNews.deriveNews([], teams, prefix), `Cup prefix ${end}`)
  }
  for (const changed of [matches.map((match, index) => index === 0 ? { ...match, events: [] } : match), matches.slice(1)]) {
    assert.deepEqual(news.deriveNews([], teams, changed), oldNews.deriveNews([], teams, changed))
  }
})

function championsFixture(legacy = false) {
  const draw = { id: 'draw:S1', season: 'S1', kind: 'champions-draw', teamIds: teams.map(team => team.id) }, matches = []
  for (const stage of competition.CHAMPIONS_ROUNDS) {
    const bracket = competition.championsCompetition(draw, matches, 'S1')
    for (const pair of bracket.rounds[stage]) {
      if (legacy) {
        for (let number = 1; number <= (stage === 'final' ? 1 : 2); number++) matches.push(game(`${stage}:${pair.id}:${number}`, pair.teamIds[0], { competitionType: 'champions', competitionStage: stage, competitionPairingId: pair.id, awayTeamId: pair.teamIds[1], gf: stage === 'final' ? 0 : 2 }))
      } else {
        for (const [side, id] of pair.teamIds.entries()) for (let number = 1; number <= (stage === 'final' ? 2 : 3); number++) {
          matches.push(game(`${stage}:${pair.id}:${id}:${number}`, id, { competitionType: 'champions', competitionStage: stage, competitionPairingId: pair.id, competitionSeriesGame: number, gf: side ? 1 : 2 }))
        }
      }
    }
  }
  if (legacy) {
    const final = competition.championsCompetition(draw, matches, 'S1').rounds.final[0]
    matches.push(game('final-replay', final.teamIds[0], { competitionType: 'champions', competitionStage: 'finalReplay', competitionPairingId: final.id, awayTeamId: final.teamIds[1], gf: 2 }))
  }
  matches.forEach((match, index) => { match.recordedAt = index + 1 })
  return { teams, players: [], matches, competitionStates: [draw] }
}

test('Champions checkpoints preserve each independently resolved pairing and every round prefix', () => {
  for (const legacy of [false, true]) {
    const s = championsFixture(legacy)
    for (let end = 1; end <= s.matches.length; end++) {
      const prefix = s.matches.slice(0, end)
      assert.deepEqual(news.deriveNews([], teams, prefix, s.competitionStates), oldNews.deriveNews([], teams, prefix, s.competitionStates), `${legacy ? 'legacy/replay' : 'numbered series'} prefix ${end}`)
    }
    equivalent(s, legacy ? 'legacy replay' : 'complete series')
    for (const changed of [s.matches.map((match, index) => index === 0 ? { ...match, events: [] } : match), s.matches.slice(1)]) {
      assert.deepEqual(news.deriveNews([], teams, changed, s.competitionStates), oldNews.deriveNews([], teams, changed, s.competitionStates), 'early edit/delete')
    }
  }
})

test('missing, wrong, duplicate and cross-pair Champions identities retain official fallback events', () => {
  const original = championsFixture()
  const mutations = [
    match => ({ ...match, competitionPairingId: undefined }),
    match => ({ ...match, competitionPairingId: 'roundOf16:99' }),
    match => ({ ...match, competitionSeriesGame: 2 }),
    match => ({ ...match, competitionSeriesGame: undefined }),
    match => ({ ...match, competitionSeriesGame: 99 }),
    match => ({ ...match, awayTeamId: teams[2].id }),
    match => ({ ...match, competitionStage: 'quarterFinal', competitionPairingId: 'quarterFinal:0' }),
  ]
  for (const mutate of mutations) {
    const matches = original.matches.slice(0, 12).map((match, index) => index === 0 ? mutate(match) : match)
    for (let end = 1; end <= matches.length; end++) {
      const prefix = matches.slice(0, end)
      assert.deepEqual(news.deriveNews([], teams, prefix, original.competitionStates), oldNews.deriveNews([], teams, prefix, original.competitionStates))
    }
  }
  const duplicate = { ...original.matches[0], id: 'duplicate-series-slot', recordedAt: 2.5 }
  const matches = [...original.matches.slice(0, 12), duplicate]
  assert.deepEqual(news.deriveNews([], teams, matches, original.competitionStates), oldNews.deriveNews([], teams, matches, original.competitionStates))
  original.competitionStates[0] = { ...original.competitionStates[0], teamIds: teams.map(() => teams[0].id) }
  assert.deepEqual(news.deriveNews([], teams, matches, original.competitionStates), oldNews.deriveNews([], teams, matches, original.competitionStates))
})
