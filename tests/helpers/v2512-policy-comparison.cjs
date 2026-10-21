const assert = require('node:assert/strict')

// Old releases intentionally differ in League award wording and Season GK policy.
// Keep every other field, ordering and value in the independent-baseline checks.
// Dedicated v2512 regressions assert the replacement GK selection, scores and gates.
function leagueCopy(value, markup = typeof value === 'string') {
  if (typeof value === 'string') return markup ? value.replaceAll('wins Player of the Season', 'wins Player of the League') : value
  if (Array.isArray(value)) return value.map(item => leagueCopy(item, false))
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, leagueCopy(v, false)]))
  if (value instanceof Set) return new Set([...value].map(item => leagueCopy(item, false)))
  if (!value || typeof value !== 'object') return value
  const copy = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, leagueCopy(v, false)]))
  if (copy.teamLabel === 'League Best XI' && copy.playerLabel === 'Player of the Season') copy.playerLabel = 'Player of the League'
  if (typeof copy.id === 'string' && copy.id.startsWith('award:player-of-the-season:')) {
    for (const key of ['id', 'title', 'detail']) if (typeof copy[key] === 'string') copy[key] = copy[key].replaceAll('Player of the Season', 'Player of the League').replace('award:player-of-the-season:', 'award:player-of-the-league:')
  }
  if (typeof copy.playerId === 'string' && typeof copy.value === 'number' && typeof copy.label === 'string') delete copy.teamId
  return copy
}
function assertPolicyEquivalence(actual, original, file, fn) {
  const a = leagueCopy(actual), b = leagueCopy(original)
  if (file === 'engine/awards.ts' && fn === 'competitionAwardResult' && a) delete a.individualAwards
  if (file === 'engine/awards.ts' && fn === 'seasonAwards') {
    for (const value of [a, b]) { delete value.goldenGlove; delete value.goalkeeper }
    // v2.6.1 adds joint-recipient arrays; legacy projections and all selection
    // values below remain exactly equivalent. Dedicated v261 tests assert ties.
    delete a.goldenBootWinners; delete a.assistLeaderWinners
  }
  assert.deepStrictEqual(a, b, `${file}:${fn}: unchanged policy fields`)
}
function unchangedPlayerMarkup(markup) {
  return leagueCopy(markup)
    .replace(/Football Tracker · v\d+\.\d+\.\d+/g, 'Football Tracker · VERSION')
    .replace(/<section aria-label="Career awards"[^]*?<\/section>/, '')
    .replace(/<section class="mb-4 rounded-2xl bg-zinc-900 p-3"><div><h2 class="text-sm font-semibold">Awards [^]*?<\/section>/, '')
}
module.exports = { leagueCopy, assertPolicyEquivalence, unchangedPlayerMarkup }
