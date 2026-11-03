require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const awards = require('../src/engine/awards.ts')
const { AWARD_433 } = require('../src/engine/awardRules.ts')
const { ratePlayerMatch } = require('../src/engine/rating.ts')
const { officialAwardsForSeason } = require('../src/engine/officialAwards.ts')
const { STATIC_TEAMS } = require('../src/data/teams.ts')
const { awardRaceCandidates } = require('../src/engine/awardRacePresentation.ts')
const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, displayName: id, teamId, position, number: 1 })
const app = (p, extra = {}) => ({ playerId: p.id, teamId: p.teamId, position: p.position, matchPosition: p.position, role: 'starter', ...extra })
const game = (id, ps = [], extra = {}) => ({ id, season: 'S1', date: `2026-01-${String(Number(id.replace(/\D/g, '')) || 1).padStart(2, '0')}`, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'opponent', competitionType: 'league', competitionStage: 'regular', matchDay: 1, appearances: ps.map(p => app(p)), events: [], ...extra })
const teams = ['A', 'B'].map(id => ({ id, name: id, shortName: id }))
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`)

test('v265 league rank bases and participation scale are exact, with no independent minutes bonus', () => {
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => awards.leaguePositionBonus(i + 1)), [.3, .21, .15, .105, .09, .075, .0675, .06, .0525, .045, .0375, .03, .0225, .015, .0075, 0])
  near(awards.ratingAwardScore(7.85, .3, 450, 10), 8)
  near(awards.ratingAwardScore(7.85, .3, 900, 10), 8.15)
  assert.equal(awards.ratingAwardScore(7.85, .3, 0, 10), 7.85)
})

test('v265 tournament placement bases use existing survival stages, including secured live results', () => {
  assert.deepEqual(['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'runnerUp', 'champion'].map(awards.cupProgressBonus), [0, 0, 0, 0, .06, .06, .12, .21, .3])
  assert.deepEqual(['roundOf16', 'quarterFinal', 'semiFinal', 'runnerUp', 'champion'].map(awards.championsProgressBonus), [0, .06, .12, .21, .3])
  const p = player('p')
  const matches = [game('1', [p], { competitionType: 'cup', competitionStage: 'stage5' })]
  const base = { complete: false, championId: undefined, runnerUpId: undefined, activeTeamIds: ['A'], eliminatedAtByTeam: {}, stage: 'stage5' }
  const result = awards.awardsForCompetition('cup', 'S1', teams, [p], matches, [], { cup: base })
  near(result.candidates[0].selectionScore - result.candidates[0].average, .06)
  const early = awards.awardsForCompetition('cup', 'S1', teams, [p], matches, [], { cup: { ...base, stage: 'stage1' } })
  near(early.candidates[0].selectionScore - early.candidates[0].average, 0)
})

test('v265 official eligibility uses 50% regulation minutes rather than appearances', () => {
  const p = player('boundary'), sub = player('replacement')
  const build = minute => [game('1', [p, sub], { appearances: [app(p), app(sub, { role: 'bench' })], events: [{ id: 'sub', type: 'sub', minute, teamId: 'A', playerOutId: p.id, playerInId: sub.id, position: 'ST' }] }), game('2', [])]
  assert(!awards.awardsForCompetition('league', 'S1', teams, [p, sub], build(89), []).candidates.some(c => c.playerId === p.id))
  const full = build(90)
  assert(awards.awardsForCompetition('league', 'S1', teams, [p, sub], full, []).candidates.some(c => c.playerId === p.id))
  const cameos = Array.from({ length: 4 }, (_, i) => game(String(i + 1), [p, sub], { appearances: [app(p, { role: 'bench' }), app(sub)], events: [{ id: `s${i}`, type: 'sub', minute: 89, teamId: 'A', playerOutId: sub.id, playerInId: p.id, position: 'ST' }] }))
  assert(!awards.awardsForCompetition('league', 'S1', teams, [p, sub], cameos, []).candidates.some(c => c.playerId === p.id))
})

test('v265 scope mean samples each played match once across positions, never minutes-weighted or bench-only', () => {
  const p = player('multi'), sub = player('sub')
  const matches = [game('1', [p], { appearances: [app(p, { positionHistory: [{ minute: 20, position: 'LW' }, { minute: 60, position: 'CAM' }] })], events: [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: p.id }] }), game('2', [p, sub], { appearances: [app(p, { role: 'bench', matchPosition: 'LW' }), app(sub)], events: [{ id: 'on', type: 'sub', minute: 45, teamId: 'A', playerOutId: sub.id, playerInId: p.id, position: 'LW' }] }), game('3', [p], { appearances: [app(p, { role: 'bench' })] })]
  const c = awards.awardsForCompetition('league', 'S1', teams, [p, sub], matches, []).candidates.find(c => c.playerId === p.id)
  assert(c)
  near(c.average, (ratePlayerMatch(matches[0], p).raw + ratePlayerMatch(matches[1], p).raw) / 2)
  assert.equal(c.appearances, 2)
  assert.equal(c.minutes, 135)
})

test('v265 stoppage events stay stored but credited minutes and raw samples exclude a zero-minute entry', () => {
  const p = player('late'), q = player('starter')
  const matches = [game('1', [p, q], { duration: 95, appearances: [app(p, { role: 'bench' }), app(q)], events: [{ id: 'on', type: 'sub', minute: 92, teamId: 'A', playerOutId: q.id, playerInId: p.id, position: 'ST' }, { id: 'goal', type: 'goal', minute: 93, teamId: 'A', playerId: p.id }] })]
  const result = awards.awardsForCompetition('league', 'S1', teams, [p, q], matches, [])
  assert(!result.candidates.some(c => c.playerId === p.id))
  assert.equal(result.candidates.find(c => c.playerId === q.id).minutes, 90)
  assert.equal(matches[0].events.length, 2)
})

test('v265 transfers yield one whole-scope candidate and one evidenced opportunity per game', () => {
  const p = player('moved', 'released'), bench = player('bench')
  const matches = []
  for (let day = 1; day <= 4; day++) {
    for (const teamId of ['A', 'B']) matches.push(game(`${day}${teamId}`, [], { date: `2026-01-0${day}`, matchDay: day, teamId, homeTeamId: teamId, appearances: teamId === (day <= 2 ? 'A' : 'B') ? [app(p, { teamId })] : [] }))
  }
  const result = awards.awardsForCompetition('league', 'S1', teams, [p, bench], matches, [])
  assert.equal(result.candidates.filter(c => c.playerId === p.id).length, 1)
  const c = result.candidates[0]
  assert.equal(c.minutes, 360)
  assert.equal(c.availableMinutes, 360)
  near(c.average, matches.filter(m => m.appearances.length).reduce((sum, m) => sum + ratePlayerMatch(m, p).raw, 0) / 4)
  assert.equal(c.teamId, 'B')
  assert(c.selectionScore - c.average <= .3 + 1e-10)
})

test('v265 transferred clubs with delayed same-round schedules retain distinct dated opportunities', () => {
  const p = player('delayed', 'B')
  const matches = ['A', 'B'].flatMap((teamId, teamIndex) => [1, 2, 3].map(day => game(`${teamId}${day}`, [], { teamId, homeTeamId: teamId, matchDay: day, date: `2026-01-0${day + teamIndex * 3}`, appearances: day === 1 ? [app(p, { teamId })] : [] })))
  assert(!awards.awardsForCompetition('league', 'S1', teams, [p], matches, []).candidates.some(c => c.playerId === p.id))
  matches[4] = { ...matches[4], appearances: [app(p, { teamId: 'B' })] }
  const candidate = awards.awardsForCompetition('league', 'S1', teams, [p], matches, []).candidates.find(c => c.playerId === p.id)
  assert(candidate)
  assert.equal(candidate.availableMinutes, 540)
  assert.equal(candidate.minutes, 270)
})

test('v265 season uses per-competition participation and 70/60/30 weights, maximum 0.48', () => {
  const p = player('treble')
  const matches = ['league', 'champions', 'cup'].map((type, i) => game(String(i + 1), [p], { competitionType: type, competitionStage: type === 'league' ? 'regular' : 'final' }))
  const status = { complete: true, league: { complete: true, standings: [{ teamId: 'A', rank: 1 }], championId: 'A' }, cup: { championId: 'A', runnerUpId: 'B', activeTeamIds: ['A', 'B'], eliminatedAtByTeam: {}, stage: 'final' }, champions: { championId: 'A', runnerUpId: 'B', currentStage: 'final', rounds: { roundOf16: [], quarterFinal: [], semiFinal: [], final: [] } } }
  const result = awards.seasonAwards('S1', teams, [p], matches, [], status)
  near(result.candidates[0].selectionScore - result.candidates[0].average, .48)
  const leagueOnly = awards.seasonAwards('S1', teams, [p], [matches[0]], [], status)
  near(leagueOnly.candidates[0].selectionScore - leagueOnly.candidates[0].average, .21)
})

test('v265 official six groups retain 4-3-3, duplicate prevention, score MVP and raw pitch ratings', () => {
  const ps = ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'ST', 'ST', 'ST', 'ST'].map((pos, i) => player(`p${i}`, 'A', pos))
  const matches = [game('1', ps)]
  const result = awards.awardsForCompetition('league', 'S1', teams, ps, matches, [])
  assert.deepEqual(result.bestXI.map(s => s.slot), AWARD_433.map(s => s.slot))
  assert.equal(new Set(result.bestXI.map(s => s.playerId)).size, 11)
  assert(result.bestXI.every(s => s.playerId))
  assert.equal(result.mvp.playerId, result.candidates[0].playerId)
  assert(result.bestXI.some(s => s.playerId === result.mvp.playerId))
  assert.equal(awardRaceCandidates(result.candidates)[0].playerId, result.mvp.playerId)
  for (const slot of result.bestXI) near(slot.avgRating, result.candidates.find(c => c.playerId === slot.playerId).average)
})

test('v265 malformed duplicate roster identities still yield one official candidate per permanent player ID', () => {
  const p = player('duplicate')
  const result = awards.awardsForCompetition('league', 'S1', teams, [p, { ...p, position: 'GK' }], [game('1', [p])], [])
  assert.equal(result.candidates.filter(c => c.playerId === p.id).length, 1)
  assert.equal(result.bestXI.filter(slot => slot.playerId === p.id).length, 1)
})

test('v265 duplicate saved match IDs cannot add a second raw rating sample or played minutes', () => {
  const p = player('duplicate-match')
  const first = game('1', [p], { events: [{ id: 'g', type: 'goal', minute: 10, teamId: 'A', playerId: p.id }] })
  const last = game('2', [p])
  const result = awards.awardsForCompetition('league', 'S1', teams, [p], [first, { ...first }, last], [])
  const candidate = result.candidates[0]
  assert.equal(candidate.appearances, 2)
  assert.equal(candidate.minutes, 180)
  near(candidate.average, (ratePlayerMatch(first, p).raw + ratePlayerMatch(last, p).raw) / 2)
})

function leagueSeason() {
  const p = player('historic', STATIC_TEAMS[0].id)
  const matches = STATIC_TEAMS.flatMap(t => Array.from({ length: 30 }, (_, i) => game(`${t.id}:${i}`, t.id === p.teamId ? [p] : [], { matchDay: i + 1, teamId: t.id, homeTeamId: t.id, date: '2026-01-01' })))
  return { p, matches }
}

test('v265 half awards finalize only after every team has all 15 unique canonical slots', () => {
  const { p, matches } = leagueSeason()
  const first = matches.filter(m => m.matchDay <= 15)
  const query = games => officialAwardsForSeason(STATIC_TEAMS, [p], games, [], 'S1')
  assert(!query(first.filter(m => !(m.teamId === STATIC_TEAMS[15].id && m.matchDay === 15))).some(e => e.kind.startsWith('first-half')))
  const events = query(first)
  assert.equal(events.filter(e => e.kind === 'first-half-mvp').length, 1)
  assert.equal(events.filter(e => e.kind === 'first-half-xi').length, 1)
  assert(!events.some(e => e.kind.startsWith('second-half') || e.kind.startsWith('league-')))
  const completed = query(matches)
  assert(completed.some(e => e.kind === 'second-half-mvp'))
  assert(completed.some(e => e.kind === 'league-mvp'))
  const retired = /^(monthly-player|monthly-xi|champions-round-player|champions-round-xi|cup-final|champions-final)$/
  assert(!completed.some(e => retired.test(e.kind)))
  assert(!query([...first, { ...first[0], id: 'duplicate' }]).some(e => e.kind.startsWith('first-half')))
})

test('v265 half scopes use their own recorded standings and same canonical result as events', () => {
  const { p, matches } = leagueSeason()
  const ps = [p, player('b', STATIC_TEAMS[1].id)]
  const games = matches.map(m => m.teamId === p.teamId && m.matchDay <= 15 ? { ...m, events: [{ id: `g${m.id}`, type: 'goal', minute: 1, teamId: m.teamId, playerId: p.id }] } : m.teamId !== STATIC_TEAMS[1].id ? m : { ...m, appearances: [app(ps[1])], events: m.matchDay > 15 ? [{ id: `g${m.id}`, type: 'goal', minute: 1, teamId: m.teamId, playerId: ps[1].id }] : [] })
  for (const scope of ['first-half', 'second-half', 'league']) {
    const result = awards.awardResultForScope(scope, 'S1', STATIC_TEAMS, ps, games, [])
    assert(result.complete)
    assert.equal(result.bestPlayerId, result.candidates[0].playerId)
    const kind = scope === 'league' ? 'league' : scope
    const events = officialAwardsForSeason(STATIC_TEAMS, ps, games, [], 'S1')
    assert.deepEqual(events.filter(e => e.kind === `${kind}-xi`).map(e => e.playerId).sort(), result.bestXI.flatMap(s => s.playerId ? [s.playerId] : []).sort())
    assert.equal(events.find(e => e.kind === `${kind}-mvp`).playerId, result.bestPlayerId)
  }
  const first = awards.awardResultForScope('first-half', 'S1', STATIC_TEAMS, ps, games, [])
  const second = awards.awardResultForScope('second-half', 'S1', STATIC_TEAMS, ps, games, [])
  const firstB = first.candidates.find(c => c.playerId === 'b'), secondB = second.candidates.find(c => c.playerId === 'b')
  assert(secondB.selectionScore - secondB.average > firstB.selectionScore - firstB.average)
})

test('v265 archival teams cannot split half finalization between canonical UI and official events', () => {
  const { p, matches } = leagueSeason()
  const preserved = [...STATIC_TEAMS, { id: 'archival', name: 'Historical team', shortName: 'OLD' }]
  const result = awards.awardResultForScope('first-half', 'S1', preserved, [p], matches, [])
  assert.equal(result.complete, true)
  assert.equal(result.bestPlayerId, officialAwardsForSeason(preserved, [p], matches, [], 'S1').find(event => event.kind === 'first-half-mvp').playerId)
})

test('v265 shared caches invalidate same-length match/player/state replacements and reuse unchanged scope', () => {
  const p = player('cache')
  const matches = [game('1', [p])], players = [p], states = []
  const query = () => awards.awardResultForScope('league', 'S1', teams, players, matches, states)
  const before = query()
  assert.strictEqual(query(), before)
  matches[0] = { ...matches[0], events: [{ id: 'g', type: 'goal', minute: 10, teamId: 'A', playerId: p.id }] }
  const after = query()
  assert.notStrictEqual(after, before)
  assert(after.candidates[0].average > before.candidates[0].average)
  players[0] = { ...p, teamId: 'B', position: 'GK' }
  assert.notStrictEqual(query(), after)
  assert.equal(query().candidates[0].family, 'ATT')
  states.push({ id: 'state', season: 'S1', kind: 'season-complete', teamIds: [] })
  assert.notStrictEqual(query(), after)
})
