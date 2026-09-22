const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { POSITION_RULES } = require('../src/engine/rating.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')

test('rating revision 9 exposes the exact approved position rules', () => {
  assert.equal(RATING_ENGINE_REVISION, 9)
  const expected = {
    ST: [.90, .55, 0, 0, 0], LST: [.90, .55, 0, 0, 0], RST: [.90, .55, 0, 0, 0],
    SS: [.90, .55, 0, 0, 0],
    LW: [1, .65, .05, 0, 0], RW: [1, .65, .05, 0, 0], CAM: [1, .65, .05, 0, 0],
    LM: [1.05, .65, .05, .15, -.10], RM: [1.05, .65, .05, .15, -.10],
    CM: [1.05, .65, .07, .25, -.10], LCM: [1.05, .65, .07, .25, -.10], RCM: [1.05, .65, .07, .25, -.10],
    CDM: [1.15, .70, .06, .50, -.15], LDM: [1.15, .70, .06, .50, -.15], RDM: [1.15, .70, .06, .50, -.15],
    LB: [1.25, .70, .04, 1, -.30], LWB: [1.25, .70, .04, 1, -.30], RB: [1.25, .70, .04, 1, -.30], RWB: [1.25, .70, .04, 1, -.30],
    CB: [1.35, .75, 0, 1.30, -.35], LCB: [1.35, .75, 0, 1.30, -.35], RCB: [1.35, .75, 0, 1.30, -.35],
    GK: [1.50, 1, 0, 0, -.35],
  }
  for (const [position, values] of Object.entries(expected)) {
    const rule = POSITION_RULES[position]
    assert.deepEqual([rule.goal, rule.assist, rule.teamGoal, rule.suppressionMax, rule.conceded], values, position)
  }
})
