// Reuse the release's existing CPU/SSR protocol, with the exact v2.6.8 baseline.
process.env.V267_BASE_SHA = '6be9bf45d08983cb6f37003f7c9685981abda3c7'
process.env.V267_SAMPLES = process.env.V269_SAMPLES || '11'
process.env.V267_SCALES = process.env.V269_SCALES || '2,6'
process.env.V267_OUTPUT = process.env.V269_OUTPUT || 'docs/performance/v2.6.9-cpu.json'
process.env.V267_KINDS = process.env.V269_KINDS || 'standings-entry,league-overall,league-history,cup-stage,player-overview,player-matches,editor-input,awards,startup-restore'
require('./v267-performance.bench.cjs')
