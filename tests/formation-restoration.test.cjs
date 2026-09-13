const assert = require('assert');
const { test } = require('node:test');

// Mocking dependencies
const mockSlots = [
  { slot: 'GK', matchPosition: 'GK' },
  { slot: 'LB', matchPosition: 'LB' },
  { slot: 'LCB', matchPosition: 'LCB' },
  { slot: 'RCB', matchPosition: 'RCB' },
  { slot: 'RB', matchPosition: 'RB' },
  { slot: 'LCM', matchPosition: 'LCM' },
  { slot: 'CM', matchPosition: 'CM' },
  { slot: 'RCM', matchPosition: 'RCM' },
  { slot: 'LW', matchPosition: 'LW' },
  { slot: 'ST', matchPosition: 'ST' },
  { slot: 'RW', matchPosition: 'RW' },
];

// Re-implement the logic with mocked slots
function getMostRecentStartingLineup(matches, teamId) {
  const teamMatches = matches
    .filter((m) => m.teamId === teamId || (!m.teamId && (m.homeTeamId === teamId || m.awayTeamId === teamId)))
    .sort((a, b) => {
      const seasonA = parseInt(a.season.replace('Season ', '')) || 0;
      const seasonB = parseInt(b.season.replace('Season ', '')) || 0;
      return seasonB - seasonA || b.matchDay - a.matchDay;
    });

  for (const match of teamMatches) {
    const starters = match.appearances.filter(a => a.role === 'starter' && a.teamId === teamId);
    if (starters.length === 11) {
      const slotAssignments = {};
      let possible = true;
      for (const a of starters) {
        const slot = mockSlots.find(s => s.matchPosition === a.matchPosition);
        if (slot) {
          slotAssignments[slot.slot] = a.playerId;
        } else {
          possible = false;
          break;
        }
      }
      if (possible && Object.keys(slotAssignments).length === 11) {
        return slotAssignments;
      }
    }
  }
  return null;
}

const mockMatch = {
  id: 'm1',
  season: 'Season 1',
  teamId: 't1',
  homeTeamId: 't1',
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
};

test('recent lineup correctly maps matchPosition to slot', () => {
    const result = getMostRecentStartingLineup([mockMatch], 't1');
    assert.strictEqual(result['GK'], 'p1');
    assert.strictEqual(result['ST'], 'p10');
    assert.strictEqual(result['LW'], 'p9');
});
