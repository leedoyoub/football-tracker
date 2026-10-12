import type { CupStage, Match, Player, Team } from '../types'
import type { Standing } from '../engine/standings'
import { boundaryTieIds, competitionMatches, cupCompetition, stageRanking, type CupCompetition, type CupTableRow } from '../engine/competition'
import { competitionIdentityForMatch } from '../engine/competitionContext'
import { CUP_TABLE_STAGES } from './competitionScreenState'

export type CupDisplayRow = Standing & { state: CupTableRow['state'] | 'normal'; eliminatedStage?: number; status: string }
export type CupTableModel = { rows: CupDisplayRow[]; availableStages: CupStage[]; selection: CupStage | 'total'; label: string; complete: boolean; eliminationDrawTeamIds: string[]; replayRequired: boolean }
const cache = new WeakMap<CupCompetition, Map<string, CupTableModel>>()
export function cupStageLabel(stage: CupStage): string {
  return stage === 'finalReplay' ? 'Final Replay' : stage === 'final' ? 'Final' : `Stage ${stage.replace('stage', '')}`
}

/** This model only projects official engine decisions. A selected past Stage
 * never changes the current competition or includes a later Stage's records. */
export function cupTableModel(teams: Team[], matches: Match[], season: string, players: Player[], cup: CupCompetition, selection: CupStage | 'total' | null): CupTableModel {
  const availableStages = CUP_TABLE_STAGES.slice(0, CUP_TABLE_STAGES.indexOf(cup.stage) + 1) as CupStage[]
  const selected = selection === 'total' || selection && availableStages.includes(selection) ? selection : cup.stage
  let bySelection = cache.get(cup); if (!bySelection) { bySelection = new Map(); cache.set(cup, bySelection) }
  const hit = bySelection.get(selected); if (hit) return hit
  const status = (teamId: string, state: CupDisplayRow['state'], eliminatedStage?: number, official = cup) => teamId === official.championId ? 'Champion' : teamId === official.runnerUpId ? 'Runner-up' : state === 'eliminated' ? `Eliminated · Stage ${eliminatedStage}` : state === 'at-risk' ? 'At Risk' : 'Surviving'
  let model: CupTableModel
  if (selected === 'total') {
    const totals = new Map(cup.cumulativeStandings.map(row => [row.teamId, row]))
    const rows: CupDisplayRow[] = cup.rows.map(row => ({ ...(totals.get(row.teamId) ?? row), rank: row.rank, state: 'normal', eliminatedStage: row.eliminatedStage, status: row.teamId === cup.championId ? 'Champion' : row.teamId === cup.runnerUpId ? 'Runner-up' : row.eliminatedStage ? `Stage ${row.eliminatedStage}` : `Active · ${cupStageLabel(cup.stage)}` }))
    model = { rows, availableStages, selection: selected, label: cup.championId ? 'Final Standings' : 'Provisional Standings', complete: Boolean(cup.championId), eliminationDrawTeamIds: [], replayRequired: false }
  } else if (selected === cup.stage) {
    const rows: CupDisplayRow[] = cup.rows.map(row => {
      const state = !cup.stageMatches.length && row.state === 'at-risk' ? 'surviving' : row.state
      return { ...row, state, status: status(row.teamId, state, row.eliminatedStage) }
    })
    model = { rows, availableStages, selection: selected, label: cupStageLabel(selected), complete: cup.stageComplete, eliminationDrawTeamIds: cup.stageMatches.length ? cup.eliminationDrawTeamIds : [], replayRequired: false }
  } else {
    const ordinal = CUP_TABLE_STAGES.indexOf(selected)
    const scoped = competitionMatches(matches, season, 'cup')
    const through = scoped.filter(match => { const index = CUP_TABLE_STAGES.indexOf(competitionIdentityForMatch(match).stage as CupStage); return index >= 0 && index <= ordinal })
    const prior = through.filter(match => competitionIdentityForMatch(match).stage !== selected)
    const before = cupCompetition(teams, prior, season, players)
    const after = cupCompetition(teams, through, season, players)
    const games = through.filter(match => competitionIdentityForMatch(match).stage === selected)
    const standings = stageRanking(before.activeTeamIds, games, season, players, `${season}:${selected}`)
    const participants = new Set(before.activeTeamIds)
    const rows: CupDisplayRow[] = standings.map(row => {
      const eliminatedStage = after.eliminatedAtByTeam[row.teamId]
      const state = eliminatedStage === ordinal + 1 ? 'eliminated' : 'surviving'
      return { ...row, state, ...(state === 'eliminated' ? { eliminatedStage } : {}), status: status(row.teamId, state, eliminatedStage, after) }
    })
    rows.push(...after.rows.filter(row => !participants.has(row.teamId)).map(row => ({ ...row, status: status(row.teamId, row.state, row.eliminatedStage, after) })))
    model = { rows, availableStages, selection: selected, label: cupStageLabel(selected), complete: true, eliminationDrawTeamIds: ordinal < 7 ? boundaryTieIds(standings) : [], replayRequired: selected === 'final' && after.stage === 'finalReplay' }
  }
  bySelection.set(selected, model)
  return model
}
