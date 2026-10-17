require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { screenHarness } = require('./helpers/v259-harness.cjs')
test('temporary screen harness modules do not retain fixture Stores in module.children', () => {
  const parent = require.cache[require.resolve('./helpers/v259-harness.cjs')], before = parent.children.length
  for (let i = 0; i < 10; i++) screenHarness(path.resolve(__dirname, '..'), 'screens/TeamDetailScreen.tsx', 'competitionProgressLines', { fixture: i }).render('Champion')
  assert.equal(parent.children.length, before)
})
