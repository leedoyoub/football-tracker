import type { CompetitionState, Match, MatchChangePayload, Player, Team } from '../types'
import { oldestMatches } from './matchChronology'
import { matchCompetitionType } from './competitionContext'
import { getMatchManOfTheMatch, matchScore } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { measureInDevelopment } from '../lib/developmentMeasurement'

export type GroupedMatchChangeItem = { id: string; label: string; kind: MatchChangePayload['kind'] }
export type GroupedMatchChange = { id: string; playerId?: string; title: string; detail: string; eventIds: string[]; items: GroupedMatchChangeItem[] }
type Totals = { goals: number; assists: number; apps: number; mom: number; saves: number; cleanSheets: number }
type Streak = { scoring: number; contribution: number }
const EMPTY_STATES: CompetitionState[] = []
const empty = (): Totals => ({ goals: 0, assists: 0, apps: 0, mom: 0, saves: 0, cleanSheets: 0 })
const crossed = (before: number, after: number, values: number[]) => values.filter(value => before < value && after >= value)
const multiples = (step: number, max: number, start = step) => Array.from({ length: Math.max(0, Math.floor((max - start) / step) + 1) }, (_, index) => start + index * step)
const name = (players: Player[], id: string) => players.find(p => p.id === id)?.displayName ?? players.find(p => p.id === id)?.name ?? 'Player'
const scopeName = (type: ReturnType<typeof matchCompetitionType>) => type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'
let cache = new WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], { revision: number; value: Map<string, GroupedMatchChange[]> }>>>>()

function add(groups: Map<string, GroupedMatchChange>, matchId: string, players: Player[], playerId: string | undefined, id: string, label: string, kind: MatchChangePayload['kind']) {
  const key = playerId ? `player:${playerId}` : `event:${id}`
  let group = groups.get(key)
  if (!group) { group = { id: `match-change:${matchId}:${key}`, playerId, title: playerId ? `${name(players, playerId)} · Changes` : 'Match Changes', detail: '', eventIds: [], items: [] }; groups.set(key, group) }
  group.detail = group.detail ? `${group.detail} · ${label}` : label; group.eventIds.push(id); group.items.push({ id, label, kind })
}

function milestone(groups: Map<string, GroupedMatchChange>, players: Player[], match: Match, player: Player, scope: string, before: Totals, after: Totals) {
  const scopeLabel = scope === 'career' ? 'Career' : scope === 'season' ? 'Season' : scopeName(scope as ReturnType<typeof matchCompetitionType>)
  const emit = (kind: string, value: number, label: string) => add(groups, match.id, players, player.id, `milestone:${player.id}:${kind}:${scope}:${match.season}:${value}`, `${scopeLabel} ${label}`, 'milestone')
  for (const value of crossed(before.goals, after.goals, multiples(10, after.goals, 10))) emit('goals', value, `${value} Goals`)
  for (const value of crossed(before.assists, after.assists, multiples(10, after.assists, 10))) emit('assists', value, `${value} Assists`)
  for (const value of crossed(before.goals + before.assists, after.goals + after.assists, multiples(20, after.goals + after.assists, 20))) emit('ga', value, `${value} G+A`)
  for (const value of crossed(Math.min(before.goals, before.assists), Math.min(after.goals, after.assists), multiples(5, Math.min(after.goals, after.assists), 10))) emit('balanced', value, `${value} Goals + ${value} Assists`)
}

function participants(match: Match, id: string) { const row = match.appearances.find(a => a.playerId === id); return Boolean(row && (row.role === 'starter' || match.events.some(e => e.type === 'sub' && e.playerInId === id))) }

function uncached(players: Player[], matches: Match[]) {
  const output = new Map<string, GroupedMatchChange[]>(); const career = new Map<string, Totals>(); const season = new Map<string, Totals>(); const competition = new Map<string, Totals>(); const runs = new Map<string, Streak>(); const teamRuns = new Map<string, { wins: number; unbeaten: number; cleanSheets: number; goals: number; seasonSheets: number }>()
  for (const match of oldestMatches(matches)) {
    const groups = new Map<string, GroupedMatchChange>(); const type = matchCompetitionType(match); const perPlayer = new Map<string, { goals: number; assists: number; saves: number }>(); const stat = (id: string) => { const row = perPlayer.get(id) ?? { goals: 0, assists: 0, saves: 0 }; perPlayer.set(id, row); return row }
    for (const event of match.events) { if (event.type === 'goal' && !event.ownGoal) { if (event.playerId) stat(event.playerId).goals++; if (event.assistPlayerId) stat(event.assistPlayerId).assists++ } if (event.type === 'save') stat(event.playerId).saves += event.count ?? 1 }
    const mom = getMatchManOfTheMatch(match, players)
    for (const player of players) {
      if (!participants(match, player.id)) continue
      const p = perPlayer.get(player.id) ?? { goals: 0, assists: 0, saves: 0 }; const appearance = match.appearances.find(a => a.playerId === player.id)!; const score = matchScore(match); const conceded = appearance.teamId === match.homeTeamId ? score.away : score.home; const keeper = appearance.position === 'GK' || appearance.matchPosition === 'GK'; const delta: Totals = { goals: p.goals, assists: p.assists, apps: 1, mom: Number(mom === player.id), saves: p.saves, cleanSheets: Number(keeper && conceded === 0) }; const sum = (base: Totals): Totals => ({ goals: base.goals + delta.goals, assists: base.assists + delta.assists, apps: base.apps + 1, mom: base.mom + delta.mom, saves: base.saves + delta.saves, cleanSheets: base.cleanSheets + delta.cleanSheets }); const c0 = career.get(player.id) ?? empty(); const sKey = `${match.season}:${player.id}`; const s0 = season.get(sKey) ?? empty(); const xKey = `${match.season}:${type}:${player.id}`; const x0 = competition.get(xKey) ?? empty(); const c1 = sum(c0); const s1 = sum(s0); const x1 = sum(x0); career.set(player.id, c1); season.set(sKey, s1); competition.set(xKey, x1); milestone(groups, players, match, player, 'career', c0, c1); milestone(groups, players, match, player, 'season', s0, s1); milestone(groups, players, match, player, type, x0, x1)
      for (const value of crossed(s0.mom, s1.mom, multiples(10, s1.mom))) add(groups, match.id, players, player.id, `season-mom:${match.season}:${player.id}:${value}`, `Season ${value} MOM`, 'milestone'); for (const [field, step, label] of [['apps', 100, 'career appearances'], ['mom', 50, 'career MOM']] as const) for (const value of crossed(c0[field], c1[field], multiples(step, c1[field]))) add(groups, match.id, players, player.id, `career-${field}:${player.id}:${value}`, `${value} ${label}`, 'milestone'); if (keeper) { for (const value of crossed(s0.cleanSheets, s1.cleanSheets, [10, 20])) add(groups, match.id, players, player.id, `season-cs:${player.id}:${value}`, `Season ${value} clean sheets`, 'milestone'); for (const value of crossed(c0.cleanSheets, c1.cleanSheets, multiples(50, c1.cleanSheets))) add(groups, match.id, players, player.id, `career-cs:${player.id}:${value}`, `${value} career clean sheets`, 'milestone'); for (const value of crossed(c0.saves, c1.saves, [100, 250, 500, 750, 1000, ...multiples(250, c1.saves, 1250)])) add(groups, match.id, players, player.id, `career-saves:${player.id}:${value}`, `${value} career saves`, 'milestone') }
      const run = runs.get(player.id) ?? { scoring: 0, contribution: 0 }; run.scoring = p.goals ? run.scoring + 1 : 0; run.contribution = p.goals + p.assists ? run.contribution + 1 : 0; runs.set(player.id, run); if (run.scoring === 5) add(groups, match.id, players, player.id, `streak:scoring:${match.id}:${player.id}`, '5-match scoring streak', 'milestone'); if (run.contribution === 5) add(groups, match.id, players, player.id, `streak:contribution:${match.id}:${player.id}`, '5-match contribution streak', 'milestone')
    }
    for (const teamId of [match.homeTeamId, match.awayTeamId]) { const score = matchScore(match); const ours = teamId === match.homeTeamId ? score.home : score.away; const against = teamId === match.homeTeamId ? score.away : score.home; const key = `${match.season}:${teamId}`; const run = teamRuns.get(key) ?? { wins: 0, unbeaten: 0, cleanSheets: 0, goals: 0, seasonSheets: 0 }; const goalsBefore = run.goals; const sheetsBefore = run.seasonSheets; run.wins = ours > against ? run.wins + 1 : 0; run.unbeaten = ours >= against ? run.unbeaten + 1 : 0; run.cleanSheets = against === 0 ? run.cleanSheets + 1 : 0; run.goals += ours; run.seasonSheets += Number(against === 0); teamRuns.set(key, run); for (const value of [5, 10]) if (run.wins === value) add(groups, match.id, players, undefined, `team-win-streak:${key}:${match.id}:${value}`, `${value}-match team winning streak`, 'milestone'); for (const value of [10, 15]) if (run.unbeaten === value) add(groups, match.id, players, undefined, `team-unbeaten:${key}:${match.id}:${value}`, `${value}-match team unbeaten run`, 'milestone'); if (run.cleanSheets === 5) add(groups, match.id, players, undefined, `team-clean-streak:${key}:${match.id}`, '5-match team clean-sheet streak', 'milestone'); for (const value of crossed(goalsBefore, run.goals, [50, 100, 150, ...multiples(50, run.goals, 200)])) add(groups, match.id, players, undefined, `team-season-goals:${key}:${value}`, `Team ${value} season goals`, 'milestone'); for (const value of crossed(sheetsBefore, run.seasonSheets, [10, 20])) add(groups, match.id, players, undefined, `team-season-sheets:${key}:${value}`, `Team ${value} season clean sheets`, 'milestone') }
    output.set(match.id, [...groups.values()])
  }
  return output
}

/** Memory-only source-of-truth Match Changes projection. New collection identities rebuild it after historical edits. */
function resolveMatchChangeIndex(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[]) {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }; let byTeams = byPlayers.get(players); if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }; let byStates = byTeams.get(teams); if (!byStates) { byStates = new WeakMap(); byTeams.set(teams, byStates) }; const current = byStates.get(states); if (current?.revision === RATING_ENGINE_REVISION) return { value: current.value, cached: true }; const value = measureInDevelopment('MatchChangeIndex cold build', () => uncached(players, matches)); byStates.set(states, { revision: RATING_ENGINE_REVISION, value }); return { value, cached: false }
}

export function buildMatchChangeIndex(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = EMPTY_STATES) {
  return resolveMatchChangeIndex(players, teams, matches, states).value
}

export function lookupMatchChanges(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = EMPTY_STATES, matchId: string): GroupedMatchChange[] {
  const index = resolveMatchChangeIndex(players, teams, matches, states)
  const lookup = () => index.value.get(matchId) ?? []
  return index.cached ? measureInDevelopment('MatchChangeIndex cached lookup', lookup) : lookup()
}
