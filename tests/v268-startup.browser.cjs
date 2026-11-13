const { BASE_SHA } = require('./helpers/v268-baseline.cjs')
process.env.V267_BASE_SHA = BASE_SHA
process.env.V267_SAMPLES = process.env.V268_SAMPLES || '11'
process.env.V267_FIXTURE_SEASONS = process.env.V268_STARTUP_SEASONS || '2'
process.env.V267_BASELINE_DIST = '.superpowers/sdd/v268/baseline-dist'
process.argv[2] ||= 'docs/performance/v2.6.8-startup.json'
require('./v267-startup.browser.cjs')
