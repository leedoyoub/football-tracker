import { competitionHistory, matchCompetitionType } from './competition'
import { getMatchManOfTheMatch, matchScore, ratePlayerMatch } from './rating'
import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'

export type NewsKind = 'player' | 'match' | 'team'
export type NewsItem = { id: string; kind: NewsKind; date: string; matchId?: string; playerId?: string; teamId?: string; eyebrow: string; title: string; detail: string; context: string; emoji: string }
type NewsDraft = Omit<NewsItem, 'emoji'>
type Totals = { goals: number; assists: number; apps: number; mom: number; saves: number; cleanSheets: number }
type Streak = { scoring: number; contribution: number }
type TeamRun = { wins: number; unbeaten: number; cleanSheets: number; seasonGoals: number; seasonCleanSheets: number }

const emptyTotals = (): Totals => ({ goals: 0, assists: 0, apps: 0, mom: 0, saves: 0, cleanSheets: 0 })
const ordered = (matches: Match[]) => [...new Map(matches.map(match => [match.id, match])).values()].sort((a, b) => a.date.localeCompare(b.date) || a.matchDay - b.matchDay || a.id.localeCompare(b.id))
const playerName = (players: Player[], id?: string) => players.find(player => player.id === id)?.displayName ?? players.find(player => player.id === id)?.name ?? 'Player'
const teamName = (teams: Team[], id?: string) => teams.find(team => team.id === id)?.name ?? 'Team'
const competitionName = (type: CompetitionType) => type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'
const scoreText = (match: Match, teams: Team[]) => { const score = matchScore(match); return `${teamName(teams, match.homeTeamId)} ${score.home}-${score.away} ${teamName(teams, match.awayTeamId)} · ${competitionName(matchCompetitionType(match))}` }
const crossed = (before: number, after: number, values: number[]) => values.filter(value => before < value && after >= value)
const multiples = (step: number, max: number, start = step) => Array.from({ length: Math.max(0, Math.floor((max - start) / step) + 1) }, (_, index) => start + index * step)
const didAppear = (match: Match, playerId: string) => { const appearance = match.appearances.find(item => item.playerId === playerId); return Boolean(appearance && (appearance.role === 'starter' || match.events.some(event => event.type === 'sub' && event.playerInId === playerId))) }
const newsEmoji = (item: NewsDraft) => {
  const text = `${item.eyebrow} ${item.title}`.toLowerCase()
  if (text.includes('champion')) return text.includes('league') ? '👑' : text.includes('cup') ? '🥇' : text.includes('champions') ? '🏆' : '🏆'
  if (text.includes('partnership')) return '🤝'
  if (text.includes('goalkeeper') || text.includes('clean sheet') || text.includes('save')) return '🧤'
  if (text.includes('hat-trick')) return '🎩'
  if (text.includes('assist') || text.includes('creates')) return '🅰️'
  if (text.includes('streak') || text.includes('form') || text.includes('winning') || text.includes('unbeaten')) return '🔥'
  if (text.includes('mom') || text.includes('rare performance')) return '🌟'
  if (text.includes('goal') || text.includes('scoring')) return '⚽'
  return '🏅'
}

/**
 * Deterministic milestone projection from raw Match/Event data. Stable IDs make
 * rerenders, hydration, sync and reopening an old match naturally idempotent.
 */
export function deriveNews(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = []): NewsItem[] {
  const items = new Map<string, NewsItem>()
  const add = (item: NewsDraft) => { if (!items.has(item.id)) items.set(item.id, { ...item, emoji: newsEmoji(item) }) }
  const career = new Map<string, Totals>()
  const season = new Map<string, Totals>()
  const competition = new Map<string, Totals>()
  const partnerships = new Map<string, number>()
  const playerRuns = new Map<string, Streak>()
  const teamRuns = new Map<string, TeamRun>()
  const chronological = ordered(matches)

  for (const match of chronological) {
    const type = matchCompetitionType(match)
    const context = scoreText(match, teams)
    const perPlayer = new Map<string, { goals: number; assists: number; saves: number }>()
    const rowFor = (id: string) => { const row = perPlayer.get(id) ?? { goals: 0, assists: 0, saves: 0 }; perPlayer.set(id, row); return row }
    for (const event of match.events) {
      if (event.type === 'goal' && !event.ownGoal) {
        if (event.playerId) rowFor(event.playerId).goals++
        if (event.assistPlayerId) rowFor(event.assistPlayerId).assists++
        if (event.playerId && event.assistPlayerId) {
          const pair = [event.playerId, event.assistPlayerId].sort()
          const key = `${pair[0]}:${pair[1]}`; const before = partnerships.get(key) ?? 0; const after = before + 1; partnerships.set(key, after)
          for (const value of crossed(before, after, [10, 20, 30, 50, ...multiples(25, after, 75)])) add({ id: `combo-goals:${key}:${value}`, kind: 'player', date: match.date, matchId: match.id, eyebrow: 'PARTNERSHIP MILESTONE', title: `${playerName(players, pair[0])} & ${playerName(players, pair[1])} combine for their ${value}th goal`, detail: 'Both assist directions count toward this partnership.', context })
        }
      }
      if (event.type === 'save') rowFor(event.playerId).saves += event.count ?? 1
    }
    const momId = getMatchManOfTheMatch(match, players)
    for (const player of players) {
      if (!didAppear(match, player.id)) continue
      const performance = perPlayer.get(player.id) ?? { goals: 0, assists: 0, saves: 0 }
      const appearance = match.appearances.find(item => item.playerId === player.id)!
      const isGoalkeeper = appearance.position === 'GK' || appearance.matchPosition === 'GK'
      const score = matchScore(match); const conceded = appearance.teamId === match.homeTeamId ? score.away : score.home
      const cleanSheet = Number(isGoalkeeper && conceded === 0)
      const isMom = Number(momId === player.id)
      const careerBefore = career.get(player.id) ?? emptyTotals()
      const seasonKey = `${match.season}:${player.id}`; const seasonBefore = season.get(seasonKey) ?? emptyTotals()
      const competitionKey = `${match.season}:${type}:${player.id}`; const competitionBefore = competition.get(competitionKey) ?? emptyTotals()
      const delta = { goals: performance.goals, assists: performance.assists, apps: 1, mom: isMom, saves: performance.saves, cleanSheets: cleanSheet }
      const sum = (base: Totals): Totals => ({ goals: base.goals + delta.goals, assists: base.assists + delta.assists, apps: base.apps + 1, mom: base.mom + delta.mom, saves: base.saves + delta.saves, cleanSheets: base.cleanSheets + delta.cleanSheets })
      const careerAfter = sum(careerBefore); const seasonAfter = sum(seasonBefore); const competitionAfter = sum(competitionBefore)
      career.set(player.id, careerAfter); season.set(seasonKey, seasonAfter); competition.set(competitionKey, competitionAfter)

      for (const value of crossed(seasonBefore.goals, seasonAfter.goals, multiples(10, seasonAfter.goals))) add({ id: `season-goals:${match.season}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'SEASON MILESTONE', title: `${playerName(players, player.id)} reaches ${value} goals this season`, detail: 'All competitions combined.', context })
      for (const value of crossed(seasonBefore.assists, seasonAfter.assists, multiples(10, seasonAfter.assists))) add({ id: `season-assists:${match.season}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'SEASON MILESTONE', title: `${playerName(players, player.id)} reaches ${value} assists this season`, detail: 'All competitions combined.', context })
      for (const value of [10, 20]) if ((seasonBefore.goals < value || seasonBefore.assists < value) && seasonAfter.goals >= value && seasonAfter.assists >= value) add({ id: `season-combo:${match.season}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'COMPLETE SEASON', title: `${playerName(players, player.id)} completes a ${value}–${value} season`, detail: `${seasonAfter.goals} goals and ${seasonAfter.assists} assists.`, context })
      for (const value of crossed(seasonBefore.mom, seasonAfter.mom, multiples(10, seasonAfter.mom))) add({ id: `season-mom:${match.season}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'MOM MILESTONE', title: `${playerName(players, player.id)} records a ${value}th MOM this season`, detail: 'Calculated from saved match ratings.', context })

      const competitionStep = type === 'league' ? 10 : 5
      for (const field of ['goals', 'assists'] as const) for (const value of crossed(competitionBefore[field], competitionAfter[field], multiples(competitionStep, competitionAfter[field]))) add({ id: `competition-${field}:${match.season}:${type}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: `${competitionName(type).toUpperCase()} MILESTONE`, title: `${playerName(players, player.id)} reaches ${value} ${competitionName(type)} ${field} this season`, detail: `${competitionName(type)} matches only.`, context })

      for (const [field, step, start] of [['goals', 50, 50], ['assists', 50, 50], ['apps', 100, 100], ['mom', 50, 50]] as const) for (const value of crossed(careerBefore[field], careerAfter[field], multiples(step, careerAfter[field], start))) add({ id: `career-${field}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'CAREER MILESTONE', title: `${playerName(players, player.id)} reaches ${value} career ${field === 'apps' ? 'appearances' : field}`, detail: 'Across all seasons and competitions.', context })
      // Retain the established first landmark without creating repeated low-value career news.
      for (const value of crossed(careerBefore.goals, careerAfter.goals, [10])) add({ id: `player:milestone:${match.id}:${player.id}:goals`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'CAREER MILESTONE', title: `${playerName(players, player.id)} reaches ${value} career goals`, detail: 'Across all saved matches.', context })
      if (isGoalkeeper) {
        for (const value of crossed(seasonBefore.cleanSheets, seasonAfter.cleanSheets, [10, 20])) add({ id: `season-clean-sheets:${match.season}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'GOALKEEPER MILESTONE', title: `${playerName(players, player.id)} reaches ${value} clean sheets this season`, detail: 'Goalkeeper appearances only.', context })
        for (const value of crossed(careerBefore.cleanSheets, careerAfter.cleanSheets, multiples(50, careerAfter.cleanSheets))) add({ id: `career-clean-sheets:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'GOALKEEPER MILESTONE', title: `${playerName(players, player.id)} records a ${value}th career clean sheet`, detail: 'Across all saved matches.', context })
        for (const value of crossed(careerBefore.saves, careerAfter.saves, [100, 250, 500, 750, 1000, ...multiples(250, careerAfter.saves, 1250)])) add({ id: `career-saves:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'GOALKEEPER MILESTONE', title: `${playerName(players, player.id)} reaches ${value} career saves`, detail: 'Raw goalkeeper save events.', context })
      }

      const contributions = performance.goals + performance.assists
      let rare: { key: string; title: string } | undefined
      if (performance.goals >= 4) rare = { key: `goals-${performance.goals}`, title: `${playerName(players, player.id)} scores ${performance.goals} in one match` }
      else if (contributions >= 5) rare = { key: `contributions-${contributions}`, title: `${playerName(players, player.id)} delivers ${contributions} goal contributions` }
      else if (performance.goals === 3) rare = { key: 'hat-trick', title: `${playerName(players, player.id)} completes a hat-trick` }
      else if (performance.assists >= 3) rare = { key: `assists-${performance.assists}`, title: `${playerName(players, player.id)} creates ${performance.assists} goals` }
      else if (isGoalkeeper && performance.saves >= 10) rare = { key: 'saves-10', title: `${playerName(players, player.id)} makes ${performance.saves} saves` }
      else if (isGoalkeeper && performance.saves >= 7) rare = { key: 'saves-7', title: `${playerName(players, player.id)} produces a ${performance.saves}-save performance` }
      if (rare) add({ id: `rare:${match.id}:${player.id}:${rare.key}`, kind: 'match', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'RARE PERFORMANCE', title: rare.title, detail: ratePlayerMatch(match, player)?.rating.toFixed(1) ?? 'Match achievement', context })

      const run = playerRuns.get(player.id) ?? { scoring: 0, contribution: 0 }
      run.scoring = performance.goals ? run.scoring + 1 : 0; run.contribution = contributions ? run.contribution + 1 : 0; playerRuns.set(player.id, run)
      if (run.scoring === 5) add({ id: `streak:scoring:${match.id}:${player.id}:5`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'SCORING STREAK', title: `${playerName(players, player.id)} scores in 5 consecutive appearances`, detail: 'Matches without an appearance are ignored.', context })
      if (run.contribution === 5) add({ id: `streak:contribution:${match.id}:${player.id}:5`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'FORM STREAK', title: `${playerName(players, player.id)} contributes in 5 consecutive appearances`, detail: 'Goal or assist in each appearance.', context })
    }

    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (!teams.some(team => team.id === teamId)) continue
      const score = matchScore(match); const ours = teamId === match.homeTeamId ? score.home : score.away; const theirs = teamId === match.homeTeamId ? score.away : score.home
      const key = `${match.season}:${teamId}`; const run = teamRuns.get(key) ?? { wins: 0, unbeaten: 0, cleanSheets: 0, seasonGoals: 0, seasonCleanSheets: 0 }
      const priorGoals = run.seasonGoals; const priorCleanSheets = run.seasonCleanSheets
      run.wins = ours > theirs ? run.wins + 1 : 0; run.unbeaten = ours >= theirs ? run.unbeaten + 1 : 0; run.cleanSheets = theirs === 0 ? run.cleanSheets + 1 : 0; run.seasonGoals += ours; run.seasonCleanSheets += Number(theirs === 0); teamRuns.set(key, run)
      for (const value of [5, 10]) if (run.wins === value) add({ id: `team-win-streak:${match.season}:${teamId}:${match.id}:${value}`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'WINNING STREAK', title: `${teamName(teams, teamId)} win ${value} consecutive matches`, detail: 'All competitions combined.', context })
      for (const value of [10, 15]) if (run.unbeaten === value) add({ id: `team-unbeaten:${match.season}:${teamId}:${match.id}:${value}`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'UNBEATEN RUN', title: `${teamName(teams, teamId)} go ${value} matches unbeaten`, detail: 'All competitions combined.', context })
      if (run.cleanSheets === 5) add({ id: `team-clean-streak:${match.season}:${teamId}:${match.id}:5`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'DEFENSIVE STREAK', title: `${teamName(teams, teamId)} keep 5 consecutive clean sheets`, detail: 'All competitions combined.', context })
      for (const value of crossed(priorGoals, run.seasonGoals, [50, 100, 150, ...multiples(50, run.seasonGoals, 200)])) add({ id: `team-season-goals:${match.season}:${teamId}:${value}`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'TEAM MILESTONE', title: `${teamName(teams, teamId)} reach ${value} goals this season`, detail: 'All competitions combined.', context })
      for (const value of crossed(priorCleanSheets, run.seasonCleanSheets, [10, 20])) add({ id: `team-season-clean-sheets:${match.season}:${teamId}:${value}`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'TEAM MILESTONE', title: `${teamName(teams, teamId)} reach ${value} clean sheets this season`, detail: 'All competitions combined.', context })
    }
  }

  for (const history of competitionHistory(teams, matches, players, states)) {
    const winners = ([['league', history.league], ['cup', history.cup], ['champions', history.champions]] as [CompetitionType, string | undefined][]).filter((entry): entry is [CompetitionType, string] => Boolean(entry[1]))
    for (const [type, teamId] of winners) {
      const games = chronological.filter(match => match.season === history.season && matchCompetitionType(match) === type)
      const last = games[games.length - 1]; if (!last) continue
      add({ id: `title:${history.season}:${type}:${teamId}`, kind: 'team', date: last.date, matchId: last.id, teamId, eyebrow: 'CHAMPION', title: `${teamName(teams, teamId)} win the ${competitionName(type)}`, detail: `${history.season} champion.`, context: scoreText(last, teams) })
    }
    const byTeam = new Map<string, CompetitionType[]>()
    for (const [type, teamId] of winners) byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), type])
    for (const [teamId, titles] of byTeam) if (titles.length >= 2) {
      const relevant = chronological.filter(match => match.season === history.season && titles.includes(matchCompetitionType(match))); const last = relevant[relevant.length - 1]; if (!last) continue
      add({ id: `${titles.length === 3 ? 'treble' : 'double'}:${history.season}:${teamId}`, kind: 'team', date: last.date, matchId: last.id, teamId, eyebrow: titles.length === 3 ? 'TREBLE' : 'SEASON DOUBLE', title: `${teamName(teams, teamId)} complete the ${titles.length === 3 ? 'Treble' : 'Double'}`, detail: titles.map(competitionName).join(', '), context: history.season })
    }
  }

  for (const field of ['goals', 'assists'] as const) {
    const leaders = [...career.entries()].filter(([, totals]) => totals[field] > 0).sort((a, b) => b[1][field] - a[1][field] || a[0].localeCompare(b[0]))
    if (leaders.length > 1 && leaders[0][1][field] > leaders[1][1][field]) {
      const [playerId, totals] = leaders[0]
      const playerGames = chronological.filter(match => didAppear(match, playerId)); const last = playerGames[playerGames.length - 1]
      if (last) add({ id: `record:all-time-${field}:${playerId}:${totals[field]}`, kind: 'player', date: last.date, matchId: last.id, playerId, eyebrow: 'ALL-TIME RECORD', title: `${playerName(players, playerId)} becomes the app's all-time ${field === 'goals' ? 'leading scorer' : 'assist leader'}`, detail: `${totals[field]} career ${field}.`, context: scoreText(last, teams) })
    }
  }
  const seasonNames = [...new Set(matches.map(match => match.season))].sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
  for (const field of ['goals', 'assists'] as const) {
    let priorRecord = 0
    for (const seasonName of seasonNames) {
      const leaders = players.map(player => ({ playerId: player.id, value: season.get(`${seasonName}:${player.id}`)?.[field] ?? 0 })).sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId))
      const leader = leaders[0]
      if (leader && priorRecord > 0 && leader.value > priorRecord) {
        const seasonGames = chronological.filter(match => match.season === seasonName); const last = seasonGames[seasonGames.length - 1]
        if (last) add({ id: `record:season-${field}:${seasonName}:${leader.playerId}:${leader.value}`, kind: 'player', date: last.date, matchId: last.id, playerId: leader.playerId, eyebrow: 'SEASON RECORD', title: `${playerName(players, leader.playerId)} sets a new single-season ${field} record`, detail: `${leader.value} ${field}, surpassing ${priorRecord}.`, context: seasonName })
      }
      priorRecord = Math.max(priorRecord, leader?.value ?? 0)
    }
  }

  return [...items.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

export function homeMilestoneNews(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = []): NewsItem[] {
  return deriveNews(players, teams, matches, states).slice(0, 5)
}
