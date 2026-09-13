const path = require('path');
const { getMostRecentStartingLineup } = require('../src/engine/recentLineup.ts');
const assert = require('assert');
const { test } = require('node:test');

// Mock Data
const mockMatch1 = {
  id: 'm1',
  season: 'Season 1',
  matchDay: 1,
  date: '2026-09-01',
  homeTeamId: 't1',
  awayTeamId: 't2',
  teamId: 't1',
  duration: 90,
  appearances: [
    { playerId: 'p1', teamId: 't1', role: 'starter', matchPosition: 'GK' },
    { playerId: 'p2', teamId: 't1', role: 'starter', matchPosition: 'LB' },
    { playerId: 'p3', teamId: 't1', role: 'starter', matchPosition: 'LCB' },
    { playerId: 'p4', teamId: 't1', role: 'starter', matchPosition: 'RCB' },
    { playerId: 'p5', teamId: 't1', role: 'starter', matchPosition: 'RB' },
    { playerId: 'p6', teamId: 't1', role: 'starter', matchPosition: 'LCM' },
    { playerId: 'p7', teamId: 't1', role: 'starter', matchPosition: 'CM' },
    { playerId: 'p8', teamId: 't1', role: 'starter', matchPosition: 'RCM' },
    { playerId: 'p9', teamId: 't1', role: 'starter', matchPosition: 'LW' },
    { playerId: 'p10', teamId: 't1', role: 'starter', matchPosition: 'ST' },
    { playerId: 'p11', teamId: 't1', role: 'starter', matchPosition: 'RW' },
  ],
  events: []
};

test('recent lineup is correctly fetched', () => {
    const result = getMostRecentStartingLineup([mockMatch1], 't1');
    assert.ok(result, 'Result should not be null');
    assert.strictEqual(result['GK'], 'p1');
    assert.strictEqual(result['ST'], 'p10');
});
