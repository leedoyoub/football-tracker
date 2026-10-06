import { CompactMultiFilterMenu } from './CompactMultiFilterMenu'

export function RecordsSeasonFilter({ value, seasons, onChange, label = 'Records seasons' }: { value: string[]; seasons: string[]; onChange: (value: string[]) => void; label?: string }) {
  return <CompactMultiFilterMenu value={value} options={seasons} onChange={onChange} label={label} emptyLabel="Season" pluralLabel="Seasons" />
}
