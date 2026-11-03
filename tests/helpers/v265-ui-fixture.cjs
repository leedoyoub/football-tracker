// Valid synthetic kickoff history for isolated UI probes; no user storage.
function uiFixture() {
  const { STATIC_TEAMS } = require('../../src/data/teams.ts')
  const { tacticalSlotsForFormation, tacticalSlotById } = require('../../src/engine/tacticalSlots.ts')
  const state = { teams: structuredClone(STATIC_TEAMS), players: [], matches: [], competitionStates: [] }
  for (const [ti, team] of state.teams.entries()) {
    const defaults = tacticalSlotsForFormation('4-2-1-3')
    const roster = defaults.map((id, i) => ({ id: `smoke:${team.id}:${i}`, teamId: team.id, name: `Demo ${team.shortName} ${i + 1}`, displayName: `Demo ${i + 1}`, position: tacticalSlotById[id].ratingPosition, number: i + 1 }))
    state.players.push(...roster)
    for (let day = 1; day <= 32; day++) {
      const formation = day <= 20 || day > 30 ? '4-2-1-3' : '4-3-3'
      const ids = tacticalSlotsForFormation(formation)
      const kickoffLineup = ids.map((id, i) => ({ ...tacticalSlotById[id], id, matchPosition: tacticalSlotById[id].ratingPosition, playerId: roster[i].id }))
      const type = day <= 30 ? 'league' : day === 31 ? 'cup' : 'champions'
      state.matches.push({ id: `smoke:${ti}:${day}`, season: 'Season 1', date: `2026-${day > 30 ? '02' : '01'}-${String(day > 30 ? day - 30 : day).padStart(2, '0')}`, recordedAt: ti * 32 + day, duration: 90, teamId: team.id, homeTeamId: team.id, awayTeamId: `opponent:${ti}`, competitionType: type, competitionStage: type === 'league' ? 'regular' : type === 'cup' ? 'stage1' : 'roundOf16', matchDay: day <= 30 ? day : 1, ...(type === 'champions' ? { competitionPairingId: `roundOf16:${Math.floor(ti / 2)}`, competitionSeriesGame: 1 } : {}), formation, kickoffLineup, appearances: kickoffLineup.map(s => ({ playerId: s.playerId, teamId: team.id, position: s.matchPosition, matchPosition: s.matchPosition, role: 'starter' })), events: [{ id: `goal:${ti}:${day}`, type: 'goal', minute: 10, teamId: team.id, playerId: roster[9].id, assistPlayerId: roster[7].id }] })
    }
  }
  state.competitionStates.push({ id: 'smoke-draw', season: 'Season 1', kind: 'champions-draw', teamIds: state.teams.map(team => team.id) })
  if (!require('../../src/lib/validation.ts').validateState(state)) throw Error('Invalid synthetic UI fixture')
  return state
}
module.exports = { uiFixture }
