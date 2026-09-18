import { competitionHistory, cupCompetition, championsCompetition, CHAMPIONS_ROUNDS, matchCompetitionType } from './competition'
import { competitionAwardResult, monthlyCanonicalAwardResult } from './awards'
import { currentStaticTeams } from '../data/teams'
import { getMatchManOfTheMatch, matchScore, ratePlayerMatch } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision.ts'
import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { oldestMatches } from './matchChronology'
import { buildSeasonAnalytics, rankingMovement } from './seasonAnalytics'

export type NewsKind = 'player' | 'match' | 'team'
export type NewsImportance = 'major' | 'medium' | 'minor'
export type MilestoneScope = 'league' | 'cup' | 'champions' | 'season' | 'career'
export type AttackingMilestoneType = 'goals' | 'assists' | 'goal-contributions' | 'balanced'
export type MilestoneMetadata = { scope: MilestoneScope; type: AttackingMilestoneType; threshold: number; season?: string; competition?: CompetitionType }
export type NewsItem = { id: string; kind: NewsKind; importance?: NewsImportance; date: string; matchId?: string; playerId?: string; teamId?: string; eyebrow: string; title: string; detail: string; context: string; emoji: string; milestone?: MilestoneMetadata }
type NewsDraft = Omit<NewsItem, 'emoji'>
type Totals = { goals: number; assists: number; apps: number; mom: number; saves: number; cleanSheets: number }
type Streak = { scoring: number; contribution: number }
type TeamRun = { wins: number; unbeaten: number; cleanSheets: number; seasonGoals: number; seasonCleanSheets: number }

const EMPTY_STATES: CompetitionState[] = []
type NewsCacheEntry = { revision: number; items: NewsItem[] }
const newsCache = new WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], NewsCacheEntry>>>>()

/** The sole News chronology rule: newest date first, then a stable identity. */
export function sortNewsNewestFirst<T extends { date: string; id: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

type AwardNewsResult = { scopeLabel: string; playerLabel: string; teamLabel: string; bestPlayerId: string; bestXI: { playerId: string | null }[]; anchorMatch: { id: string; date: string } }
const articleIdentity = (label: string) => label.toLowerCase().replace(/ /g, '-').replace('-of-the-month', '-of-month')

/** Projects a previously selected award result into two stable News articles. */
export function awardNewsFromResult(result: AwardNewsResult, nameForPlayer: (id: string) => string): NewsDraft[] {
  const playerIdentity = articleIdentity(result.playerLabel)
  const teamIdentity = articleIdentity(result.teamLabel)
  const xiIdentity = result.bestXI.map(slot => slot.playerId ?? '-').join(':')
  const monthly = result.playerLabel === 'Player of the Month'
  return [
    { id: `award:${playerIdentity}:${result.scopeLabel}:${result.bestPlayerId}`, kind: 'player', importance: 'major', date: result.anchorMatch.date, matchId: result.anchorMatch.id, playerId: result.bestPlayerId, eyebrow: 'AWARDS', title: monthly ? `${nameForPlayer(result.bestPlayerId)} wins ${result.scopeLabel} Player of the Month` : `${nameForPlayer(result.bestPlayerId)} wins ${result.playerLabel}`, detail: monthly ? `A brilliant run of performances earns ${nameForPlayer(result.bestPlayerId)} the ${result.scopeLabel} Player of the Month award.` : `A brilliant run of performances earns ${nameForPlayer(result.bestPlayerId)} the ${result.playerLabel} award.`, context: result.scopeLabel },
    { id: `award:${teamIdentity}:${result.scopeLabel}:${xiIdentity}`, kind: 'team', importance: 'major', date: result.anchorMatch.date, matchId: result.anchorMatch.id, eyebrow: 'AWARDS', title: monthly ? `${result.scopeLabel} Best XI revealed` : `${result.teamLabel} revealed`, detail: monthly ? `The standout performers of ${result.scopeLabel} have been named in the latest Best XI.` : `The standout performers have been named in the ${result.teamLabel}.`, context: result.scopeLabel },
  ]
}

const emptyTotals = (): Totals => ({ goals: 0, assists: 0, apps: 0, mom: 0, saves: 0, cleanSheets: 0 })
const ordered = (matches: Match[]) => oldestMatches([...new Map(matches.map(match => [match.id, match])).values()])
const playerName = (players: Player[], id?: string) => players.find(player => player.id === id)?.displayName ?? players.find(player => player.id === id)?.name ?? 'Player'
const teamName = (teams: Team[], id?: string) => teams.find(team => team.id === id)?.name ?? 'Team'
const competitionName = (type: CompetitionType) => type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'
const scoreText = (match: Match, teams: Team[]) => { const score = matchScore(match); return `${teamName(teams, match.homeTeamId)} ${score.home}-${score.away} ${teamName(teams, match.awayTeamId)} · ${competitionName(matchCompetitionType(match))}` }
const crossed = (before: number, after: number, values: number[]) => values.filter(value => before < value && after >= value)
const multiples = (step: number, max: number, start = step) => Array.from({ length: Math.max(0, Math.floor((max - start) / step) + 1) }, (_, index) => start + index * step)
/** Dynamic, chronology-safe threshold crossing; no fixed maximum threshold list. */
export const crossedThresholds = (before: number, after: number, start: number, step: number) => crossed(before, after, multiples(step, after, start))
const attackingScopeLabel = (scope: MilestoneScope) => scope === 'career' ? 'Career' : scope === 'season' ? 'Season' : scope === 'league' ? 'League' : scope === 'cup' ? 'Cup' : 'Champions'
const attackingImportance = (scope: MilestoneScope, threshold: number, type: AttackingMilestoneType): NewsImportance => {
  if (scope === 'career' && threshold >= 50) return 'major'
  if (type === 'balanced' && threshold >= 20) return threshold >= 25 ? 'major' : 'medium'
  if (scope === 'season') return threshold >= 30 ? 'medium' : 'minor'
  if (scope === 'champions' || scope === 'cup') return threshold >= 10 ? 'medium' : 'minor'
  return threshold >= 30 ? 'medium' : 'minor'
}
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

/** Adds canonical attacking milestone events to the existing derived change feed.
 * Scope and season are part of the identity, so historical edits simply rebuild
 * the correct chronological event rather than leaving persisted stale state. */
function addAttackingMilestones(add: (item: NewsDraft) => void, player: Player, match: Match, scope: MilestoneScope, before: Totals, after: Totals, context: string, competition?: CompetitionType) {
  const seasonPart = scope === 'career' ? '' : `:${match.season}`
  const scopePart = competition ? `:${competition}` : ''
  const label = attackingScopeLabel(scope)
  const emit = (type: AttackingMilestoneType, threshold: number, text: string) => add({
    id: `milestone:${player.id}:${type}:${scope}${scopePart}${seasonPart}:${threshold}`,
    kind: 'player', importance: attackingImportance(scope, threshold, type), date: match.date, matchId: match.id, playerId: player.id,
    eyebrow: `${label.toUpperCase()} MILESTONE`, title: `${playerName([player], player.id)} · ${label} ${text}`,
    detail: scope === 'career' ? 'Across all valid saved matches.' : scope === 'season' ? 'All competitions in this season.' : `${label} matches only in ${match.season}.`, context,
    milestone: { scope, type, threshold, ...(scope === 'career' ? {} : { season: match.season }), ...(competition ? { competition } : {}) },
  })
  for (const threshold of crossedThresholds(before.goals, after.goals, 10, 10)) emit('goals', threshold, `${threshold} Goals`)
  for (const threshold of crossedThresholds(before.assists, after.assists, 10, 10)) emit('assists', threshold, `${threshold} Assists`)
  for (const threshold of crossedThresholds(before.goals + before.assists, after.goals + after.assists, 20, 20)) emit('goal-contributions', threshold, `${threshold} G+A`)
  for (const threshold of crossedThresholds(Math.min(before.goals, before.assists), Math.min(after.goals, after.assists), 10, 5)) emit('balanced', threshold, `${threshold} Goals + ${threshold} Assists`)
}

/**
 * Deterministic milestone projection from raw Match/Event data. Stable IDs make
 * rerenders, hydration, sync and reopening an old match naturally idempotent.
 */
function deriveNewsUncached(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[]): NewsItem[] {
  const items = new Map<string, NewsItem>()
  const add = (item: NewsDraft) => { if (!items.has(item.id)) items.set(item.id, { ...item, emoji: newsEmoji(item) }) }
  const career = new Map<string, Totals>()
  const season = new Map<string, Totals>()
  const competition = new Map<string, Totals>()
  const partnerships = new Map<string, number>()
  const playerRuns = new Map<string, Streak>()
  const teamRuns = new Map<string, TeamRun>()
  const chronological = ordered(matches)
  const analyticsBySeason = new Map([...new Set(matches.map(match => match.season))].map(seasonName => [seasonName, buildSeasonAnalytics(teams, players, matches, seasonName)]))
  const matchesThroughDate = new Map<string, Match[]>()
  const matchesUpTo = (season: string, date: string) => {
    const key = `${season}\u0000${date}`
    const cached = matchesThroughDate.get(key)
    if (cached) return cached
    const selected = matches.filter(item => item.season === season && item.date <= date)
    matchesThroughDate.set(key, selected)
    return selected
  }
  // Track canonical snapshot and knockout transitions for News.
  const teamLeads = new Map<string, boolean>()
  const cupStatus = new Map<string, string[]>()

  for (const match of chronological) {
    const type = matchCompetitionType(match)
    const context = scoreText(match, teams)
    
    // Team News: Knockout Stages (Cup / Champions)
    if (type === 'cup' || type === 'champions') {
        const matchesUpToDate = matchesUpTo(match.season, match.date)
        if (type === 'cup') {
            const cup = cupCompetition(teams, matchesUpToDate, match.season, players)
            const prevActive = cupStatus.get(match.season) || teams.map(t => t.id)
            const currentActive = cup.activeTeamIds
            
            // Elimination check
            for (const teamId of prevActive) {
                if (!currentActive.includes(teamId) && !cup.championId) {
                    add({ id: `cup-eliminated:${match.season}:${teamId}:${match.id}`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'ELIMINATED', title: `${teamName(teams, teamId)} is eliminated from the Cup`, detail: 'Eliminated in knockout stages.', context })
                }
            }
            // Advancement check
            for (const teamId of currentActive) {
                if (!prevActive.includes(teamId)) {
                     add({ id: `cup-advanced:${match.season}:${teamId}:${match.id}`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'ADVANCED', title: `${teamName(teams, teamId)} advances in the Cup`, detail: `Advances to next round.`, context })
                }
            }
            // Winner check
            if (cup.championId && !cupStatus.get(match.season + 'cup-champion')) {
                add({ id: `cup-winner:${match.season}:${cup.championId}:${match.id}`, kind: 'team', date: match.date, matchId: match.id, teamId: cup.championId, eyebrow: 'CHAMPION', title: `${teamName(teams, cup.championId)} wins the Cup`, detail: 'Cup final champion.', context })
                cupStatus.set(match.season + 'cup-champion', ['true'])
            }
            cupStatus.set(match.season, currentActive)
        }
        // Champions League news
        if (type === 'champions') {
            const draw = states.find(s => s.season === match.season && s.kind === 'champions-draw')
            if (draw) {
                const champions = championsCompetition(draw, matchesUpToDate, match.season, players)
                const prevActive = cupStatus.get(match.season + 'champions') || draw.teamIds
                
                // Elimination check
                for (const round of CHAMPIONS_ROUNDS) {
                    const pairings = champions.rounds[round]
                    if (!pairings.length) continue
                    for (const pair of pairings) {
                        if (pair.winnerId) {
                            const eliminated = pair.teamIds.find(id => id !== pair.winnerId)
                            if (eliminated && prevActive.includes(eliminated)) {
                                add({ id: `champions-eliminated:${match.season}:${eliminated}:${match.id}`, kind: 'team', date: match.date, matchId: match.id, teamId: eliminated, eyebrow: 'ELIMINATED', title: `${teamName(teams, eliminated)} is eliminated from the Champions League`, detail: `Eliminated in ${round}.`, context })
                                cupStatus.set(match.season + 'champions', prevActive.filter(id => id !== eliminated))
                            }
                        }
                    }
                }
                
                // Advancement check. The Champions snapshot above is already
                // canonical for this historical checkpoint; do not rebuild all
                // three competitions once per team.
                const compactProgress = (teamId: string) => {
                    if (champions.championId === teamId) return 'Winner'
                    const loss = CHAMPIONS_ROUNDS.find(round => champions.rounds[round].some(pair => pair.teamIds.includes(teamId) && pair.winnerId && pair.winnerId !== teamId))
                    if (loss) return `Eliminated ${{ roundOf16: 'R16', quarterFinal: 'QF', semiFinal: 'SF', final: 'Final' }[loss]}`
                    return ({ roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals', final: 'Final', finalReplay: 'Final Replay' } as Record<string, string>)[champions.currentStage]
                }
                for (const team of teams) {
                    const progress = compactProgress(team.id)
                    const prevProgress = cupStatus.get(match.season + 'champions-progress' + team.id)?.[0] as string | undefined;
                    const stageMap: Record<string, string> = { 'Round of 16': 'Quarter-finals', 'Quarter-finals': 'Semi-finals', 'Semi-finals': 'Final' }
                    if (prevProgress && prevProgress !== progress && stageMap[prevProgress as string] === progress) {
                         add({ id: `champions-advanced:${match.season}:${team.id}:${match.id}`, kind: 'team', date: match.date, matchId: match.id, teamId: team.id, eyebrow: 'ADVANCED', title: `${teamName(teams, team.id)} advances in the Champions League`, detail: `Advances to ${progress}.`, context })
                    }
                    cupStatus.set(match.season + 'champions-progress' + team.id, [progress])
                }

                // Winner check
                if (champions.championId && !cupStatus.get(match.season + 'champions-champion')) {
                    add({ id: `champions-winner:${match.season}:${champions.championId}:${match.id}`, kind: 'team', date: match.date, matchId: match.id, teamId: champions.championId, eyebrow: 'CHAMPION', title: `${teamName(teams, champions.championId)} wins the Champions League`, detail: 'Champions League final winner.', context })
                    cupStatus.set(match.season + 'champions-champion', ['true'])
                }
            }
        }
    }

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
    // ...
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

      addAttackingMilestones(add, player, match, 'season', seasonBefore, seasonAfter, context)
      for (const value of crossed(seasonBefore.mom, seasonAfter.mom, multiples(10, seasonAfter.mom))) add({ id: `season-mom:${match.season}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'MOM MILESTONE', title: `${playerName(players, player.id)} records a ${value}th MOM this season`, detail: 'Calculated from saved match ratings.', context })

      addAttackingMilestones(add, player, match, type, competitionBefore, competitionAfter, context, type)
      addAttackingMilestones(add, player, match, 'career', careerBefore, careerAfter, context)

      for (const [field, step, start] of [['apps', 100, 100], ['mom', 50, 50]] as const) for (const value of crossed(careerBefore[field], careerAfter[field], multiples(step, careerAfter[field], start))) add({ id: `career-${field}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'CAREER MILESTONE', title: `${playerName(players, player.id)} reaches ${value} career ${field === 'apps' ? 'appearances' : field}`, detail: 'Across all seasons and competitions.', context })
      if (isGoalkeeper) {
        for (const value of crossed(seasonBefore.cleanSheets, seasonAfter.cleanSheets, [10, 20])) add({ id: `season-clean-sheets:${match.season}:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'GOALKEEPER MILESTONE', title: `${playerName(players, player.id)} reaches ${value} clean sheets this season`, detail: 'Goalkeeper appearances only.', context })
        for (const value of crossed(careerBefore.cleanSheets, careerAfter.cleanSheets, multiples(50, careerAfter.cleanSheets))) add({ id: `career-clean-sheets:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'GOALKEEPER MILESTONE', title: `${playerName(players, player.id)} records a ${value}th career clean sheet`, detail: 'Across all saved matches.', context })
        for (const value of crossed(careerBefore.saves, careerAfter.saves, [100, 250, 500, 750, 1000, ...multiples(250, careerAfter.saves, 1250)])) add({ id: `career-saves:${player.id}:${value}`, kind: 'player', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'GOALKEEPER MILESTONE', title: `${playerName(players, player.id)} reaches ${value} career saves`, detail: 'Raw goalkeeper save events.', context })
      }

      const contributions = performance.goals + performance.assists
      const matchRating = ratePlayerMatch(match, player)?.rating ?? 0
      const isSubstitute = appearance.role === 'bench' && match.events.some(event => event.type === 'sub' && event.playerInId === player.id)
      const isDefender = ['CB', 'LCB', 'RCB', 'LB', 'LWB', 'RB', 'RWB'].includes(appearance.position)
      let rare: { key: string; title: string } | undefined
      if (performance.goals >= 4) rare = { key: `goals-${performance.goals}`, title: `${playerName(players, player.id)} scores ${performance.goals} in one match` }
      else if (contributions >= 4) rare = { key: `contributions-${contributions}`, title: `${playerName(players, player.id)} delivers ${contributions} goal contributions` }
      else if (performance.goals === 3) rare = { key: 'hat-trick', title: `${playerName(players, player.id)} completes a hat-trick` }
      else if (performance.assists >= 3) rare = { key: `assists-${performance.assists}`, title: `${playerName(players, player.id)} creates ${performance.assists} goals` }
      else if (isGoalkeeper && performance.saves >= 5 && cleanSheet) rare = { key: `saves-clean-${performance.saves}`, title: `${playerName(players, player.id)} makes ${performance.saves} saves in a clean sheet` }
      else if (isSubstitute && performance.goals >= 2) rare = { key: `super-sub-${performance.goals}`, title: `${playerName(players, player.id)} scores ${performance.goals} from the bench` }
      else if (isDefender && contributions >= 2 && conceded === 0) rare = { key: `defender-${contributions}`, title: `${playerName(players, player.id)} combines ${contributions} contributions with a clean sheet` }
      else if (matchRating >= 9) rare = { key: 'rating-9', title: `${playerName(players, player.id)} produces a ${matchRating.toFixed(1)} performance` }
      if (rare) add({ id: `rare:${match.id}:${player.id}:performance`, kind: 'match', importance: matchRating >= 9 || performance.goals >= 3 ? 'major' : 'medium', date: match.date, matchId: match.id, playerId: player.id, eyebrow: 'RARE PERFORMANCE', title: rare.title, detail: matchRating ? matchRating.toFixed(1) : 'Match achievement', context })

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

  // Rank and Monthly Award stories consume the shared season snapshots. They
  // never rebuild historical tables or player leaderboards inside this feed.
  for (const [seasonName, analytics] of analyticsBySeason) {
    for (const [day, snapshot] of analytics.leagueSnapshots) {
      if (!snapshot.complete) continue
      const lastMatch = ordered(snapshot.matches)[snapshot.matches.length - 1]
      if (!lastMatch) continue
      const leader = snapshot.standings[0]
      if (leader && !teamLeads.get(`${seasonName}:${leader.teamId}`)) {
        add({ id: `league-lead:${seasonName}:${leader.teamId}:${day}`, kind: 'team', date: lastMatch.date, matchId: lastMatch.id, teamId: leader.teamId, eyebrow: 'LEAGUE LEAD', title: `${teamName(teams, leader.teamId)} takes the league lead`, detail: `After matchday ${day}.`, context: scoreText(lastMatch, teams) })
        teamLeads.set(`${seasonName}:${leader.teamId}`, true)
      }
      for (const row of snapshot.standings) if (row.movement && Math.abs(row.movement) >= 2) add({ id: `rank:team:${seasonName}:${day}:${row.teamId}`, kind: 'team', importance: row.rank === 1 ? 'major' : 'medium', date: lastMatch.date, matchId: lastMatch.id, teamId: row.teamId, eyebrow: 'LEAGUE MOVEMENT', title: `${teamName(teams, row.teamId)} ${row.movement > 0 ? 'climb' : 'drop'} ${Math.abs(row.movement)} places to #${row.rank}`, detail: `League table after MD${day}.`, context: scoreText(lastMatch, teams) })
      const currentPlayers = analytics.playerSnapshots.get(day)
      const previousPlayers = analytics.playerSnapshots.get(day - 1)
      for (const metric of ['goals', 'assists', 'mom', 'rating'] as const) {
        const movement = rankingMovement(currentPlayers, previousPlayers, metric)
        const rows = currentPlayers?.rows.get(metric) ?? []
        for (const [index, row] of rows.slice(0, 5).entries()) { const delta = movement.get(row.playerId); if (!delta || (Math.abs(delta) < 2 && index > 0)) continue; add({ id: `rank:player:${seasonName}:${day}:${metric}:${row.playerId}`, kind: 'player', importance: index === 0 ? 'major' : 'minor', date: lastMatch.date, matchId: lastMatch.id, playerId: row.playerId, eyebrow: `${metric.toUpperCase()} RACE`, title: `${playerName(players, row.playerId)} moves to #${index + 1} in ${metric === 'rating' ? 'Avg Rating' : metric}`, detail: `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} place${Math.abs(delta) === 1 ? '' : 's'}.`, context: `League · MD${day}` }) }
      }
    }
    for (const award of analytics.monthlyAwards.values()) {
      const finalMatch = analytics.leagueSnapshots.get(award.block.endMatchDay)?.matches.slice(-1)[0]
      const bestPlayerId = award.bestPlayerId
      if (!finalMatch || !bestPlayerId) continue
      for (const article of awardNewsFromResult(monthlyCanonicalAwardResult({ ...award, bestPlayerId }, finalMatch), id => playerName(players, id))) add(article)
    }
  }

  const tournamentTeams = currentStaticTeams(teams)
  for (const history of competitionHistory(teams, matches, players, states)) {
    const winners = ([['league', history.league], ['cup', history.cup], ['champions', history.champions]] as [CompetitionType, string | undefined][]).filter((entry): entry is [CompetitionType, string] => Boolean(entry[1]))
    for (const [type, teamId] of winners) {
      const games = chronological.filter(match => match.season === history.season && matchCompetitionType(match) === type)
      const last = games[games.length - 1]; if (!last) continue
      add({ id: `title:${history.season}:${type}:${teamId}`, kind: 'team', date: last.date, matchId: last.id, teamId, eyebrow: 'CHAMPION', title: `${teamName(teams, teamId)} win the ${competitionName(type)}`, detail: `${history.season} champion.`, context: scoreText(last, teams) })
      const award = competitionAwardResult(type, history.season, tournamentTeams, players, matches, states)
      if (award) for (const article of awardNewsFromResult(award, id => playerName(players, id))) add(article)
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

  return sortNewsNewestFirst([...items.values()])
}

export function deriveNews(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = EMPTY_STATES): NewsItem[] {
  let byPlayers = newsCache.get(matches)
  if (!byPlayers) { byPlayers = new WeakMap(); newsCache.set(matches, byPlayers) }
  let byTeams = byPlayers.get(players)
  if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }
  let byStates = byTeams.get(teams)
  if (!byStates) { byStates = new WeakMap(); byTeams.set(teams, byStates) }
  const cached = byStates.get(states)
  if (cached?.revision === RATING_ENGINE_REVISION) return cached.items
  const result = deriveNewsUncached(players, teams, matches, states)
  byStates.set(states, { revision: RATING_ENGINE_REVISION, items: result })
  return result
}

export function homeMilestoneNews(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = EMPTY_STATES): NewsItem[] {
  return deriveNews(players, teams, matches, states).slice(0, 5)
}

/** Presentation-only grouping for Match Detail. Canonical milestone events stay
 * separate in deriveNews so history, deduplication and edit reversal remain exact. */
export function groupMatchChanges(items: NewsItem[], players: Player[]) {
  const grouped = new Map<string, NewsItem[]>()
  const ordinary: { id: string; title: string; detail: string }[] = []
  for (const item of items) {
    if (!item.milestone || !item.playerId) { ordinary.push(item); continue }
    const rows = grouped.get(item.playerId) ?? []; rows.push(item); grouped.set(item.playerId, rows)
  }
  return [...grouped.entries()].map(([playerId, rows]) => ({ id: `milestones:${rows[0].matchId}:${playerId}`, title: `${playerName(players, playerId)} · Milestones`, detail: rows.map(row => row.title.replace(/^.*? · /, '')).join(' · ') })).concat(ordinary)
}
