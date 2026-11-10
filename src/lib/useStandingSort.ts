import { useState } from 'react'
import { nextStandingSort, type StandingMetric, type StandingSort } from './standingSort'

/** A scope change adjusts this component's state before any rows can commit. */
export function useStandingSort(scope: string) {
  const [state, setState] = useState<{ scope: string; sort: StandingSort }>({ scope, sort: null })
  if (state.scope !== scope) setState({ scope, sort: null })
  const sort = state.scope === scope ? state.sort : null
  const onSort = (metric: StandingMetric | 'rank') => setState(previous => ({ scope, sort: nextStandingSort(previous.scope === scope ? previous.sort : null, metric) }))
  return { sort, onSort }
}
