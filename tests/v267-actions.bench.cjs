require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { applyMatchMetadata } = require('../src/lib/matchMetadata.ts')
const { projectStandings, nextStandingSort } = require('../src/lib/standingSort.ts')
const { leagueCompetition } = require('../src/engine/competition.ts')
const { recordedTeamId, recordedOpponentId } = require('../src/engine/matchPerspective.ts')
const samples = Number(process.env.V267_SAMPLES || 11), output = process.argv[2] || 'docs/performance/v2.6.7-actions.json'
const summarize = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values } }
const report = { node: process.version, cpu: os.cpus()[0].model, samples, method: 'New feature CPU cost only: no baseline equivalent. Independent synthetic fixture per sample, GC/setup outside timing. Metadata is canonical Champions G3 -> free next-season League MD1 validation, excluding persistence I/O. Sorting is eight metric defaults/reversals plus official reset on 16 already-derived rows, no engine recomputation.', scales: {} }
for (const count of [2, 6]) {
  const metadata = [], sorting = []
  for (let sample = 0; sample < samples; sample++) {
    global.gc?.()
    const state = performanceFixture(count), source = state.matches.at(-1)
    const proposal = { assignment: { competitionType: 'league', season: `Season ${count + 1}`, stage: 'regular', matchDay: 1, teamId: recordedTeamId(source), opponentTeamId: recordedOpponentId(source) }, date: source.date }
    let start = performance.now(); const edited = applyMatchMetadata(source, proposal, state); metadata.push(performance.now() - start)
    assert.equal(edited.id, source.id); assert.strictEqual(edited.events, source.events); assert.strictEqual(edited.appearances, source.appearances)
    const rows = leagueCompetition(state.teams, state.matches, `Season ${count}`, state.players).standings, before = structuredClone(rows)
    start = performance.now()
    let sort = null
    for (const metric of ['played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points']) for (let direction = 0; direction < 2; direction++) { sort = nextStandingSort(sort, metric); projectStandings(rows, sort) }
    projectStandings(rows, nextStandingSort(sort, 'rank')); sorting.push(performance.now() - start)
    assert.deepEqual(rows, before)
  }
  report.scales[count] = { metadataValidation: summarize(metadata), allSortDirectionsAndReset: summarize(sorting) }
}
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.scales).map(([scale, value]) => [scale, { metadataMedianMs: value.metadataValidation.medianMs, sortMedianMs: value.allSortDirectionsAndReset.medianMs }]))))
