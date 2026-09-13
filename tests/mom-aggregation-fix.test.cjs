
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { getMatchManOfTheMatch } = require('../src/engine/rating.ts')
const { aggregatePlayerStats } = require('../src/engine/stats.ts')

// Mock data
const playerA = { id: 'a', name: 'A', position: 'ST' };
const playerB = { id: 'b', name: 'B', position: 'ST' };
const players = [playerA, playerB];

function createMatch(id, momId, events = []) {
  return {
    id,
    season: '2026',
    date: '2026-09-14',
    matchDay: 1,
    homeTeamId: 'team1',
    awayTeamId: 'team2',
    appearances: [
      { playerId: 'a', teamId: 'team1', role: 'starter', matchPosition: 'ST' },
      { playerId: 'b', teamId: 'team1', role: 'starter', matchPosition: 'ST' }
    ],
    events,
    formation: '4-3-3',
    duration: 90
  };
}

test('Global Ranking MOM aggregation updates correctly after rating revision', () => {
  // Initially, A is MOM (based on events)
  const match1 = createMatch('m1', 'a', [
    { type: 'goal', playerId: 'a', teamId: 'team1', minute: 10, ownGoal: false, id: 'g1' }
  ]);
  
  // Recalculation changes MOM to B
  const match1Revised = createMatch('m1', 'b', [
    { type: 'goal', playerId: 'b', teamId: 'team1', minute: 10, ownGoal: false, id: 'g2' },
    { type: 'goal', playerId: 'b', teamId: 'team1', minute: 20, ownGoal: false, id: 'g3' }
  ]);

  const matches = [match1Revised];
  
  // Re-calculate MOM
  const momA = getMatchManOfTheMatch(match1Revised, players) === 'a';
  const momB = getMatchManOfTheMatch(match1Revised, players) === 'b';
  
  assert(!momA, 'A should not be MOM');
  assert(momB, 'B should be MOM');

  // Verify aggregation
  const statsA = aggregatePlayerStats(playerA, players, matches);
  const statsB = aggregatePlayerStats(playerB, players, matches);
  
  assert.strictEqual(statsA.mom, 0, 'A should have 0 MOM');
  assert.strictEqual(statsB.mom, 1, 'B should have 1 MOM');
});
