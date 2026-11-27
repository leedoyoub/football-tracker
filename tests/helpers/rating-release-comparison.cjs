const assert = require('node:assert/strict')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const live = require('../../src/engine/rating.ts')
const { selectMomCandidate } = require('../../src/engine/momSelection.ts')
const { playerGoalEvents, playerAssistEvents } = require('../../src/engine/playerMatchFacts.ts')

function v2612Source(file) {
  return execFileSync('git', ['show', `75d6646146c8f08f770ca009c03d944c2d3098f0:src/${file}`], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
  })
}

// Historic selector implementations receive the same rating inputs so their
// full-shape equivalence assertions still detect changes in the selectors.
function alignArchivedRatingInputs(directory) {
  const archived = require(path.join(directory, 'src/engine/rating.ts'))
  const original = { ...archived }
  for (const method of ['rateMatch', 'ratePlayerMatch', 'getMatchManOfTheMatch']) archived[method] = live[method]
  return original
}

function assertRatingTransition(previousRows, currentRows) {
  const preserved = ({ goals, assists, teamGoals, conceded, noConceded, saves, preClamp, raw, rating, ...facts }) => facts
  assert.deepEqual(currentRows.map(preserved), previousRows.map(preserved))
  for (const row of currentRows) {
    const score = row.base + row.result + row.goals + row.assists + row.teamGoals + row.conceded + row.noConceded + row.concededCause + row.saves
    assert.equal(row.preClamp, score)
    assert.equal(row.raw, Math.min(10, Math.max(3, score)))
    assert.equal(row.rating, row.raw)
  }
}

function assertMomPolicy(match, players, actual) {
  const rows = live.rateMatch(match, players)
  const maximum = Math.max(...rows.map(row => row.rating))
  const bestPreClamp = Math.max(...rows.filter(row => row.rating === maximum).map(row => row.preClamp))
  const candidates = rows.filter(row => row.rating === maximum && (maximum !== 10 || row.preClamp === bestPreClamp))
  const expected = selectMomCandidate(candidates.map(row => {
    const appearance = match.appearances.find(entry => entry.playerId === row.playerId)
    return { playerId: row.playerId, average: row.rating, position: row.position, minutes: row.minutes,
      goals: playerGoalEvents(match, appearance).length, assists: playerAssistEvents(match, appearance).length }
  }), match.id)
  assert.equal(actual, expected, match.id)
}

module.exports = { alignArchivedRatingInputs, assertRatingTransition, assertMomPolicy, v2612Source }
