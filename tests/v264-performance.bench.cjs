require('./helpers/register-ts.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const root = path.resolve(__dirname, '..')
const sha = 'e97d391fc763f5f146cc116e25fb2aad60189fd9'
const kinds = ['news', 'latest-changes', 'league-history', 'season-analytics', 'honors', 'official-events', 'records', 'team-records', 'home-awards', 'team-best-xi', 'competition-ranking']
const samples = Number(process.env.V264_SAMPLES || 3)
const output = process.env.V264_OUTPUT || path.join(root, 'docs/performance/v2.6.4-engine.json')
const results = {
  baseSha: sha, node: process.version, cpu: os.cpus()[0].model, samples,
  method: 'Paired alternating baseline/current queries on independent deterministic 1- and 3-season fixtures; isolated process per operation; GC outside timed regions. CPU derivation only, excludes browser rendering/paint. SHA256 of every cold/filter/edit/delete result must match baseline. Immutable edit/delete follows Store flow; same-array replacement correctness is separately tested.',
  stages: { cold: 'first query', warm: 'unchanged query', filter: 'league and CB selection plus goals metric for rankings; no-op for operations without filters', edit: 'replace latest first-team league match with last event removed using a new array', delete: 'remove the edited match using a new array' },
  bestXICaveat: 'Both versions seed saved kickoff formation 4-2-3-1. Only XI coordinates and slot presentation order may change; all selected slot/player facts, scores, formation and eligibility are compared. Maps are hashed as ordered entries. Browser rendering is excluded.',
  scales: {},
}
const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)]
const digest = value => createHash('sha256').update(JSON.stringify(value, (_, item) => item instanceof Map ? { mapEntries: [...item] } : item instanceof Set ? { setEntries: [...item] } : item)).digest('hex')
const time = fn => {
  const start = performance.now(), value = fn(), ms = performance.now() - start
  const normalized = process.env.V264_ONLY === 'team-best-xi' ? { ...value, bestXI: value.bestXI.map(({ x: _x, y: _y, ...slot }) => slot).sort((a, b) => a.slot.localeCompare(b.slot)) } : value
  return { ms, hash: digest(normalized) }
}
function write() { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(results, null, 2) + '\n') }

if (!process.env.V264_ONLY) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v264-results-'))
  if (!temporary.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error('Unsafe temporary path')
  try {
    for (const [index, kind] of kinds.entries()) {
      const childOutput = path.join(temporary, `${index}.json`)
      execFileSync(process.execPath, ['--expose-gc', __filename], { cwd: root, env: { ...process.env, V264_ONLY: kind, V264_OUTPUT: childOutput }, stdio: 'inherit' })
      const child = JSON.parse(fs.readFileSync(childOutput, 'utf8'))
      for (const seasons of ['1', '3']) Object.assign(results.scales[seasons] ??= {}, child.scales[seasons])
      write()
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
  process.exit(0)
}

const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v264-baseline-'))
if (!baseline.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error('Unsafe baseline path')
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: execFileSync('git', ['archive', sha, 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
function api(directory, kind) {
  const read = file => require(path.join(directory, 'src/engine', file + '.ts'))
  return { awards: read('officialAwards'), ...(['honors', 'team-best-xi'].includes(kind) ? { history: read('teamHistory') } : {}), analytics: read('seasonAnalytics'), news: read('news'), records: read('awardRecords'), team: read('teamAwardRecords'), stats: read('stats'), competition: read('competition'), season: read('awards'), latest: read('latestChanges') }
}
try {
  const kind = process.env.V264_ONLY
  const apis = { before: api(baseline, kind), after: api(root, kind) }
  for (const seasons of [1, 3]) {
    const rows = { before: [], after: [] }
    for (let sample = 0; sample < samples; sample++) {
      const hashes = {}
      for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
        global.gc?.()
        const s = performanceFixture(seasons), a = apis[side], season = `Season ${seasons}`
        for (const match of s.matches) match.formation = '4-2-3-1'
        const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
        let metric = 'rating', positions = kind === 'filtered-ranking-entry' ? ['CB'] : []
        const run = () => {
          if (kind === 'honors') return a.history.teamHistoryHonors(s.teams, s.players, s.matches, s.competitionStates, s.teams[0].id, scope.competition)
          if (kind === 'news') return a.news.deriveFootballEvents(s.players, s.teams, s.matches, s.competitionStates)
          if (kind === 'league-history') return a.analytics.buildLeagueHistory(s.teams, s.players, s.matches, season)
          if (kind === 'season-analytics') return a.analytics.buildSeasonAnalytics(s.teams, s.players, s.matches, season)
          if (kind === 'team-best-xi') return a.history.teamHistoryBestXI(s.players, s.matches, { teamId: s.teams[0].id, season, competition: scope.competition })
          if (kind === 'official-events') return a.awards.officialAwardSeasons(s.matches, s.competitionStates).flatMap(value => a.awards.officialSeasonModel(s.teams, s.players, s.matches, s.competitionStates, value).events)
          if (kind === 'records') return a.records.awardRecordGroups(s.teams, s.players, s.matches, s.competitionStates, scope)
          if (kind === 'team-records') return a.team.teamIndividualAwardRecordGroups(a.team.scopedIndividualAwardEvents(s.teams, s.players, s.matches, s.competitionStates, scope), s.teams)
          if (kind === 'competition-ranking' || kind === 'filtered-ranking-entry') return a.stats.rankGlobalRankingRows(a.stats.buildGlobalRankingData(s.players, a.competition.competitionMatches(s.matches, season, 'league'), { seasons: [season], teams: [], positions }, 'rating'), s.players, metric)
          if (kind === 'home-awards') return a.season.seasonAwards(season, s.teams, s.players, s.matches, s.competitionStates)
          return a.latest.deriveLatestChanges(s.players, s.teams, s.matches, s.competitionStates, season)
        }
        const measured = run
        const cold = time(measured), warm = time(measured)
        scope.competition = 'league'; scope.positionFilter = 'cb'; positions = ['CB']; metric = 'goals'
        const filter = time(measured)
        const editIndex = s.matches.findLastIndex(match => match.teamId === s.teams[0].id && match.season === season && match.competitionType === 'league')
        s.matches = s.matches.map((match, index) => index === editIndex ? { ...match, events: match.events.slice(0, -1) } : match)
        const edit = time(measured)
        s.matches = s.matches.filter((_, index) => index !== editIndex)
        const deletion = time(measured)
        const stages = { cold, warm, filter, edit, delete: deletion }
        rows[side].push(Object.fromEntries(Object.entries(stages).map(([name, result]) => [name, result.ms])))
        hashes[side] = Object.fromEntries(Object.entries(stages).map(([name, result]) => [name, result.hash]))
      }
      assert.deepEqual(hashes.after, hashes.before, `${kind}: public results must remain equal to v2.6.3`)
    }
    const data = { equivalentToBaseline: kind === 'team-best-xi' ? 'all selected player/slot facts; presentation-only coordinates and order excluded' : true, fixture: { seasons, matches: performanceFixture(seasons).matches.length, players: 367, teams: 16 } }
    for (const side of ['before', 'after']) {
      data[side] = Object.fromEntries(['cold', 'warm', 'filter', 'edit', 'delete'].map(stage => [stage, median(rows[side].map(row => row[stage]))]))
      data[side].samplesMs = rows[side]
    }
    results.scales[seasons] = { [kind]: data }
    console.log(`${seasons} season ${kind}: cold ${data.before.cold.toFixed(2)} -> ${data.after.cold.toFixed(2)} ms; warm ${data.before.warm.toFixed(3)} -> ${data.after.warm.toFixed(3)}; filter ${data.before.filter.toFixed(2)} -> ${data.after.filter.toFixed(2)}; edit ${data.before.edit.toFixed(2)} -> ${data.after.edit.toFixed(2)}; delete ${data.before.delete.toFixed(2)} -> ${data.after.delete.toFixed(2)}; results identical${kind === 'team-best-xi' ? ' except placement' : ''}`)
    write()
  }
} finally { fs.rmSync(baseline, { recursive: true, force: true }) }
