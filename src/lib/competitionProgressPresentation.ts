import type { ChampionsStage, CupStage } from '../types'

export type LeagueProgress = { complete: boolean; matchdayProgress: number }
export type CupProgress = { complete: boolean; stage?: CupStage | 'final' | 'finalReplay' }

export function competitionProgressLabels() {
  return { league: '⚽ League', cup: '🏆 Cup', champions: '🌟 Champions' }
}

export function formatLeagueProgress(progress: LeagueProgress): string {
  return progress.complete ? 'Completed · 30 / 30' : `MD ${progress.matchdayProgress} / 30`
}

export function formatCupProgress(progress: CupProgress): string {
  if (progress.complete) return 'Completed'
  if (progress.stage === 'final' || progress.stage === 'finalReplay') return 'Final'
  if (progress.stage?.startsWith('stage')) return `Stage ${progress.stage.slice(5)}`
  return 'Not started'
}

const CHAMPIONS_STAGE_LABELS: Record<ChampionsStage, string> = {
  roundOf16: 'Round of 16',
  quarterFinal: 'Quarter-final',
  semiFinal: 'Semi-final',
  final: 'Final',
  finalReplay: 'Final Replay',
}

export function formatChampionsStage(stage: ChampionsStage): string {
  return CHAMPIONS_STAGE_LABELS[stage]
}

export function formatContributionOrdinals(ordinals: number[]): string | undefined {
  if (!ordinals.length) return undefined
  return ordinals.length === 1 ? String(ordinals[0]) : `${ordinals[0]}–${ordinals[ordinals.length - 1]}`
}
