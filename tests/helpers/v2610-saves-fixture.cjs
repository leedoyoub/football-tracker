const players = ['p', 'q'].map(id => ({ id, name: `Save display ${id}`, position: 'CB', number: id === 'p' ? 1 : 2, teamId: 'B' }))
const teams = ['A', 'B'].map(id => ({ id, name: id, shortName: id }))
const save = (id, changes = {}) => ({ id, type: 'save', playerId: 'p', teamId: 'A', minute: 30, ...changes })
function game(id, events = [], appearance = {}) {
  return { id, season: 'S1', date: '2020-01-01', matchDay: 1, duration: 90, competitionType: 'league', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B',
    appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: 'CB', matchPosition: 'GK', ...appearance }, { playerId: 'q', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }], events }
}
function cases() {
  return [
    { match: game('zero'), want: 0 },
    { match: game('legacy-one', [save('old')]), want: 1 },
    { match: game('count-six', [save('six', { count: 6 })]), want: 6 },
    { match: game('mixed-six', [save('three', { count: 3 }), save('two', { count: 2 }), save('one')]), want: 6 },
    { match: game('legacy-no-minute', [save('old', { minute: undefined })]), want: 1 },
    { match: game('invalid-counts', [0, -1, 1.5, NaN, null].map((count, i) => save(`bad:${i}`, { count }))), want: 0 },
    { match: game('wrong-identity', [save('wrong-player', { playerId: 'q' }), save('wrong-team', { teamId: 'B' })]), want: 0 },
    { match: game('not-gk', [save('wrong-role', { count: 9 })], { matchPosition: 'CM' }), want: 0 },
    { match: game('changed-position', [save('before', { minute: 30, count: 9 }), save('during', { minute: 60, count: 2 }), save('after', { minute: 80, count: 9 })], { matchPosition: 'CM', positionHistory: [{ minute: 45, position: 'GK' }, { minute: 75, position: 'CM' }] }), want: 2 },
    { match: game('unused', [save('unused-save')], { role: 'bench' }), want: 0 },
    { match: game('substitute', [save('before', { minute: 20, count: 9 }), { id: 'on', type: 'sub', teamId: 'A', minute: 60, playerOutId: 'q', playerInId: 'p' }, save('during', { minute: 70, count: 3 })], { role: 'bench' }), want: 3 },
    { match: game('all-contributions', [{ id: 'goal', type: 'goal', playerId: 'p', teamId: 'A', minute: 10 }, { id: 'assist', type: 'goal', playerId: 'q', assistPlayerId: 'p', teamId: 'A', minute: 20 }, save('two', { count: 2 })]), want: 2 },
  ]
}
module.exports = { players, teams, game, save, cases }
