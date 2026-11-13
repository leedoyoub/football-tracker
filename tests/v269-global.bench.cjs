require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), os = require('node:os')
const { createHash } = require('node:crypto')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { baselineRoot, BASE_SHA } = require('./v269-derived-baseline.cjs')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..'), baseline = baselineRoot(), samples = Number(process.env.V269_SAMPLES || 11)
const phases = ['cold', 'warm', 'revisit', 'position', 'team', 'metric', 'edit']
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const summary = values => { const sorted = values.slice().sort((a,b)=>a-b); return { medianMs: sorted[Math.floor(sorted.length/2)], p95Ms: sorted[Math.ceil(sorted.length*.95)-1], samplesMs: values } }
const report = { baseSha: BASE_SHA, samples, node: process.version, cpu: os.cpus()[0].model, method: 'Actual GlobalRankingScreen CPU hook lifecycle, unchanged 2/6-season fixture, alternating release order with independent source. No React DOM/paint. Loading/transpilation, fixture construction, GC and result hashing excluded. Warm repeats unchanged props; revisit new component hooks on same saved references; position switches to ST/SS; team selects first historical team; metric switches Rating to Goals; edit immutably removes latest selected-season first-team League goal. Old team-filtered output intentionally has different ranks, so exact desired-output reference is independently calculated with archived official full-population statistics, canonical hasPitchAppearance membership and archived sort before display projection outside timing. All after rows (ID, rank, raw value, rating/goals/assists/MOM/minutes/position) hash equal that reference. Before team timings retain the old narrowed calculation semantics and must be read with that behavior change.', scales: {} }
function operation(directory, fixture, season) {
  const nav = require(path.join(directory,'src/lib/navigation.ts'))
  let screenState = { ...nav.defaultScreenState({ name: 'global-ranking' }), scope: 'league' }
  let h = screenHarness(directory,'screens/GlobalRankingScreen.tsx','GlobalRankingScreen',fixture)
  return {
    get screenState() { return screenState },
    prepare(phase) {
      if (phase === 'revisit') h = screenHarness(directory,'screens/GlobalRankingScreen.tsx','GlobalRankingScreen',fixture)
      if (phase === 'position') screenState = { ...screenState, positionFilter: 'st-ss' }
      if (phase === 'team') screenState = { ...screenState, teamId: fixture.teams[0].id, ...(directory === root ? { teamIds: fixture.teams.slice(0,1).map(t=>t.id) } : {}) }
      if (phase === 'metric') screenState = { ...screenState, metric: 'goals' }
      if (phase === 'edit') {
        const at = fixture.matches.findLastIndex(m=>m.season===season&&m.teamId===fixture.teams[0].id&&m.competitionType==='league')
        fixture.matches = fixture.matches.map((m,i)=>i===at?{...m,events:m.events.filter(e=>e.id!==m.events.findLast(e=>e.type==='goal')?.id)}:m)
      }
    },
    run() { return nodes(h.render({ season, screenState, onStateChange(){}, onNavigate(){}, onBack(){} }),n=>n.type?.name==='VirtualRankingList')[0].props.rows },
  }
}
const shape = (rows, isNew) => rows.map((r,i)=>({ id:r.playerId, rank:isNew?r.rank:i+1, value:r.value, avgRating:r.avgRating, goals:r.goals, assists:r.assists, mom:r.mom, minutes:r.minutes, position:r.scopedPositionFamily }))
for (const count of [2,6]) {
  const timings = { before: {}, after: {} }, hashes = []
  for (let sample=0;sample<samples;sample++) {
    const states = { before: performanceFixture(count), after: performanceFixture(count) }, operations = {}
    for (const side of ['before','after']) operations[side] = operation(side==='before'?baseline:root,states[side],`Season ${count}`)
    const results = {}
    for (const side of sample%2?['after','before']:['before','after']) {
      results[side] = {}
      for (const phase of phases) {
        operations[side].prepare(phase); global.gc?.()
        const start=performance.now(), value=operations[side].run(), elapsed=performance.now()-start
        ;(timings[side][phase]??=[]).push(elapsed)
        results[side][phase] = shape(value,side==='after')
      }
    }
    // Recreate each intended population independently from the archived engine.
    const source = file=>require(path.join(baseline,'src/engine',file+'.ts'))
    const referenceState = performanceFixture(count), referenceHashes = {}
    for (const phase of phases) {
      if(phase==='edit') {
        const at=referenceState.matches.findLastIndex(m=>m.season===`Season ${count}`&&m.teamId===referenceState.teams[0].id&&m.competitionType==='league')
        referenceState.matches=referenceState.matches.map((m,i)=>i===at?{...m,events:m.events.filter(e=>e.id!==m.events.findLast(e=>e.type==='goal')?.id)}:m)
      }
      const positioned=['position','team','metric','edit'].includes(phase), teamed=['team','metric','edit'].includes(phase)
      const games=referenceState.matches.filter(m=>m.season===`Season ${count}`&&m.competitionType==='league')
      const data=source('stats').buildGlobalRankingData(referenceState.players,games,{seasons:[],teams:[],positions:positioned?['ST','SS']:[]},'rating')
      let expected=shape(source('stats').rankGlobalRankingRows(data,referenceState.players,['metric','edit'].includes(phase)?'goals':'rating'),false)
      if(teamed){ const ids=new Set(games.flatMap(m=>m.appearances.filter(a=>referenceState.teams.slice(0,1).some(t=>t.id===a.teamId)&&source('timeline').hasPitchAppearance(m,a)).map(a=>a.playerId)));expected=expected.filter(r=>ids.has(r.id)) }
      assert.deepEqual(results.after[phase],expected,`${count}:${sample}:${phase}`)
      referenceHashes[phase]=digest(expected)
    }
    hashes.push(referenceHashes)
  }
  report.scales[count]={...Object.fromEntries(['before','after'].map(side=>[side,Object.fromEntries(phases.map(phase=>[phase,summary(timings[side][phase])]))])),exactReferenceHashes:hashes}
  fs.writeFileSync('docs/performance/v2.6.9-global.json',JSON.stringify(report,null,2)+'\n')
  console.log(`${count} seasons Global cold ${report.scales[count].before.cold.medianMs.toFixed(2)} -> ${report.scales[count].after.cold.medianMs.toFixed(2)} ms`)
}
