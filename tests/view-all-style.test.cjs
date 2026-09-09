const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')

const read = (file) => fs.readFileSync(require.resolve(`../src/${file}`), 'utf8')

test('every existing View All uses one compact secondary-action style', () => {
  const css = read('index.css')
  assert(css.includes('.secondary-view-all'))
  assert(css.includes('min-height: 32px'))
  assert(css.includes('font-size: 10px'))
  for (const file of ['screens/HomeScreen.tsx', 'screens/CompetitionScreen.tsx', 'screens/RecordsScreen.tsx', 'screens/TeamDetailScreen.tsx']) {
    const source = read(file)
    assert(source.includes('secondary-view-all'), `${file} should use the shared View All style`)
    assert(!source.includes('className="text-xs font-semibold text-emerald-400">View All'), `${file} should not retain the old prominent View All style`)
  }
})
