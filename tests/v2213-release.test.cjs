const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')

test('v2.3.4 release metadata keeps durable and rating invariants', () => {
  assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).version, '2.3.4')
  assert.match(fs.readFileSync('package-lock.json', 'utf8'), /"version": "2\.3\.4"/)
  assert.match(fs.readFileSync('src/config.ts', 'utf8'), /APP_VERSION = '2\.3\.4'/)
  assert.match(fs.readFileSync('src/engine/ratingRevision.ts', 'utf8'), /RATING_ENGINE_REVISION = 10/)
  assert.match(fs.readFileSync('src/lib/repository.ts', 'utf8'), /STORAGE_KEY = 'football-tracker-v1'/)
})
