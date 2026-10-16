import type { CompetitionType } from '../types'

export const COMPETITION_OPTIONS: readonly { value: CompetitionType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'league', label: 'League' },
  { value: 'cup', label: 'Cup' },
  { value: 'champions', label: 'Champions' },
]
