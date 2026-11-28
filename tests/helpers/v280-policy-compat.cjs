const assert = require('node:assert/strict')

function assertAwardCandidateCompatibility(actual, baseline, games) {
  const { creditedMinutesPlayed, hasActualAppearance } = require('../../src/engine/timeline.ts')
  const { isRecordedForTeam } = require('../../src/engine/matchPerspective.ts')
  const unique = [...new Map(games.slice().reverse().map(match => [match.id, match])).values()]
  const teams = [...new Set(unique.flatMap(match => [match.homeTeamId, match.awayTeamId]))]
  const maximum = Math.max(0, ...teams.map(team => unique.filter(match => isRecordedForTeam(match, team)).length))
  const played = new Map()
  for (const match of unique) {
    const perMatch = new Map()
    for (const appearance of match.appearances) {
      if (!hasActualAppearance(match, appearance)) continue
      perMatch.set(appearance.playerId, Math.max(perMatch.get(appearance.playerId) ?? 0, Math.min(90, creditedMinutesPlayed(match, appearance))))
    }
    for (const [id, minutes] of perMatch) {
      const total = played.get(id) ?? [0, 0]
      total[0]++
      total[1] += minutes
      played.set(id, total)
    }
  }
  const qualifies = id => maximum > 0 && (played.get(id)?.[0] ?? 0) >= Math.ceil(maximum * 0.4) && (played.get(id)?.[1] ?? 0) >= maximum * 18
  const actualById = new Map(actual.map(row => [row.playerId, row]))
  for (const row of actual) assert(qualifies(row.playerId), `Candidate ${row.playerId} must meet both thresholds`)
  for (const row of baseline) {
    assert.equal(actualById.has(row.playerId), qualifies(row.playerId), `Eligibility for ${row.playerId}`)
    if (qualifies(row.playerId)) assert.deepEqual(actualById.get(row.playerId), row, `Existing scoring fields for ${row.playerId}`)
  }
}

function assertRecapCompatibility(after, before, canonical) {
  const stable = ({ bestXI: _bestXI, awards, ...fields }) => ({ ...fields, awards: awards.filter(award => !['player', 'best-xi'].includes(award.id)) })
  assert.deepEqual(stable(after), stable(before), 'Unchanged recap awards, counts and progress')
  assert.deepEqual(after.bestXI, canonical.bestXI, 'Recap projects the official Best XI')
  const mvp = after.awards.find(award => award.id === 'player')
  assert.deepEqual(mvp?.playerIds, canonical.ballon ? [canonical.ballon.playerId] : undefined)
  if (mvp) assert.equal(mvp.title, "Ballon d'Or")
}

const matchPlayerIds = new Set(['highest-rating', 'highest-goals', 'highest-assists', 'highest-ga'])
const matchTeamIds = new Set(['biggest-win', 'high-score', 'high-conceded'])
const defensiveIds = new Set(['lowest-sot-90', 'lowest-defender-ga-90', 'lowest-gk-ga-90'])
const newSeasonUnit = /^(history-(league-(points|wins|gd|finish)|cup-finish|champions-finish))$/
const awardEligibility = /(^awards-(individual|total|mvps|xi|(first-half|second-half|league|cup|champions|season)-(mvp|xi))$|^team-awards(-individual|:[w-]+-(mvp|xi))$)/
const comboEligibility = /(^cb-|^best-unit:|^together:.*:ppg$)/
const squash = rows => {
  const bestById = new Map()
  for (const row of rows) if (!bestById.has(row.id)) bestById.set(row.id, row.numeric)
  return [...bestById].sort(([a], [b]) => a.localeCompare(b))
}

function assertRecordCompatibility(actual, baseline, input, label) {
  const { category, scope } = input
  const groups = new Map(actual.map(group => [group.id, group]))
  for (const before of baseline) {
    const after = groups.get(before.id)
    // A specific team award kind appears only when at least one official
    // recipient exists, so an eligibility change can remove its only row.
    if (!after && /^team-awards:/.test(before.id) && awardEligibility.test(before.id)) continue
    assert(after, `${label}: missing ${before.id}`)
    assert.deepEqual(after.applicableFilters, before.applicableFilters, `${label} ${before.id} filters`)
    if (newSeasonUnit.test(before.id) || awardEligibility.test(before.id) || comboEligibility.test(before.id)) continue
    if ((category === 'player' ? matchPlayerIds : matchTeamIds).has(before.id)) {
      if (category === 'player' && scope.teamIds.length) {
        assert(after.rows.every(row => row.matchId && row.teamIds.some(teamId => scope.teamIds.includes(teamId))), `${label}: achievement-team filter`)
      } else {
        assert.deepEqual(squash(after.rows), squash(before.rows), `${label} ${before.id}: repeat rows preserve each best mark`)
      }
      continue
    }
    if (defensiveIds.has(before.id)) {
      const oldRows = new Map(before.rows.map(row => [row.id, row.numeric]))
      for (const row of after.rows) assert.equal(row.numeric, oldRows.get(row.id), `${label} ${before.id}: qualified values unchanged`)
      continue
    }
    const legacyPairIds = new Set(['mutual-goal-combinations', 'both-scored', 'both-ga', 'duo-ga'])
    const archivedId = row => {
      if (!legacyPairIds.has(before.id)) return row.id
      const ids = before.id === 'duo-ga' ? [...row.playerIds] : row.playerIds.flatMap(id => id.split(':'))
      return `${before.id}:${ids.sort().join(':')}`
    }
    const values = (rows, idOf = row => row.id) => rows.map(row => ({ id: idOf(row), numeric: row.numeric, value: row.value }))
      .sort((a, b) => a.id.localeCompare(b.id) || b.numeric - a.numeric)
    assert.deepEqual(values(after.rows, archivedId), values(before.rows), `${label} ${before.id}: unchanged values`)
    if (category === 'combination') {
      // Archive leaderboards use competition ranking for equal record values.
      for (const row of after.rows) {
        const higher = before.rows.filter(candidate => candidate.numeric > row.numeric).length
        assert.equal(row.rank, higher + 1, `${label} ${before.id}: shared rank`)
      }
    } else {
      const ranks = rows => rows.map(({ id, rank }) => ({ id, rank })).sort((a, b) => a.id.localeCompare(b.id))
      assert.deepEqual(ranks(after.rows), ranks(before.rows), `${label} ${before.id}: unchanged ranks`)
    }
  }
}

module.exports = { assertAwardCandidateCompatibility, assertRecapCompatibility, assertRecordCompatibility }
