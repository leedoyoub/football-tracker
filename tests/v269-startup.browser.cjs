process.env.V267_BASE_SHA = '6be9bf45d08983cb6f37003f7c9685981abda3c7'
process.env.V267_BASELINE_DIST = '.superpowers/sdd/v269/baseline-dist'
process.env.V267_SAMPLES = process.env.V269_SAMPLES || '11'
process.env.V267_FIXTURE_SEASONS = '2'
process.argv[2] ||= 'docs/performance/v2.6.9-startup.json'
require('./v267-startup.browser.cjs')
