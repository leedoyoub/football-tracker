import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { arrayItemRevision } from './arrayItemRevision'
import { matchCompetitionType } from './competitionContext'
import { officialAwardSeasons, officialSeasonModel } from './officialAwards'
import { MOM_POLICY_REVISION } from './momPolicy'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { teamRecordedMatchFacts } from './teamHistoricMatches'

type SeasonScope = { competition: CompetitionType | 'all'; seasons: string[]; teamIds: string[] }
export type FinalizedTeamPlacement = {
  season: string
  competition: CompetitionType
  teamId: string
  /** League rank, or outcome tier for Cup and Champions. */
  place: number
  /** Orders exact stages in Cup, including its six-team stage. */
  order: number
  label: string
  points?: number
  wins?: number
  goalDifference?: number
}

const competitions = ['league', 'champions', 'cup'] as const
type FinalizedSeason = { season: string; complete: boolean; placements: FinalizedTeamPlacement[] }
const cache = new WeakMap<Match[], WeakMap<Team[], WeakMap<Player[], WeakMap<CompetitionState[], { revision: string; seasons: FinalizedSeason[] }>>>>()

function finalizedSeasons(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]): FinalizedSeason[] {
  let byTeams = cache.get(matches)
  if (!byTeams) { byTeams = new WeakMap(); cache.set(matches, byTeams) }
  let byPlayers = byTeams.get(teams)
  if (!byPlayers) { byPlayers = new WeakMap(); byTeams.set(teams, byPlayers) }
  let byStates = byPlayers.get(players)
  if (!byStates) { byStates = new WeakMap(); byPlayers.set(players, byStates) }
  const revision = `${RATING_ENGINE_REVISION}:${MOM_POLICY_REVISION}:${arrayItemRevision(teams)}:${arrayItemRevision(players)}:${arrayItemRevision(matches)}:${arrayItemRevision(states)}`
  const cached = byStates.get(states)
  if (cached?.revision === revision) return cached.seasons
  const seasons = officialAwardSeasons(matches, states).map(season => {
    const { status } = officialSeasonModel(teams, players, matches, states, season)
    const { league, cup, champions } = status
    const placements: FinalizedTeamPlacement[] = []
    if (league.complete) {
      for (const { teamId, rank, points, wins, goalDifference } of league.standings) {
        placements.push({ season, competition: 'league', teamId, place: rank, order: rank, label: rank === 1 ? 'Champion' : `#${rank}`, points, wins, goalDifference })
      }
    }
    if (cup.championId && cup.runnerUpId) {
      placements.push({ season, competition: 'cup', teamId: cup.championId, place: 1, order: 1, label: 'Champion' },
        { season, competition: 'cup', teamId: cup.runnerUpId, place: 2, order: 2, label: 'Runner-up' })
      const byStage = new Map<number, string[]>()
      for (const [teamId, stage] of Object.entries(cup.eliminatedAtByTeam)) {
        const eliminated = byStage.get(stage) ?? []
        eliminated.push(teamId)
        byStage.set(stage, eliminated)
      }
      let remaining = cup.rows.length
      let order = byStage.size + 2
      for (const [stage, eliminated] of [...byStage].sort((a, b) => a[0] - b[0])) {
        const place = remaining === 4 ? 3 : remaining <= 8 ? 4 : remaining
        for (const teamId of eliminated) placements.push({ season, competition: 'cup', teamId, place, order, label: `Stage ${stage} · Last ${remaining}` })
        remaining -= eliminated.length
        order--
      }
    }
    if (champions.championId && champions.runnerUpId) {
      placements.push({ season, competition: 'champions', teamId: champions.championId, place: 1, order: 1, label: 'Champion' },
        { season, competition: 'champions', teamId: champions.runnerUpId, place: 2, order: 2, label: 'Runner-up' })
      for (const [stage, place, label] of [['semiFinal', 3, 'Semi-final'], ['quarterFinal', 4, 'Quarter-final'], ['roundOf16', 5, 'Round of 16']] as const) {
        for (const pairing of champions.rounds[stage]) {
          const teamId = pairing.teamIds.find(id => id !== pairing.winnerId)
          if (teamId && pairing.winnerId && !pairing.integrityError) placements.push({ season, competition: 'champions', teamId, place, order: place, label })
        }
      }
    }
    return { season, placements, complete: status.complete }
  })
  byStates.set(states, { revision, seasons })
  return seasons
}

export function finalizedTeamPlacements(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]): FinalizedTeamPlacement[] {
  return finalizedSeasons(teams, players, matches, states).flatMap(season => season.placements)
}

export function bestTeamCompetitionResults(placements: FinalizedTeamPlacement[], teamId: string, competition: CompetitionType | 'all') {
  return competitions.filter(type => competition === 'all' || type === competition).map(type => {
    const results = placements.filter(row => row.teamId === teamId && row.competition === type)
    const best = Math.min(...results.map(result => result.order))
    const achieved = results.filter(row => row.order === best)
    return { competition: type, championships: results.filter(row => row.place === 1).length, label: achieved[0]?.label, seasons: achieved.map(row => row.season) }
  })
}

type SeasonRecordRow = { teamId: string; season: string; competition: CompetitionType | 'all'; numeric: number; value: string; detail: string; comparisonGroup?: number }
type SeasonRecordGroup = { id: string; title: string; ascending: boolean; rows: SeasonRecordRow[] }
type TeamCampaign = { season: string; teamId: string; completed: boolean; played: number; goals: number; conceded: number; wins: number }

export function teamSeasonRecords(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], scope: SeasonScope, selectedIds?: string[]): SeasonRecordGroup[] {
  const seasonModels = finalizedSeasons(teams, players, matches, states).filter(model => !scope.seasons.length || scope.seasons.includes(model.season))
  const seasons = new Map(seasonModels.map(model => [model.season, model]))
  const teamIds = new Set(scope.teamIds.length ? scope.teamIds : teams.map(team => team.id))
  const places = seasonModels.flatMap(model => model.placements).filter(row => teamIds.has(row.teamId) && (scope.competition === 'all' || row.competition === scope.competition))
  const result: SeasonRecordGroup[] = []
  const includes = (id: string) => !selectedIds || selectedIds.includes(id)
  const addPlacementGroup = (id: string, title: string, competition: CompetitionType, ascending: boolean, measure: (row: FinalizedTeamPlacement) => number, format?: (row: FinalizedTeamPlacement) => string) => {
    if (!includes(id)) return
    result.push({ id, title, ascending, rows: places.filter(row => row.competition === competition).map(row => {
      const { season, teamId, label } = row
      const numeric = measure(row)
      return { season, teamId, competition, numeric, value: format?.(row) ?? String(numeric), detail: label }
    }) })
  }
  addPlacementGroup('history-league-points', 'Most League Points in a Season', 'league', false, row => row.points ?? 0)
  addPlacementGroup('history-league-wins', 'Most League Wins in a Season', 'league', false, row => row.wins ?? 0)
  addPlacementGroup('history-league-gd', 'Best League Goal Difference in a Season', 'league', false, row => row.goalDifference ?? 0)
  addPlacementGroup('history-league-finish', 'Best League Finish', 'league', true, row => row.order, row => row.label)
  addPlacementGroup('history-champions-finish', 'Best Champions Finish', 'champions', true, row => row.order, row => row.label)
  addPlacementGroup('history-cup-finish', 'Best Cup Finish', 'cup', true, row => row.order, row => row.label)

  if (!['season-goals', 'season-conceded', 'season-win-rate'].some(includes)) return result
  const completedTeams = new Set(places.map(row => JSON.stringify([row.season, row.teamId])))
  const campaigns = new Map<string, TeamCampaign>()
  for (const row of teamRecordedMatchFacts(matches).rows) {
    const { season } = row.match
    if (!seasons.has(season) || !teamIds.has(row.teamId) || scope.competition !== 'all' && matchCompetitionType(row.match) !== scope.competition) continue
    const key = JSON.stringify([season, row.teamId])
    const completed = scope.competition === 'all' ? Boolean(seasons.get(season)?.complete) : completedTeams.has(key)
    const campaign = campaigns.get(key) ?? { season, teamId: row.teamId, completed, played: 0, goals: 0, conceded: 0, wins: 0 }
    campaign.played++
    campaign.goals += row.goalsFor
    campaign.conceded += row.goalsAgainst
    campaign.wins += Number(row.outcome === 'W')
    campaigns.set(key, campaign)
  }
  const addCampaignGroup = (id: string, title: string, ascending: boolean, measure: (row: TeamCampaign) => number, comparableOnly: boolean, format: (value: number) => string = String) => {
    if (!includes(id)) return
    const rows: SeasonRecordRow[] = []
    for (const campaign of campaigns.values()) {
      if (comparableOnly && !campaign.completed) continue
      const { season, teamId, played, completed } = campaign
      const numeric = measure(campaign)
      rows.push({ season, teamId, competition: scope.competition, numeric, value: format(numeric), detail: `${played} matches${completed ? '' : ' · In progress'}`, ...(comparableOnly ? { comparisonGroup: played } : {}) })
    }
    result.push({ id, title, ascending, rows })
  }
  addCampaignGroup('season-goals', 'Most Goals in a Season', false, row => row.goals, false)
  addCampaignGroup('season-conceded', 'Fewest Goals Conceded in a Season', true, row => row.conceded, true)
  addCampaignGroup('season-win-rate', 'Highest Season Win Rate', false, row => row.wins / row.played * 100, true, value => `${value.toFixed(2)}%`)
  return result
}
