const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { POSITION_RULES } = require('../src/engine/rating.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')

test('rating revision 14 exposes the exact approved position rules', () => {
  assert.equal(RATING_ENGINE_REVISION, 14)
  const expected = {
    ST: [.80, .50, 0, 0, 0], LST: [.80, .50, 0, 0, 0], RST: [.80, .50, 0, 0, 0],
    SS: [.80, .50, 0, 0, 0],
    LW: [1, .65, .04, 0, 0], RW: [1, .65, .04, 0, 0], CAM: [1, .65, .02, 0, 0],
    LM: [1.05, .65, .05, .30, -.10], RM: [1.05, .65, .05, .30, -.10],
    CM: [1.05, .65, .07, .25, -.08], LCM: [1.05, .65, .07, .25, -.08], RCM: [1.05, .65, .07, .25, -.08],
    CDM: [1.15, .70, .06, .85, -.15], LDM: [1.15, .70, .06, .85, -.15], RDM: [1.15, .70, .06, .85, -.15],
    LB: [1.25, .70, .03, 1, -.25], LWB: [1.25, .70, .03, 1, -.25], RB: [1.25, .70, .03, 1, -.25], RWB: [1.25, .70, .03, 1, -.25],
    CB: [1.35, .75, 0, 1.40, -.35], LCB: [1.35, .75, 0, 1.40, -.35], RCB: [1.35, .75, 0, 1.40, -.35],
    GK: [1.50, 1, 0, 0, -.30],
  }
  for (const [position, values] of Object.entries(expected)) {
    const rule = POSITION_RULES[position]
    assert.deepEqual([rule.goal, rule.assist, rule.teamGoal, rule.suppressionMax, rule.conceded], values, position)
  }
})
