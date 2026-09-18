const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const source = path => fs.readFileSync(require.resolve(path), 'utf8')
const { competitionContextParts } = require('../src/engine/competitionContext.ts')

test('v2.2.9 Log Match keeps a readable flexible two-line context and a right-side score', () => {
  const log = source('../src/screens/NewMatchScreen.tsx')
  const header = log.slice(log.indexOf('<h1 className="text-2xl font-bold">Log Match</h1>'), log.indexOf('{historyError'))
  assert(header.includes('flex min-w-0 items-center justify-between'))
  assert(header.includes('className="min-w-0"'))
  assert(header.includes('aria-label="Live score"') && header.includes('shrink-0') && header.includes('tabular-nums'))
  assert(!header.includes('grid-cols-[1fr_auto_1fr]') && !header.includes('truncate'))
})

test('v2.2.9 canonical context parts provide full two-line Champions wording', () => {
  assert.deepEqual(competitionContextParts({ competitionType: 'champions', season: 'Season 1', teamId: 'T1', stage: 'roundOf16', seriesGame: 1, matchDay: 1 }), { primary: 'Season 1 · Champions', secondary: 'Round of 16 · Game 1/3' })
  assert.deepEqual(competitionContextParts({ competitionType: 'champions', season: 'Season 1', teamId: 'T1', stage: 'final', seriesGame: 2, matchDay: 1 }), { primary: 'Season 1 · Champions', secondary: 'Final · Game 2/2' })
})

test('v2.2.9 Team Detail match rows keep scores at the mathematical card center', () => {
  const team = source('../src/screens/TeamDetailScreen.tsx')
  const rows = team.slice(team.indexOf('{visibleMatches.map'), team.indexOf('{!visibleMatches.length'))
  assert(rows.includes('grid-cols-[1fr_auto_1fr]') && rows.includes('items-center'))
  assert(rows.includes('justify-self-start') && rows.includes('justify-self-center') && rows.includes('justify-self-end'))
  assert(rows.includes('formatCompactCompetitionContext(assignmentSnapshotForMatch(match))'))
  assert(rows.includes('font-bold') && rows.includes('tabular-nums'))
})
