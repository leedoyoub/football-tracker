const { BASE_SHA } = require('./helpers/v268-baseline.cjs')
process.env.V267_BASE_SHA = BASE_SHA
process.env.V267_SAMPLES = process.env.V268_SAMPLES || '11'
process.env.V267_SCALES = process.env.V268_SCALES || '2,6'
process.env.V267_OUTPUT = process.env.V268_OUTPUT || 'docs/performance/v2.6.8-cpu.json'
process.env.V267_KINDS = process.env.V268_KINDS || 'standings-entry,league-overall,league-history,cup-stage,player-overview,player-matches,editor-input,records,awards,news,latest-changes,season-recap,startup-restore'
require('./v267-performance.bench.cjs')
