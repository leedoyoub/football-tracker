require('./helpers/register-ts.cjs')
const { test, after } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs')
const { baselineSource } = require('./helpers/v2514-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { assertOfficialAwardPolicy } = require('./helpers/v261-award-policy-comparison.cjs')
const { assertPolicyEquivalence } = require('./helpers/v2512-policy-comparison.cjs')
const b = baselineSource(); after(b.cleanup)
const { alignArchivedRatingInputs, v2612Source } = require('./helpers/rating-release-comparison.cjs')
alignArchivedRatingInputs(b.directory)
test('v2.5.13 full News, Latest Changes, official Awards and Records survive edits, deletion and season scope', () => {
  const s = performanceFixture(2)
  const funcs = [['engine/news.ts', 'deriveFootballEvents'], ['engine/news.ts', 'majorNewsEvents'], ['engine/latestChanges.ts', 'deriveLatestChanges']]
  for (const matches of [s.matches, s.matches.map((m, i) => i === 0 ? { ...m, events: [] } : m), s.matches.slice(1)]) {
    for (const [file, fn] of funcs) {
      const args = [s.players, s.teams, matches, s.competitionStates]
      assertPolicyEquivalence(require(path.join(b.root, 'src', file))[fn](...args), require(path.join(b.directory, 'src', file))[fn](...args), file, fn, args)
      if (fn !== 'deriveFootballEvents') for (const season of ['Season 1', 'Season 2']) assertPolicyEquivalence(require(path.join(b.root, 'src', file))[fn](...args, season), require(path.join(b.directory, 'src', file))[fn](...args, season), file, fn, [...args, season])
    }
    const old = require(path.join(b.directory, 'src/engine/officialAwards.ts')), current = require('../src/engine/officialAwards.ts')
    for (const season of ['Season 1', 'Season 2']) assertOfficialAwardPolicy(current.officialSeasonModel(s.teams, s.players, matches, s.competitionStates, season), old.officialSeasonModel(s.teams, s.players, matches, s.competitionStates, season), s.players, matches, season, s.teams, s.competitionStates)
  }
})
test('rating calculations, competition, durability and scroll sources remain identical', () => {
  // v2.6.1 explicitly changes award ties and extends types/navigation for History.
  // Their preserved behavior is checked by v261-equivalence and navigation tests.
  // v2.6.5 explicitly changes awardRules' derived candidate fields; independent
  // mathematical selection assertions replace its old byte-identity guard.
  // v2.6.7 intentionally changes Store's replacement safety. The real-Store
  // v267-match-metadata and p0-durability tests cover queue/read-back races,
  // saved identity and draft preservation; durable serializers remain exact.
  // v2611-equivalence compares raw UnitRecords, timeline normalization and
  // persistence validation against independent baseline implementations.
  for (const file of ['engine/rating.ts', 'engine/ratingRevision.ts', 'engine/constants.ts', 'engine/competitionSelectors.ts', 'engine/standings.ts', 'engine/competitionContext.ts', 'engine/competitionRevision.ts', 'lib/repository.ts', 'lib/scrollCheckpoint.ts', 'lib/cardWindow.ts', 'screens/TeamsScreen.tsx']) {
    const read = root => fs.readFileSync(path.join(root, 'src', file), 'utf8').replaceAll('\r\n', '\n')
      // v2.6.2 permits progress values to wrap inside the same-sized cards.
      .replaceAll('<dd className="min-w-0 text-right font-bold text-zinc-100">', '<dd className="font-bold text-zinc-100">')
    // v2.6.12 intentionally changes only the match MOM selection and its cache.
    const invariant = source => file === 'engine/rating.ts' ? source
      .replace("import { MOM_POLICY_REVISION } from './momPolicy'\n", '')
      .replace('policyRevision: number; ', '')
      .split('export function getMatchManOfTheMatch')[0] : source
    // Check the fixed-code history up to the last release that used REV13.
    const actual = file === 'engine/rating.ts' || file === 'engine/ratingRevision.ts' ? v2612Source(file) : read(b.root)
    assert.equal(invariant(actual), invariant(read(b.directory)), file)
  }
})
