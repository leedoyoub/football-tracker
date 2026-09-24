import type { PositionFilterKey } from '../types'
import { CompactFilterMenu } from './CompactFilterMenu'

export const POSITION_FILTER_OPTIONS: { value: PositionFilterKey; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'st-ss', label: 'ST/SS' }, { value: 'lw-rw', label: 'LW/RW' },
  { value: 'cam', label: 'CAM' }, { value: 'lm-rm', label: 'LM/RM' }, { value: 'cm', label: 'CM' },
  { value: 'cdm', label: 'CDM' }, { value: 'fb', label: 'FB' }, { value: 'cb', label: 'CB' }, { value: 'gk', label: 'GK' },
]

export function PositionFilter({ value, onChange, label = 'Position', allLabel = 'All', allAccessibilityLabel = 'All' }: { value: PositionFilterKey; onChange: (value: PositionFilterKey) => void; label?: string; allLabel?: string; allAccessibilityLabel?: string }) {
  return <CompactFilterMenu value={value} options={POSITION_FILTER_OPTIONS} onChange={onChange} label={label} allValue="all" allLabel={allLabel} allAccessibilityLabel={allAccessibilityLabel} menuClassName="grid-cols-2" />
}
