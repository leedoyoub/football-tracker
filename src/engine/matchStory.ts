import type { Match, Player } from '../types'
import { classifyGoalTypes } from './goalTypes'
import { matchScore, ratePlayerMatch } from './rating'
import { compareEvents, isOnPitchAtEvent, orderedEvents, scoringTeamId } from './timeline'

export type MatchStoryTag = 'Comeback Win' | 'Comeback Draw' | 'Lead Lost' | 'Late Winner' | 'Late Equalizer' | 'Multiple Lead Changes' | 'Clean Sheet' | 'Hat-trick' | '4+ Goal Performance' | '3+ Assist Performance' | '5+ G+A Performance' | 'High-Save GK Performance' | 'Super Sub' | 'Dominant Win'
export type ScoreFlow = { minute: number; home: number; away: number; playerId?: string; teamId: string }
export type SuperSub = { playerId: string; teamId: string; entryMinute: number; goals: number; assists: number; scoreAtEntry: { home: number; away: number }; finalScore: { home: number; away: number } }
export type MatchStory = { scoreFlow: ScoreFlow[]; tags: MatchStoryTag[]; superSubs: SuperSub[] }

/** Compact, evidence-only story derived from the same score/timeline engines. */
export function matchStory(match: Match, players: Player[]): MatchStory {
  let home = 0; let away = 0
  const scoreFlow: ScoreFlow[] = []
  const led = new Set<string>(); const behind = new Set<string>(); let priorLeader: string | undefined; let leadChanges = 0
  for (const { event } of orderedEvents(match)) {
    if (event.type !== 'goal') continue
    const teamId = scoringTeamId(match, event); const opponentId = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
    const beforeOurs = teamId === match.homeTeamId ? home : away; const beforeTheirs = teamId === match.homeTeamId ? away : home
    if (beforeOurs < beforeTheirs) behind.add(teamId)
    if (beforeOurs > beforeTheirs) led.add(teamId)
    if (teamId === match.homeTeamId) home++; else away++
    const leader = home === away ? undefined : home > away ? match.homeTeamId : match.awayTeamId
    if (leader && priorLeader && leader !== priorLeader) leadChanges++
    if (leader) priorLeader = leader
    scoreFlow.push({ minute: event.minute, home, away, playerId: event.playerId, teamId })
    void opponentId
  }
  const final = matchScore(match); const tags = new Set<MatchStoryTag>()
  for (const teamId of [match.homeTeamId, match.awayTeamId]) {
    const ours = teamId === match.homeTeamId ? final.home : final.away; const theirs = teamId === match.homeTeamId ? final.away : final.home
    if (behind.has(teamId) && ours > theirs) tags.add('Comeback Win')
    if (behind.has(teamId) && ours === theirs) tags.add('Comeback Draw')
    if (led.has(teamId) && ours <= theirs) tags.add('Lead Lost')
    if (theirs === 0) tags.add('Clean Sheet')
    if (ours >= 4) tags.add('4+ Goal Performance')
    if (ours - theirs >= 3) tags.add('Dominant Win')
  }
  if (leadChanges >= 2) tags.add('Multiple Lead Changes')
  for (const row of classifyGoalTypes(match)) {
    if (row.tags.includes('winning') && row.tags.includes('lateDrama')) tags.add('Late Winner')
    if (row.tags.includes('equalizer') && row.tags.includes('lateDrama')) tags.add('Late Equalizer')
  }
  const superSubs: SuperSub[] = []
  for (const appearance of match.appearances.filter(item => item.role === 'bench')) {
    const player = players.find(item => item.id === appearance.playerId); if (!player) continue
    const rating = ratePlayerMatch(match, player); const entry = match.events.find((event): event is Extract<Match['events'][number], { type: 'sub' }> => event.type === 'sub' && event.playerInId === player.id && event.teamId === appearance.teamId)
    if (!rating || !entry) continue
    let goals = 0; let assists = 0; let entryHome = 0; let entryAway = 0
    for (const { event } of orderedEvents(match)) {
      if (event.type !== 'goal') continue
      if (compareEvents(match, event, entry) < 0) { if (scoringTeamId(match, event) === match.homeTeamId) entryHome++; else entryAway++ }
      if (compareEvents(match, event, entry) < 0 || !isOnPitchAtEvent(match, appearance, event) || event.ownGoal) continue
      if (event.playerId === player.id) goals++
      if (event.assistPlayerId === player.id) assists++
    }
    if (goals + assists) { tags.add('Super Sub'); superSubs.push({ playerId: player.id, teamId: appearance.teamId, entryMinute: entry.minute, goals, assists, scoreAtEntry: { home: entryHome, away: entryAway }, finalScore: final }) }
  }
  for (const player of players) {
    const goals = match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.playerId === player.id).length
    const assists = match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id).length
    if (goals >= 3) tags.add('Hat-trick')
    if (assists >= 3) tags.add('3+ Assist Performance')
    if (goals + assists >= 5) tags.add('5+ G+A Performance')
  }
  for (const appearance of match.appearances) {
    const player = players.find(item => item.id === appearance.playerId); if (!player) continue
    const saves = match.events.reduce((sum, event) => sum + (event.type === 'save' && event.playerId === player.id && event.teamId === appearance.teamId ? event.count ?? 1 : 0), 0)
    if (saves >= 5 && ratePlayerMatch(match, player)?.position === 'GK') tags.add('High-Save GK Performance')
  }
  return { scoreFlow, tags: [...tags], superSubs }
}
