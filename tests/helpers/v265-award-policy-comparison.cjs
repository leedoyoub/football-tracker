const assert = require('node:assert/strict')

// The v2.6.5 exception is deliberately field-scoped. Ratings, tournament
// results, scorer/assister/GK awards, rankings and ordinary News stay strict.
const selectionKeys = new Set(['mvp', 'ballon', 'bestPlayerId', 'bestXI', 'statsByPlayer', 'candidates'])
const retiredEvent = /^(monthly-player|monthly-xi|champions-round-player|champions-round-xi|cup-final|champions-final)$/
const selectionEvent = /^(first-half|second-half|league|cup|champions|season)-(mvp|xi)$/
const withoutSelection = value => value && Object.fromEntries(Object.entries(value).filter(([key]) => !selectionKeys.has(key)))
const isAwardArticle = item => item.id.startsWith('award:')
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`)
const validated = new WeakSet()
const groups = [ ['GK', 'GK', 'GK'], ['LB', 'LB', 'LB'], ['LCB', 'CB', 'CB'], ['RCB', 'CB', 'CB'], ['RB', 'RB', 'RB'], ['LCM', 'CM', 'MID'], ['CM', 'CM', 'MID'], ['RCM', 'CM', 'MID'], ['LW', 'LW', 'ATT'], ['ST', 'ST', 'ATT'], ['RW', 'RW', 'ATT'] ]
const rank = (a, b) => b.selectionScore - a.selectionScore || b.appearances - a.appearances || b.mom - a.mom || b.minutes - a.minutes || b.latestRating - a.latestRating || (b.goals + b.assists) - (a.goals + a.assists) || a.playerId.localeCompare(b.playerId)

function placementBase(type, teamId, status) {
  if (type === 'league') return [.3, .21, .15, .105, .09, .075, .0675, .06, .0525, .045, .0375, .03, .0225, .015, .0075, 0][(status.league.standings.find(row => row.teamId === teamId)?.rank ?? 99) - 1] ?? 0
  const model = status[type]
  if (model.championId === teamId) return .3
  if (model.runnerUpId === teamId) return .21
  if (type === 'cup') {
    const stage = model.eliminatedAtByTeam[teamId] ?? (model.activeTeamIds.includes(teamId) ? Number(model.stage.replace('stage', '')) : 0)
    if (!model.eliminatedAtByTeam[teamId] && model.activeTeamIds.includes(teamId) && ['final', 'finalReplay'].includes(model.stage)) return .21
    return stage === 7 ? .12 : stage === 5 || stage === 6 ? .06 : 0
  }
  if (model.rounds.final.some(pair => pair.teamIds.includes(teamId))) return .21
  if (model.rounds.semiFinal.some(pair => pair.teamIds.includes(teamId))) return .12
  return model.rounds.quarterFinal.some(pair => pair.teamIds.includes(teamId)) ? .06 : 0
}

function assertSelection(award, scope, season, teams, players, matches, states = []) {
  if (!award) return
  const candidates = award.candidates ?? []
  assert.equal(new Set(candidates.map(row => row.playerId)).size, candidates.length, 'one candidate per permanent player ID')
  assert.deepEqual(candidates, candidates.slice().sort(rank), 'Race uses the complete deterministic cumulative ordering')
  const selected = new Set()
  const expectedXI = groups.map(([slot, position, family]) => {
    const candidate = candidates.find(row => row.family === family && !selected.has(row.playerId))
    if (!candidate) return { slot, position, playerId: null, avgRating: 0, matches: 0 }
    selected.add(candidate.playerId)
    return { slot, position, playerId: candidate.playerId, teamId: candidate.teamId, avgRating: candidate.average, matches: candidate.appearances }
  })
  assert.deepEqual(award.bestXI, expectedXI, 'six unchanged groups select the highest ranked eligible player exactly once')
  const mvp = candidates.find(row => selected.has(row.playerId))
  if ('bestPlayerId' in award) assert.equal(award.bestPlayerId, mvp?.playerId)
  for (const key of ['mvp', 'ballon']) if (key in award) assert.deepEqual(award[key], mvp ? { playerId: mvp.playerId, value: mvp.average, awardScore: mvp.selectionScore, label: 'Avg Rating', teamId: mvp.teamId } : undefined)
  if (award.statsByPlayer) assert.deepEqual(award.statsByPlayer, Object.fromEntries(candidates.filter(row => selected.has(row.playerId)).map(row => [row.playerId, { goals: row.goals, assists: row.assists, avgRating: row.average }])))
  if (validated.has(candidates)) return
  const { competitionIdentityForMatch } = require('../../src/engine/competitionContext.ts')
  const { competitionSeasonStatus, leagueCompetition } = require('../../src/engine/competition.ts')
  const { ratePlayerMatch } = require('../../src/engine/rating.ts')
  const { creditedMinutesPlayed } = require('../../src/engine/timeline.ts')
  const { isRecordedForTeam } = require('../../src/engine/matchPerspective.ts')
  const seasonGames = matches.filter(match => match.season === season)
  const games = seasonGames.filter(match => {
    const identity = competitionIdentityForMatch(match)
    return scope === 'season' || identity.competitionType === scope || identity.competitionType === 'league' && (scope === 'first-half' ? identity.matchDay >= 1 && identity.matchDay <= 15 : scope === 'second-half' && identity.matchDay >= 16 && identity.matchDay <= 30)
  })
  const scopeTeams = scope.includes('half') ? require('../../src/data/teams.ts').currentStaticTeams(teams) : teams
  const status = competitionSeasonStatus(scopeTeams, matches, season, players, states.find(state => state.kind === 'champions-draw' && state.season === season))
  if (scope === 'first-half' || scope === 'second-half') status.league = leagueCompetition(scopeTeams, games, season, players)
  for (const row of candidates) {
    const player = players.find(player => player.id === row.playerId)
    const seenMatches = new Set()
    const appearances = games.flatMap(match => {
      // Repeated references to one saved match are not a second played game.
      if (seenMatches.has(match.id)) return []
      seenMatches.add(match.id)
      const appearance = match.appearances.find(appearance => appearance.playerId === row.playerId)
      return appearance && creditedMinutesPlayed(match, appearance) > 0 ? [{ match, appearance, rating: ratePlayerMatch(match, player) }] : []
    })
    assert.equal(row.appearances, appearances.length, 'one arithmetic sample per credited match')
    near(row.minutes, appearances.reduce((sum, sample) => sum + Math.min(90, creditedMinutesPlayed(sample.match, sample.appearance)), 0), 'regulation minutes')
    near(row.average, appearances.reduce((sum, sample) => sum + sample.rating.raw, 0) / appearances.length, 'raw arithmetic average')
    assert(row.availableMinutes > 0 && row.minutes >= .5 * row.availableMinutes, 'every candidate clears the 50% opportunity-minute gate')
    near(row.selectionScore, row.average + row.teamPerformanceBonus, 'only the team participation term changes selection score')
    assert(row.teamPerformanceBonus >= 0 && row.teamPerformanceBonus <= (scope === 'season' ? .48 : .3) + 1e-9)
    const evidencedTeams = new Set(seasonGames.flatMap(match => match.appearances.filter(a => a.playerId === row.playerId && isRecordedForTeam(match, a.teamId)).map(a => a.teamId)))
    // Single-stint histories have an independently observable denominator.
    // Transfer boundaries/delayed rounds are covered by the focused v265 tests.
    if (evidencedTeams.size === 1 && new Set(games.map(match => match.id)).size === games.length) {
      const teamId = [...evidencedTeams][0]
      const available = games.filter(match => isRecordedForTeam(match, teamId))
      assert.equal(row.availableMinutes, available.length * 90, 'single-stint denominator is the actual recorded team schedule')
      let expectedBonus = 0
      for (const type of ['league', 'champions', 'cup']) {
        const opportunityMinutes = available.filter(match => competitionIdentityForMatch(match).competitionType === type).length * 90
        const playedMinutes = appearances.filter(sample => competitionIdentityForMatch(sample.match).competitionType === type).reduce((sum, sample) => sum + Math.min(90, creditedMinutesPlayed(sample.match, sample.appearance)), 0)
        const weight = scope === 'season' ? { league: .7, champions: .6, cup: .3 }[type] : type === (scope.includes('half') ? 'league' : scope) ? 1 : 0
        if (opportunityMinutes) expectedBonus += weight * placementBase(type, teamId, status) * Math.min(1, playedMinutes / opportunityMinutes)
      }
      near(row.teamPerformanceBonus, expectedBonus, 'placement base × competition-specific participation × scope weight')
    }
  }
  validated.add(candidates)
}

function assertNewsPolicy(actual, original, args, fn = 'deriveNews') {
  const [players, teams, matches, states = [], season] = args
  const { sortNewsNewestFirst, awardNewsFromResult } = require('../../src/engine/news.ts')
  const { awardResultForScope } = require('../../src/engine/awards.ts')
  const { competitionHistory } = require('../../src/engine/competition.ts')
  const { currentStaticTeams } = require('../../src/data/teams.ts')
  assert.deepEqual(actual.filter(item => !isAwardArticle(item)), original.filter(item => !isAwardArticle(item)), 'every non-award article retains all fields and relative order')
  assert.deepEqual(actual, sortNewsNewestFirst(actual, matches), 'the entire feed keeps canonical chronology')
  const expected = []
  for (const history of competitionHistory(teams, matches, players, states)) {
    for (const scope of ['first-half', 'second-half', ...['league', 'cup', 'champions'].filter(type => history[type])]) {
      if (season && history.season !== season) continue
      const scopeTeams = scope.includes('half') ? teams : currentStaticTeams(teams)
      const result = awardResultForScope(scope, history.season, scopeTeams, players, matches, states)
      if (!result?.complete) continue
      assertSelection(result, scope, history.season, scopeTeams, players, matches, states)
      const articles = awardNewsFromResult(result, id => players.find(player => player.id === id)?.displayName ?? players.find(player => player.id === id)?.name ?? 'Player')
      for (const article of articles) {
        const text = `${article.eyebrow} ${article.title}`.toLowerCase()
        const emoji = text.includes('champion') ? text.includes('league') ? '👑' : text.includes('cup') ? '🥇' : '🏆' : text.includes('partnership') ? '🤝' : /goalkeeper|clean sheet|save/.test(text) ? '🧤' : text.includes('hat-trick') ? '🎩' : /assist|creates/.test(text) ? '🅰️' : /streak|form|winning|unbeaten/.test(text) ? '🔥' : /mom|rare performance/.test(text) ? '🌟' : /goal|scoring/.test(text) ? '⚽' : '🏅'
        expected.push(fn === 'deriveNews' ? { ...article, emoji } : { ...article, emoji, surface: 'news', matchChange: { kind: 'competition', label: article.title } })
      }
    }
  }
  assert.deepEqual(actual.filter(isAwardArticle), sortNewsNewestFirst(expected, matches), 'award articles are exactly the finalized canonical half/competition MVP and XI results')
  assert(actual.every(item => !/^award:(player-of-month|team-of-month|champions-player-of-the-round|champions-team-of-the-round|cup-player-of-the-final|champions-player-of-the-final):/.test(item.id)), 'no retired award articles')
}

function withoutAwardChanges(groups, validate = false) {
  const summarize = (group, items) => {
    const first = items[0]
    return { ...group, date: first.date, matchId: first.matchId, items, playerIds: [...new Set(items.flatMap(item => item.playerId ? [item.playerId] : []))], teamIds: [...new Set(items.flatMap(item => item.teamId ? [item.teamId] : []))], title: first.title, detail: items.length > 1 ? `${first.detail} · ${items.length - 1} more change${items.length === 2 ? '' : 's'}` : first.detail }
  }
  return groups.flatMap(group => {
    if (validate) assert.deepEqual(group, summarize(group, group.items), 'Latest Changes summary derives from every retained item')
    const items = group.items.filter(item => !isAwardArticle(item))
    return items.length ? [summarize(group, items)] : []
  })
}

function assertLatestPolicy(actual, original, args) {
  assert.deepEqual(withoutAwardChanges(actual, true), withoutAwardChanges(original), 'all non-award Latest Changes items, groups and summaries stay strict')
  const [players, teams, matches, states = [], season] = args
  const { deriveNews } = require('../../src/engine/news.ts')
  const articles = new Map(deriveNews(players, teams, matches, states).filter(isAwardArticle).map(item => [item.id, item]))
  const seasonForMatch = new Map(matches.map(match => [match.id, match.season]))
  const expected = [...articles.values()].filter(item => !season || seasonForMatch.get(item.matchId) === season).map(item => ({ id: item.id, kind: item.kind, title: item.title, detail: item.detail, context: item.context, emoji: item.emoji, playerId: item.playerId, teamId: item.teamId, matchId: item.matchId, date: item.date, category: 'competition' })).sort((a, b) => a.id.localeCompare(b.id))
  assert.deepEqual(actual.flatMap(group => group.items.filter(isAwardArticle)).sort((a, b) => a.id.localeCompare(b.id)), expected, 'Latest Changes projects every canonical award article exactly once')
}

module.exports = { withoutSelection, retiredEvent, selectionEvent, assertSelection, assertNewsPolicy, assertLatestPolicy, withoutAwardChanges }
