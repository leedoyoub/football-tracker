import type { Match, Player } from '../types'
import { derivePlayerScope } from './playerDerived'
import { scopedPositionFamilyByPlayer } from './positionScope'

export type CareerMilestoneTotals = { apps: number; goals: number; assists: number; mom: number; cleanSheets: number; saves: number }
type MilestoneMetric = keyof CareerMilestoneTotals
export type NextMilestone = { metric: MilestoneMetric; label: string; target: number; current: number; remaining: number; progress: number }

const TARGETS: Record<MilestoneMetric, number[]> = {
  apps: [10, 25, 50, 75, 100, 150, 200, 250, 300],
  goals: [10, 20, 25, 50, 75, 100],
  assists: [10, 20, 25, 50, 75, 100],
  mom: [10, 20, 25, 50, 75, 100],
  cleanSheets: [10, 20, 25, 50, 75, 100],
  saves: [25, 50, 100, 150, 200, 250, 300],
}
const LABELS: Record<MilestoneMetric, string> = { apps: 'Apps', goals: 'Goals', assists: 'Assists', mom: 'MOM', cleanSheets: 'Clean Sheets', saves: 'Saves' }
const ORDER: MilestoneMetric[] = ['apps', 'goals', 'assists', 'mom', 'cleanSheets', 'saves']

export function nextMilestones(totals: CareerMilestoneTotals, goalkeeper: boolean, maxVisible = 3): NextMilestone[] {
  if (!totals.apps) return []
  const metrics: MilestoneMetric[] = goalkeeper ? ['apps', 'cleanSheets', 'saves', 'mom'] : ['apps', 'goals', 'assists', 'mom']
  return metrics.flatMap(metric => {
    const current = totals[metric]
    if (!current) return []
    const thresholds = TARGETS[metric]
    const target = thresholds.find(value => value > current) ?? thresholds[thresholds.length - 1] + Math.ceil((current - thresholds[thresholds.length - 1] + 1) / 50) * 50
    return [{ metric, label: `${target} ${LABELS[metric]}`, target, current, remaining: target - current, progress: current / target }]
  }).sort((a, b) => b.progress - a.progress || a.remaining - b.remaining || ORDER.indexOf(a.metric) - ORDER.indexOf(b.metric)).slice(0, maxVisible)
}

/** Career scope is intentionally independent of Player Detail's visible filters. */
export function careerNextMilestones(player: Player, players: Player[], matches: Match[]): NextMilestone[] {
  const totals = derivePlayerScope(player, players, matches, {})
  const goalkeeper = scopedPositionFamilyByPlayer(players, matches, {}).get(player.id) === 'GK'
  return nextMilestones(totals, goalkeeper)
}
