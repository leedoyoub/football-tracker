// Deterministic synthetic history; never reads the user's browser storage.
function performanceFixture(seasonCount = 2) {
  const { STATIC_TEAMS } = require('../../src/data/teams.ts')
  const teams = structuredClone(STATIC_TEAMS)
  const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'ST', 'RW', 'ST', 'CM', 'CB', 'RW', 'LB', 'CAM', 'CDM', 'LW', 'RB', 'SS', 'GK', 'CM']
  const rosters = teams.map(team => positions.map((position, number) => ({ id: `${team.id}:${number}`, name: `Synthetic ${team.id} ${number}`, teamId: team.id, position, number: number + 1 })))
  const players = rosters.flat()
  const matches = []
  const competitionStates = []
  function game(season, teamIndex, day, type = 'league', stage = 'regular', seriesGame) {
    const team = teams[teamIndex]; const roster = rosters[teamIndex]
    const opponentId = `opponent:${team.id}`
    const id = `${season}:${teamIndex}:${type}:${stage}:${day}`
    const appearances = roster.map((p, i) => ({ playerId: p.id, teamId: team.id, role: i < 11 ? 'starter' : 'bench', position: p.position, matchPosition: p.position }))
    appearances[7].positionHistory = [{ minute: 60, position: 'CM', sequence: 3 }, { minute: 80, position: 'CAM', sequence: 8 }]
    const events = [
      { id: `${id}:opener`, type: 'goal', minute: 10, teamId: opponentId },
      { id: `${id}:equalizer`, type: 'goal', minute: 20, teamId: team.id, playerId: roster[9].id, assistPlayerId: roster[8].id, goalType: 'assist-led' },
      { id: `${id}:sub`, type: 'sub', minute: 60, sequence: 2, teamId: team.id, playerOutId: roster[9].id, playerInId: roster[11].id, position: 'ST' },
      { id: `${id}:goahead`, type: 'goal', minute: 60, sequence: 4, teamId: team.id, playerId: roster[11].id, assistPlayerId: roster[7].id },
      { id: `${id}:save`, type: 'save', teamId: team.id, playerId: roster[0].id, count: 3 + day % 4 },
      ...(day % 3 === 0 ? [{ id: `${id}:own`, type: 'goal', minute: 85, teamId: team.id, playerId: roster[2].id, ownGoal: true }] : []),
      { id: `${id}:stoppage`, type: 'goal', minute: 93, teamId: team.id, playerId: roster[11].id, assistPlayerId: roster[10].id, goalType: 'wonder' },
    ]
    if (day % 5 === 0) events.splice(3, 1) // varied event histories and scores
    const modern = day % 7 !== 0
    const match = { id, season, matchDay: day, date: `2025-${String(season + 1).padStart(2, '0')}-${String(Math.min(day, 28)).padStart(2, '0')}`, recordedAt: matches.length + 1, duration: 90, teamId: team.id, homeTeamId: team.id, awayTeamId: opponentId, appearances, events, competitionType: type, competitionStage: stage }
    match.season = `Season ${season + 1}`
    if (modern) { match.halftimeOpponentSot = 3; match.fulltimeOpponentSot = 8 + day % 4 }
    if (type === 'champions') { match.competitionPairingId = `roundOf16:${Math.floor(teamIndex / 2)}`; match.competitionSeriesGame = seriesGame }
    matches.push(match)
  }
  for (let season = 0; season < seasonCount; season++) {
    competitionStates.push({ id: `champions:Season ${season + 1}`, season: `Season ${season + 1}`, kind: 'champions-draw', teamIds: teams.map(team => team.id) })
    for (let day = 1; day <= 30; day++) for (let teamIndex = 0; teamIndex < 16; teamIndex++) game(season, teamIndex, day)
    for (let teamIndex = 0; teamIndex < 16; teamIndex++) {
      for (let day = 1; day <= 3; day++) game(season, teamIndex, day, 'cup', 'stage1')
      for (let day = 1; day <= 3; day++) game(season, teamIndex, day, 'champions', 'roundOf16', day)
    }
  }
  // Permanent IDs survive transfer, release, and removal from the active roster.
  players[8].teamId = teams[1].id; players[8].teamIds = [teams[1].id]
  players[15].teamId = ''; players[15].teamIds = []
  players.splice(players.findIndex(player => player.id === rosters[2][10].id), 1)
  return { teams, players, matches, competitionStates }
}
module.exports = { performanceFixture }
