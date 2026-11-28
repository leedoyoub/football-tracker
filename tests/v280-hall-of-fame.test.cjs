require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { selectCareerHonors, careerScoreFromHonors, selectCareerBestXI, hallOfFameCareer, PLAYER_HONOR_POINTS, TEAM_PLACEMENT_POINTS } = require('../src/engine/careerScore.ts')
const { finalizedTeamPlacements } = require('../src/engine/teamCompetitionResults.ts')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')

test('career bonuses count official IDs once and keep scope bonuses exact', () => {
  assert.deepEqual(TEAM_PLACEMENT_POINTS, { league: [150, 60, 30, 15], champions: [150, 60, 30, 15], cup: [90, 40, 20, 10] })
  assert.deepEqual(Object.values(PLAYER_HONOR_POINTS).sort((a,b) => b-a), [400,250,250,150,150,150,150,100,100,100,80,80,80,80,80,80,80,80,80,60,60,60,30,30])
  const award = { id: 'mv', kind: 'season-mvp', playerId: 'p', category: 'individual', finalized: true }
  const result = selectCareerHonors([award, award, { ...award, id: 'xi', kind: 'season-xi' }, { ...award, id: 'monthly', kind: 'monthly-player' }])
  const placements = [{ competition: 'league', place: 1 }, { competition: 'champions', place: 1 }, { competition: 'cup', place: 1 }]
  assert.deepEqual(careerScoreFromHonors(10, result.get('p'), placements), { individualBonus: 0.5, teamBonus: 0.39, score: 10.89 })
})

test('career XI applies family slots once and breaks ties by Ballon d’Or before rating', () => {
  const base = { family: 'ATT', score: 9, ballon: 0, average: 8.8, minutes: 90, mom: 0, appearances: 1, teamId: 'A' }
  const rows = [{ ...base, playerId: 'high-average' }, { ...base, playerId: 'ballon', average: 8, ballon: 1 }, { ...base, playerId: 'gk', family: 'GK' }]
  const { bestXI, greatest } = selectCareerBestXI(rows)
  assert.equal(greatest.playerId, 'ballon')
  assert.equal(bestXI.filter(slot => slot.playerId).length, 3)
  assert.equal(bestXI[0].playerId, 'gk')
  assert.equal(bestXI[8].playerId, 'ballon')
  assert.equal(bestXI.length, 11)
})

test('career team credit uses completed competition appearances and recalculates after a historic edit', () => {
  const { teams, players, matches, competitionStates } = performanceFixture(1)
  const leagueResult = () => finalizedTeamPlacements(teams, players, matches, competitionStates).filter(row => row.competition === 'league')
  const leader = leagueResult().find(row => row.place === 1)
  assert(leader)
  const index = matches.findLastIndex(match => match.competitionType === 'league' && match.teamId === leader.teamId)
  const fixture = matches[index]
  // The reference fixture ties on points and uses player statistics as a
  // tiebreaker. Give the leader a win so the appearance edit cannot change it.
  const scorer = fixture.appearances.find(row => row.role === 'starter' && row.position === 'LW')
  matches[index] = { ...fixture, events: [...fixture.events, { id: 'career-title-clincher', type: 'goal', minute: 75, teamId: leader.teamId, playerId: scorer.playerId }] }
  const league = leagueResult()
  const champion = league.find(row => row.place === 1)
  assert(champion)
  assert.equal(champion.teamId, leader.teamId)
  assert(champion.points > league.find(row => row.place === 2).points)
  const former = players.find(player => player.id === `${champion.teamId}:1`)
  former.teamId = ''
  former.teamIds = []
  const rival = players.find(player => player.id.endsWith(':5') && player.teamId !== champion.teamId)
  const match = matches[index]
  const replaceBench = match.appearances.find(row => row.role === 'bench' && row.position === rival.position)
  const replacedStarter = match.appearances.find(row => row.role === 'starter' && row.position === rival.position)
  matches[index] = { ...match, appearances: match.appearances.map(row => row === replaceBench ? { ...row, playerId: rival.id } : row) }
  const career = () => hallOfFameCareer(teams, players, matches, competitionStates)
  const original = career()
  assert.strictEqual(career(), original)
  const title = ({ competition, teamId, place }) => competition === 'league' && teamId === champion.teamId && place === 1
  assert(original.rankings.find(row => row.playerId === former.id).placements.some(title))
  assert(!original.rankings.find(row => row.playerId === rival.id).placements.some(title))
  matches[index] = { ...matches[index], events: [...match.events, { id: 'career-title-sub', type: 'sub', minute: 80, teamId: champion.teamId, playerOutId: replacedStarter.playerId, playerInId: rival.id, position: rival.position }] }
  const revised = career()
  assert.equal(leagueResult().find(row => row.place === 1).teamId, champion.teamId)
  assert.notStrictEqual(revised, original)
  const row = revised.rankings.find(row => row.playerId === rival.id)
  assert.equal(row.placements.filter(title).length, 1)
  assert.equal(row.score, careerScoreFromHonors(row.average, row.honors, row.placements).score)
})
