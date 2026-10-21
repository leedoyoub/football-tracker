const assert = require('node:assert/strict')
const arrayKeys = ['scorers', 'assistLeaders', 'goalkeepers']

// v2.6.1 changes only joint scorer/assister and League GK recipient sets.
// Retain strict equality for every old event, legacy winner and other model field.
function assertOfficialAwardPolicy(actual, original, players, matches, season) {
  const strip = model => ({ ...model, competitionAwards: Object.fromEntries(Object.entries(model.competitionAwards).map(([key, award]) => [key, Object.fromEntries(Object.entries(award).filter(([key]) => !arrayKeys.includes(key)))])) })
  const a = strip(actual), b = strip(original)
  // The new status projection exposes the model already used internally, so
  // Team History can reuse it without rebuilding three competition models.
  delete a.status
  delete a.events; delete b.events
  assert.deepEqual(a, b, 'all legacy competition selections and team results remain unchanged')
  const current = new Map(actual.events.map(event => [event.id, event]))
  assert.equal(current.size, actual.events.length, 'recipient event IDs remain unique')
  for (const event of original.events) assert.deepEqual(current.get(event.id), event, `preserved original event ${event.id}`)
  const oldIds = new Set(original.events.map(e => e.id))
  const { buildGlobalRankingData } = require('../../src/engine/stats.ts')
  const { competitionMatches } = require('../../src/engine/competition.ts')
  const scopes = new Map()
  const rowsFor = competition => {
    if (!scopes.has(competition)) scopes.set(competition, buildGlobalRankingData(players, competition === 'all' ? matches.filter(m => m.season === season) : competitionMatches(matches, season, competition), { seasons: [season], teams: [], positions: [] }, 'rating'))
    return scopes.get(competition)
  }
  for (const event of actual.events.filter(e => !oldIds.has(e.id))) {
    assert.match(event.kind, /^(league|cup|champions|season)-(scorer|assists)$|^league-gk$/, 'only approved joint award kinds add recipients')
    const field = event.kind.endsWith('-scorer') ? 'goals' : event.kind.endsWith('-assists') ? 'assists' : 'cleanSheets'
    const rows = rowsFor(event.competition).filter(row => field !== 'cleanSheets' || row.playedGoalkeeper)
    const maximum = Math.max(...rows.map(row => row[field] ?? 0))
    const row = rows.find(row => row.playerId === event.playerId)
    assert(row, 'each new recipient actually appeared')
    assert.equal(row[field] ?? 0, maximum, 'each additional award is tied at the primary maximum')
    assert.equal(event.category, 'individual')
    assert.equal(event.finalized, true)
    assert.equal(event.id, JSON.stringify([season, event.competition, event.kind, '', event.playerId, '']))
    assert(matches.some(match => match.season === season && match.appearances.some(a => a.playerId === event.playerId && a.teamId === event.teamId)), 'team attribution uses historical appearances')
  }
  for (const [competition, award] of Object.entries(actual.competitionAwards)) {
    const rows = rowsFor(competition)
    for (const [key, field] of [['scorers', 'goals'], ['assistLeaders', 'assists'], ...(competition === 'league' ? [['goalkeepers', 'cleanSheets']] : [])]) {
      const eligible = rows.filter(row => field !== 'cleanSheets' || row.playedGoalkeeper)
      const maximum = Math.max(...eligible.map(row => row[field] ?? 0))
      assert.deepEqual(award[key].map(w => w.playerId).sort(), eligible.filter(row => (row[field] ?? 0) === maximum).map(row => row.playerId).sort(), `${competition} ${key} includes every maximum`)
    }
    for (const [array, singular] of [['scorers', 'scorer'], ['assistLeaders', 'assists'], ['goalkeepers', 'goalkeeper']]) assert.deepEqual(award[array][0], award[singular])
  }
}

function assertRecapAwardPolicy(actual, original, players, matches, season) {
  const { buildGlobalRankingData } = require('../../src/engine/stats.ts')
  const rows = buildGlobalRankingData(players, matches, { seasons: [season], teams: [], positions: [] }, 'rating')
  const expected = { ...original, awards: original.awards.map(award => {
    const field = award.id === 'scorer' ? 'goals' : award.id === 'assists' ? 'assists' : undefined
    if (!field) return award
    const maximum = Math.max(...rows.map(row => row[field]))
    const recipients = rows.filter(row => row[field] === maximum).map(row => row.playerId)
    const selected = actual.awards.find(row => row.id === award.id)
    assert.deepEqual(selected.playerIds.slice().sort(), recipients.sort())
    return { ...award, playerIds: selected.playerIds }
  }) }
  assert.deepEqual(actual, expected, 'Recap changes only primary-maximum scorer/assister recipients')
}
module.exports = { assertOfficialAwardPolicy, assertRecapAwardPolicy }
