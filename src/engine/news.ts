import { matchScore, pitchWindow, ratePlayerMatch } from './rating'
import type { Match, Player, Team } from '../types'

export type NewsKind = 'player' | 'match' | 'team'
export type NewsItem = { id: string; kind: NewsKind; date: string; matchId?: string; playerId?: string; teamId?: string; eyebrow: string; title: string; detail: string; context: string }

const ordered = (matches: Match[]) => matches.slice().sort((a, b) => b.date.localeCompare(a.date) || b.matchDay - a.matchDay || b.id.localeCompare(a.id))
const name = (players: Player[], id?: string) => players.find(player => player.id === id)?.displayName ?? players.find(player => player.id === id)?.name ?? 'Player'
const teamName = (teams: Team[], id?: string) => teams.find(team => team.id === id)?.name ?? 'Team'
const scoreText = (match: Match, teams: Team[]) => { const score = matchScore(match); return `${teamName(teams, match.homeTeamId)} ${score.home}-${score.away} ${teamName(teams, match.awayTeamId)} · MD ${match.matchDay}` }

export function deriveNews(players: Player[], teams: Team[], matches: Match[]): NewsItem[] {
  const result: NewsItem[] = []
  const careerGoals = new Map<string, number>(); const careerAssists = new Map<string, number>()
  for (const match of ordered(matches).reverse()) {
    const byPlayer = new Map<string, { goals: number; assists: number }>()
    for (const event of match.events) if (event.type === 'goal' && !event.ownGoal) {
      if (event.playerId) { const row = byPlayer.get(event.playerId) ?? { goals: 0, assists: 0 }; row.goals++; byPlayer.set(event.playerId, row) }
      if (event.assistPlayerId) { const row = byPlayer.get(event.assistPlayerId) ?? { goals: 0, assists: 0 }; row.assists++; byPlayer.set(event.assistPlayerId, row) }
    }
    for (const [playerId, row] of byPlayer) {
      const player = players.find(item => item.id === playerId); if (!player) continue
      const rating = ratePlayerMatch(match, player); const context = scoreText(match, teams)
      if (row.goals >= 3) result.push({ id: `match:hat:${match.id}:${playerId}`, kind: 'match', date: match.date, matchId: match.id, playerId, teamId: match.appearances.find(a => a.playerId === playerId)?.teamId, eyebrow: 'HAT-TRICK HERO', title: `${name(players, playerId)} steals the show`, detail: `Three goals${rating ? ` and a ${rating.raw.toFixed(1)} rating` : ''}.`, context })
      else if (row.goals >= 2) result.push({ id: `match:brace:${match.id}:${playerId}`, kind: 'match', date: match.date, matchId: match.id, playerId, eyebrow: 'BRACE', title: `${name(players, playerId)} delivers twice`, detail: `${row.goals} goals in one match.`, context })
      if (row.assists >= 2) result.push({ id: `match:playmaker:${match.id}:${playerId}`, kind: 'match', date: match.date, matchId: match.id, playerId, eyebrow: 'PLAYMAKER', title: `${name(players, playerId)} creates ${row.assists}`, detail: `${row.assists} assists in one match.`, context })
      const previousGoals = careerGoals.get(playerId) ?? 0; const previousAssists = careerAssists.get(playerId) ?? 0; careerGoals.set(playerId, previousGoals + row.goals); careerAssists.set(playerId, previousAssists + row.assists)
      const milestones = [10, 20, 30, 40, 50, 100].filter(value => previousGoals < value && previousGoals + row.goals >= value).map(value => `${value} career goals`)
      if (milestones.length) result.push({ id: `player:milestone:${match.id}:${playerId}:goals`, kind: 'player', date: match.date, matchId: match.id, playerId, eyebrow: milestones.length > 1 ? 'DOUBLE MILESTONE' : 'CAREER MILESTONE', title: `${name(players, playerId)} reaches ${milestones.join(' + ')}`, detail: 'Another landmark from saved match data.', context })
      if (previousAssists < 10 && previousAssists + row.assists >= 10) result.push({ id: `player:milestone:${match.id}:${playerId}:assists`, kind: 'player', date: match.date, matchId: match.id, playerId, eyebrow: 'CAREER MILESTONE', title: `${name(players, playerId)} reaches 10 career assists`, detail: 'A creative landmark.', context })
      const appearance = match.appearances.find(item => item.playerId === playerId); const on = appearance && pitchWindow(match, appearance)
      const firstGoal = match.events.find(event => event.type === 'goal' && event.playerId === playerId)
      if (appearance?.role === 'bench' && on && firstGoal?.type === 'goal' && firstGoal.minute - on.enter <= 10) result.push({ id: `match:super-sub:${match.id}:${playerId}`, kind: 'match', date: match.date, matchId: match.id, playerId, eyebrow: 'SUPER SUB', title: `${name(players, playerId)} makes an instant impact`, detail: `Scores ${firstGoal.minute - on.enter} minutes after entering.`, context })
    }
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      const score = matchScore(match); const ours = teamId === match.homeTeamId ? score.home : score.away; const theirs = teamId === match.homeTeamId ? score.away : score.home
      if (ours - theirs >= 3) result.push({ id: `team:big-win:${match.id}:${teamId}`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'STATEMENT WIN', title: `${teamName(teams, teamId)} cruise to a big win`, detail: `${ours}-${theirs} on the day.`, context: scoreText(match, teams) })
      if (ours > theirs) { const prior = matches.filter(item => item.date <= match.date && item.id !== match.id).filter(item => item.homeTeamId === teamId || item.awayTeamId === teamId).sort((a, b) => b.date.localeCompare(a.date)); let streak = 1; for (const item of prior) { const s = matchScore(item); const won = item.homeTeamId === teamId ? s.home > s.away : s.away > s.home; if (!won) break; streak++ } if (streak >= 3) result.push({ id: `team:wins:${match.id}:${teamId}`, kind: 'team', date: match.date, matchId: match.id, teamId, eyebrow: 'KEEP ROLLING', title: `${teamName(teams, teamId)} extend their winning streak`, detail: `${streak} straight wins.`, context: scoreText(match, teams) }) }
    }
  }
  return result.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}
