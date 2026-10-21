import { CUP_STAGES, CHAMPIONS_ROUNDS, type CupCompetition, type ChampionsCompetition, type cupCompetition, type championsCompetition } from './competition'
import { competitionIdentityForMatch, matchCompetitionStage } from './competitionContext'
import { teamsCreditedWithResult } from './matchPerspective'
import type { CompetitionState, Match, Player, Team } from '../types'

/** Scheduling only: all winners, integrity decisions and stage transitions come
 * from the official engines. State lives for one chronological News derivation;
 * nothing survives edits or retains a second source-array cache. Only the fields
 * News reads (active teams, winners and stage) are reused between checkpoints. */
export function knockoutNewsCheckpoints(teams: Team[], players: Player[], engines: { cupCompetition: typeof cupCompetition; championsCompetition: typeof championsCompetition }) {
  const cupStages = [...CUP_STAGES, 'final', 'finalReplay']
  const cups = new Map<string, { snapshot?: CupCompetition; coverage: Map<string, Set<string>> }>()
  const champions = new Map<string, { snapshot?: ChampionsCompetition; slots: Map<string, Map<string, Set<number>>>; unsafe: boolean }>()
  const fixedTeams = teams.length === 16 && new Set(teams.map(team => team.id)).size === 16

  return {
    cup(match: Match, prefix: Match[]): CupCompetition {
      let state = cups.get(match.season)
      if (!state) { state = { coverage: new Map() }; cups.set(match.season, state) }
      const stage = matchCompetitionStage(match)
      const coverage = state.coverage.get(stage) ?? new Set<string>()
      for (const id of teamsCreditedWithResult(match)) coverage.add(id)
      state.coverage.set(stage, coverage)
      const prior = state.snapshot
      const currentIndex = prior ? cupStages.indexOf(prior.stage) : -1
      const stageIndex = cupStages.indexOf(stage)
      // Later-stage records cannot resolve the first unfinished stage. Earlier
      // stage additions can change the survivors, so always ask the engine.
      const unchanged = fixedTeams && prior && !prior.championId && stageIndex >= 0 && (
        stageIndex > currentIndex || (stageIndex === currentIndex && !prior.stageComplete && prior.activeTeamIds.length > 0 && !prior.activeTeamIds.every(id => coverage.has(id)))
      )
      if (!unchanged) state.snapshot = engines.cupCompetition(teams, prefix, match.season, players)
      return state.snapshot!
    },
    champions(match: Match, prefix: Match[], draw: CompetitionState): ChampionsCompetition {
      let state = champions.get(match.season)
      if (!state) { state = { slots: new Map(), unsafe: false }; champions.set(match.season, state) }
      const prior = state.snapshot
      // The first snapshot also initializes progress labels for teams that have
      // not played. Keep projecting it at every match, even when reused, since
      // historical News elimination bookkeeping is intentionally unchanged.
      if (!prior) state.snapshot = engines.championsCompetition(draw, prefix, match.season, players)
      const snapshot = state.snapshot!
      const identity = competitionIdentityForMatch(match)
      const stage = CHAMPIONS_ROUNDS.find(round => round === identity.stage)
      const pair = stage ? snapshot.rounds[stage].find(row => row.id === identity.pairingId) : undefined
      const required = stage === 'final' ? 2 : 3
      const seriesGame = identity.seriesGame
      const valid = draw.kind === 'champions-draw' && draw.teamIds.length === 16 && new Set(draw.teamIds).size === 16
        && stage && snapshot.currentStage === stage && pair && !pair.winnerId && !pair.integrityError
        && match.teamId && pair.teamIds.includes(match.teamId)
        && [match.homeTeamId, match.awayTeamId].includes(match.teamId)
        && [match.homeTeamId, match.awayTeamId].every(id => !draw.teamIds.includes(id) || pair.teamIds.includes(id))
        && Number.isInteger(seriesGame) && seriesGame! >= 1 && seriesGame! <= required
      let complete = false
      if (valid) {
        const key = `${stage}:${pair.id}`
        const slots = state.slots.get(key) ?? new Map<string, Set<number>>()
        const own = slots.get(match.teamId!) ?? new Set<number>()
        // Gaps, duplicates, legacy rows and uncertain identities use the official
        // path from here on; no repair or winner inference belongs in this gate.
        if (seriesGame !== own.size + 1) state.unsafe = true
        own.add(seriesGame!); slots.set(match.teamId!, own); state.slots.set(key, slots)
        complete = pair.teamIds.every(id => slots.get(id)?.size === required)
      } else state.unsafe = true
      if (prior && (state.unsafe || complete)) state.snapshot = engines.championsCompetition(draw, prefix, match.season, players)
      return state.snapshot!
    },
  }
}
