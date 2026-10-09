const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { fixtures, makeMatches, teams } = require('../scripts/benchmark-engine.cjs')

test('phase 7 benchmark data uses a complete 30-matchday schedule and respects per-team seasonal caps', () => {
  assert.equal(fixtures.length, 16 * 30 / 2)
  const matches = makeMatches(1000)
  assert.equal(matches.length, 1000)

  const counts = new Map()
  for (const match of matches) {
    const key = `${match.season}:${match.teamId}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    assert.equal(match.appearances.length, 11)
    assert.ok(match.matchDay >= 1 && match.matchDay <= 30)
  }
  assert.ok([...counts.values()].every(count => count <= 30))
  assert.ok(teams.every(team => counts.has(`Season 1:${team.id}`)))
})

test('screen routes are lazy-loaded inside the existing recovery boundary', () => {
  const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
  const main = fs.readFileSync(path.join(__dirname, '../src/main.tsx'), 'utf8')
  const screenImports = [...app.matchAll(/^import\s+\{[^}]+\}\s+from\s+'\.\/screens\//gm)]

  assert.equal(screenImports.length, 1)
  assert.match(app, /import \{ AuthEntryScreen \} from '\.\/screens\/AuthEntryScreen'/)
  assert.match(app, /lazy\(\(\) => import\('\.\/screens\/HomeScreen'\)/)
  assert.match(app, /<Suspense fallback=/)
  assert.match(main, /<StartupBoundary>/)
})

test('optimized benchmark outputs exactly match the pre-optimization reference', () => {
  const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, `../docs/performance/${name}`), 'utf8').replace(/^\uFEFF/, ''))
  const reference = read('phase-7-reference.json')
  const optimized = read('phase-7-optimized.json')

  assert.deepEqual(optimized.benchmarks.map(run => run.size), reference.benchmarks.map(run => run.size))
  for (let index = 0; index < reference.benchmarks.length; index++) {
    const before = reference.benchmarks[index]
    const after = optimized.benchmarks[index]
    assert.deepEqual(after.results.map(result => [result.label, result.output.hash]), before.results.map(result => [result.label, result.output.hash]), `output mismatch at ${before.size} matches`)
  }
})
