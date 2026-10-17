require('./helpers/register-ts.cjs')
const { test, after } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs')
const { baselineSource } = require('./helpers/v2514-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const b = baselineSource(); after(b.cleanup)
test('v2.5.13 full News, Latest Changes, official Awards and Records survive edits, deletion and season scope', () => {
  const s = performanceFixture(2)
  const funcs = [['engine/news.ts', 'deriveFootballEvents'], ['engine/news.ts', 'majorNewsEvents'], ['engine/latestChanges.ts', 'deriveLatestChanges']]
  for (const matches of [s.matches, s.matches.map((m, i) => i === 0 ? { ...m, events: [] } : m), s.matches.slice(1)]) {
    for (const [file, fn] of funcs) {
      const args = [s.players, s.teams, matches, s.competitionStates]
      assert.deepEqual(require(path.join(b.root, 'src', file))[fn](...args), require(path.join(b.directory, 'src', file))[fn](...args), `${fn} entire output`)
      if (fn !== 'deriveFootballEvents') for (const season of ['Season 1', 'Season 2']) assert.deepEqual(require(path.join(b.root, 'src', file))[fn](...args, season), require(path.join(b.directory, 'src', file))[fn](...args, season), `${fn} ${season}`)
    }
    const old = require(path.join(b.directory, 'src/engine/officialAwards.ts')), current = require('../src/engine/officialAwards.ts')
    for (const season of ['Season 1', 'Season 2']) assert.deepEqual(current.officialSeasonModel(s.teams, s.players, matches, s.competitionStates, season), old.officialSeasonModel(s.teams, s.players, matches, s.competitionStates, season))
  }
})
test('all rating, award, competition policy, data durability and navigation sources remain unchanged', () => {
  for (const file of ['engine/rating.ts', 'engine/ratingRevision.ts', 'engine/timeline.ts', 'engine/constants.ts', 'engine/awardRules.ts', 'engine/awards.ts', 'engine/officialAwards.ts', 'engine/competitionSelectors.ts', 'engine/standings.ts', 'engine/competitionContext.ts', 'engine/competitionRevision.ts', 'engine/unitRecords.ts', 'store.tsx', 'types.ts', 'lib/repository.ts', 'lib/validation.ts', 'lib/navigation.ts', 'lib/scrollCheckpoint.ts', 'lib/cardWindow.ts', 'screens/TeamsScreen.tsx']) {
    const read = root => fs.readFileSync(path.join(root, 'src', file), 'utf8').replaceAll('\r\n', '\n')
    assert.equal(read(b.root), read(b.directory), file)
  }
})
