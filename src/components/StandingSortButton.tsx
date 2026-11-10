import type { StandingMetric, StandingSort } from '../lib/standingSort'

/** Text-sized native controls keep the existing fixed table geometry. */
export function StandingSortButton({ metric, label, sort, onSort }: { metric: StandingMetric | 'rank'; label: string; sort: StandingSort; onSort: (metric: StandingMetric | 'rank') => void }) {
  const active = metric !== 'rank' && sort?.metric === metric
  return <button type="button" aria-label={metric === 'rank' ? 'Restore official ranking' : `Sort by ${label}`} title={metric === 'rank' ? 'Restore official ranking' : `Sort by ${label}`} onClick={() => onSort(metric)} className={`cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${active ? 'underline decoration-emerald-400 underline-offset-2' : ''}`}>{label}</button>
}
