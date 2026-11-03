// Repeatable derived-award timings; synthetic data only, no browser storage.
require('./register-ts.cjs')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const { performanceFixture } = require('./v255-fixture.cjs')
const root = path.resolve(__dirname, '../..'), temporaryRoot = path.resolve(os.tmpdir())
const directory = fs.mkdtempSync(path.join(temporaryRoot, 'football-v265-measure-'))
const verify = () => { if (!path.resolve(directory).startsWith(temporaryRoot + path.sep)) throw new Error('Unexpected measurement directory') }
verify()
execFileSync('tar', ['-xf', '-', '-C', directory], { input: execFileSync('git', ['archive', 'daefede', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const old = file => require(path.join(directory, 'src', file))
const current = file => require(path.join(root, 'src', file))
const time = fn => { const start = performance.now(); fn(); return +(performance.now() - start).toFixed(3) }
const results = []
try {
  for (const [version, moduleFor] of [['2.6.4', old], ['2.6.5', current]]) {
    const s = performanceFixture(1)
    s.matches.forEach(match => { match.formation = '4-3-3' })
    const a = moduleFor('engine/awards.ts'), history = moduleFor('engine/historyReadModels.ts'), team = moduleFor('engine/teamHistory.ts'), race = moduleFor('engine/awardRacePresentation.ts')
    const season = () => a.seasonAwards('Season 1', s.teams, s.players, s.matches, s.competitionStates)
    results.push({ version, scenario: 'Season Best XI cold', ms: time(season) })
    results.push({ version, scenario: 'Season Best XI warm', ms: time(season) })
    results.push({ version, scenario: 'Award Race full order warm', ms: time(() => race.awardRaceCandidates(season().candidates)) })
    results.push({ version, scenario: 'Records History season open', ms: time(() => history.historyTimelineForSeason(s.teams, s.players, s.matches, s.competitionStates, 'Season 1')) })
    results.push({ version, scenario: 'Team History Best XI cold', ms: time(() => team.teamHistoryBestXI(s.players, s.matches, { teamId: s.teams[0].id, season: 'Season 1', competition: 'all' })) })
    s.matches[0] = { ...s.matches[0], events: s.matches[0].events.slice(1) }
    results.push({ version, scenario: 'One match edit then Season XI', ms: time(season) })
    if (a.awardResultForScope) {
      const half = scope => a.awardResultForScope(scope, 'Season 1', s.teams, s.players, s.matches, s.competitionStates)
      results.push({ version, scenario: 'First/Second Half cold switch', ms: time(() => { half('first-half'); half('second-half') }) })
      results.push({ version, scenario: 'First/Second Half warm switch', ms: time(() => { half('first-half'); half('second-half') }) })
    }
    const many = performanceFixture(3)
    results.push({ version, scenario: 'Three-season official records', ms: time(() => moduleFor('engine/officialAwards.ts').officialAwardSeasons(many.matches, many.competitionStates).forEach(season => moduleFor('engine/officialAwards.ts').officialAwardsForSeason(many.teams, many.players, many.matches, many.competitionStates, season))) })
  }
  process.stdout.write(JSON.stringify({ players: 367, matchesPerSeason: 576, results }, null, 2) + '\n')
} finally { verify(); fs.rmSync(directory, { recursive: true, force: true }) }
