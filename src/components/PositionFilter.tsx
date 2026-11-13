import type { PositionFilterKey } from '../types'
import { CompactFilterMenu } from './CompactFilterMenu'
import { CompactMultiFilterMenu } from './CompactMultiFilterMenu'
import { normalizePositionFilters } from '../engine/positionScope'

export const POSITION_FILTER_OPTIONS: { value: PositionFilterKey; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'st-ss', label: 'ST/SS' }, { value: 'lw-rw', label: 'LW/RW' },
  { value: 'cam', label: 'CAM' }, { value: 'lm-rm', label: 'LM/RM' }, { value: 'cm', label: 'CM' },
  { value: 'cdm', label: 'CDM' }, { value: 'lb-rb', label: 'LB/RB' }, { value: 'cb', label: 'CB' }, { value: 'gk', label: 'GK' },
]

type Labels = { label?: string; allLabel?: string; allAccessibilityLabel?: string }
type SinglePositionProps = Labels & { value: PositionFilterKey; onChange: (value: PositionFilterKey) => void }
type MultiPositionProps = Labels & { values: PositionFilterKey[]; onChange: (values: PositionFilterKey[]) => void }
type PositionFilterProps = SinglePositionProps | MultiPositionProps
export function PositionFilter(props: SinglePositionProps): React.ReactNode
export function PositionFilter(props: MultiPositionProps): React.ReactNode
export function PositionFilter(props: PositionFilterProps) {
  if ('values' in props) return <CompactMultiFilterMenu values={normalizePositionFilters(props.values)} options={POSITION_FILTER_OPTIONS.filter(option => option.value !== 'all')} onChange={props.onChange} label={props.label ?? 'Position'} title="Position" allLabel="All" menuClassName="grid-cols-2" />
  const { value, onChange, label = 'Position', allLabel = 'All', allAccessibilityLabel = 'All' } = props
  return <CompactFilterMenu value={value === 'fb' ? 'lb-rb' : value} options={POSITION_FILTER_OPTIONS} onChange={onChange} label={label} allValue="all" allLabel={allLabel} allAccessibilityLabel={allAccessibilityLabel} menuClassName="grid-cols-2" />
}
