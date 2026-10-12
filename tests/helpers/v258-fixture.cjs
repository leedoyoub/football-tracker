require('./register-ts.cjs')
const { cupCompetition, CUP_STAGES } = require('../../src/engine/competition.ts')
const teams = Array.from({ length: 16 }, (_, i) => ({ id: `T${i + 1}`, name: `Team ${i + 1}`, shortName: `T${i + 1}` }))
function game(id, teamId, props = {}) {
  const { gf = 0, ga = 0, ...fields } = props
  const opponent = props.awayTeamId ?? `OPP-${teamId}`
  return { id, season: 'S1', competitionType: 'cup', competitionStage: 'stage1', matchDay: 1, date: '2026-10-01', recordedAt: 1000, duration: 90, teamId, homeTeamId: teamId, awayTeamId: opponent, appearances: [], events: [
    ...Array.from({ length: gf }, (_, i) => ({ id: `${id}:gf:${i}`, type: 'goal', minute: i + 1, teamId })),
    ...Array.from({ length: ga }, (_, i) => ({ id: `${id}:ga:${i}`, type: 'goal', minute: i + 21, teamId: opponent })),
  ], ...fields }
}
function cupFixture(stages) {
  const matches = []
  for (const stage of CUP_STAGES.slice(0, stages)) {
    const active = cupCompetition(teams, matches, 'S1').activeTeamIds
    active.forEach((id, i) => matches.push(game(`${stage}:${id}`, id, { competitionStage: stage, gf: active.length - i, ga: i })))
  }
  return matches
}
module.exports = { teams, game, cupFixture }
