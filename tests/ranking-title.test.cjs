const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    })
    module._compile(output.outputText, filename)
  }
}

const { rankingTitle } = require('../src/lib/rankingMetrics.ts')

test('league competition player ranking title is League Ranking', () => {
  assert.equal(rankingTitle('league'), 'League Ranking')
})

test('cup competition player ranking title is Cup Ranking', () => {
  assert.equal(rankingTitle('cup'), 'Cup Ranking')
})

test('champions competition player ranking title is Champions Ranking', () => {
  assert.equal(rankingTitle('champions'), 'Champions Ranking')
})

test('all scope ranking title is Global Ranking', () => {
  assert.equal(rankingTitle('all'), 'Global Ranking')
})

test('team scope ranking title is Team Ranking', () => {
  assert.equal(rankingTitle('league', true), 'Team Ranking')
})

test('competition and global ranking screens delegate titles to rankingTitle', () => {
  const competitionScreen = fs.readFileSync('src/screens/CompetitionScreen.tsx', 'utf8')
  const globalRankingScreen = fs.readFileSync('src/screens/GlobalRankingScreen.tsx', 'utf8')
  const homeScreen = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8')

  assert(competitionScreen.includes("rankingTitle('league')"))
  assert(competitionScreen.includes('rankingTitle(type)'))
  assert(globalRankingScreen.includes('rankingTitle(scope, Boolean(teamId))'))
  assert(homeScreen.includes('title="Global Ranking"'))
})
