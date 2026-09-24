import type { Team } from '../types'
import { CompactFilterMenu, type CompactFilterOption } from './CompactFilterMenu'

const ALL_TEAMS: CompactFilterOption<string | null> = { value: null, label: 'All teams', accessibilityLabel: 'All teams' }

export function TeamFilter({ value, teams, onChange, label = 'Team' }: { value: string | null; teams: Team[]; onChange: (value: string | null) => void; label?: string }) {
  const options: CompactFilterOption<string | null>[] = [ALL_TEAMS, ...teams.map(team => ({ value: team.id, label: team.shortName, accessibilityLabel: team.name }))]
  return <CompactFilterMenu value={value} options={options} onChange={onChange} label={label} allValue={null} allLabel="Team" allAccessibilityLabel="All teams" menuClassName="max-h-64 grid-cols-2 overflow-y-auto overscroll-contain" />
}
