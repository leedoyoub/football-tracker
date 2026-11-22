const path = require('node:path')
const { archiveBaseline, root } = require('./v2611-baseline.cjs')
const { performanceFixture } = require('./v255-fixture.cjs')
const base = '476ee014e6714334989cfddb77530a27abd82570'
const work = path.join(root, '.superpowers/sdd/v2612')
const baselineRoot = () => archiveBaseline(work, base)

function cappedMomFixture(seasons = 1) {
  const state = performanceFixture(seasons)
  const { teamId, homeTeamId, awayTeamId, appearances } = state.matches[0]
  const [keeper, striker, defender] = [0, 9, 2].map(index => appearances[index].playerId)
  const capped = (id, season, matchDay, competitionType = 'league') => ({
    id, season, matchDay, competitionType,
    competitionStage: competitionType === 'league' ? 'regular' : 'stage1',
    date: `2025-01-${String(matchDay).padStart(2, '0')}`, duration: 90,
    teamId, homeTeamId, awayTeamId, halftimeOpponentSot: 6, fulltimeOpponentSot: 13,
    appearances: appearances.map(({ positionHistory: _positionHistory, ...row }) => row),
    events: [
      ...Array.from({ length: 7 }, (_, i) => ({ type: 'goal', id: `${id}:goal:${i}`, teamId, minute: 4 + 11 * i, playerId: striker })),
      { type: 'save', id: `${id}:save`, teamId, playerId: keeper, count: 10 },
    ],
  })
  return { state, capped, keeper, striker, defender }
}

module.exports = { base, work, root, baselineRoot, cappedMomFixture }
