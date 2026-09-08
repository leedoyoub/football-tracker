const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { TEAM_ROSTER_LIMIT, RosterCapacityError, assertRosterCapacity, currentTeamIds, rosterCount } = require('../src/lib/roster.ts')

const player = (id, teamIds = []) => ({ id, name: id, position: 'CM', number: 1, teamId: teamIds[0] || '', teamIds })

test('roster capacity accepts a 23rd player and rejects a 24th without touching existing memberships', () => {
  const twentyTwo = Array.from({ length: 22 }, (_, index) => player(`p${index}`, ['A']))
  assert.equal(rosterCount(twentyTwo, 'A'), 22)
  assert.doesNotThrow(() => assertRosterCapacity(twentyTwo, 'new', [], ['A']))
  const twentyThree = [...twentyTwo, player('p22', ['A'])]
  assert.equal(rosterCount(twentyThree, 'A'), TEAM_ROSTER_LIMIT)
  assert.throws(() => assertRosterCapacity(twentyThree, 'new', [], ['A']), RosterCapacityError)
  assert.doesNotThrow(() => assertRosterCapacity(twentyThree, 'p0', ['A'], ['A']))
  assert.deepEqual(currentTeamIds(player('free')), [])
})

test('mobile zoom prevention is configured globally without screen-specific handlers', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8')
  const css = fs.readFileSync(require.resolve('../src/index.css'), 'utf8')
  const main = fs.readFileSync(require.resolve('../src/main.tsx'), 'utf8')
  const newPlayer = fs.readFileSync(require.resolve('../src/screens/NewPlayerScreen.tsx'), 'utf8')
  assert(html.includes('maximum-scale=1.0') && html.includes('user-scalable=no'))
  assert(css.includes('touch-action: pan-x pan-y') && css.includes('font-size: 16px !important'))
  assert(main.includes('gesturestart') && main.includes('passive: false'))
  assert(newPlayer.includes('No Team') && newPlayer.includes('Full (${TEAM_ROSTER_LIMIT}/${TEAM_ROSTER_LIMIT})'))
})
