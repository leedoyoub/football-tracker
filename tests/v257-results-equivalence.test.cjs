require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test, after } = require('node:test')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v257-results-'))
const temporaryRoot = path.resolve(os.tmpdir()) + path.sep
if (!path.resolve(baseline).startsWith(temporaryRoot)) throw new Error('Unexpected baseline directory')
const archive = execFileSync('git', ['archive', 'e4ee68f3ab35e2a0d308672b313a149f1d0da0b9', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: archive })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
after(() => fs.rmSync(baseline, { recursive: true, force: true }))
const before = file => require(path.join(baseline, 'src', file))
const current = require('../src/lib/results.ts')
const s = performanceFixture()

test('every recorded Home/Results/Competition result remains exactly equal to the independent v2.5.6 baseline', () => {
  assert.deepStrictEqual(current.derivedResults(s.matches, s.teams), before('lib/results.ts').derivedResults(s.matches, s.teams))
  assert.deepStrictEqual(current.recentDerivedResults(s.matches, s.teams, 5), before('lib/results.ts').recentDerivedResults(s.matches, s.teams, 5))
  const duplicateAndLegacy = [...s.matches.slice(0, 15), s.matches[0]].map(match => ({ ...match, recordedAt: undefined })).reverse()
  assert.deepStrictEqual(current.derivedResults(duplicateAndLegacy, s.teams), before('lib/results.ts').derivedResults(duplicateAndLegacy, s.teams))
})

test('every Team perspective retains v2.5.6 ownership and newest order while using that team’s canonical score', () => {
  const perspective = before('engine/matchPerspective.ts')
  const { newestMatches } = before('engine/matchChronology.ts')
  const original = JSON.stringify(s.matches)
  for (const team of s.teams) {
    const expected = newestMatches(s.matches.filter(match => perspective.teamsCreditedWithResult(match).includes(team.id))).map(match => ({ matchId: match.id, teamId: team.id, teamName: team.name, ...perspective.teamPerspectiveScore(match, team.id) }))
    const actual = current.derivedResults(s.matches, s.teams, team.id).map(({ match, teamId, teamName, goalsFor, goalsAgainst, outcome }) => ({ matchId: match.id, teamId, teamName, goalsFor, goalsAgainst, outcome }))
    assert.deepStrictEqual(actual, expected, team.id)
  }
  assert.equal(JSON.stringify(s.matches), original)
})
