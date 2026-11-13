import type { Team } from '../types'
import { CompactFilterMenu, type CompactFilterOption } from './CompactFilterMenu'
import { CompactMultiFilterMenu } from './CompactMultiFilterMenu'

const ALL_TEAMS: CompactFilterOption<string | null> = { value: null, label: 'All teams', accessibilityLabel: 'All teams' }

type SingleTeamProps = { teams: Team[]; label?: string; value: string | null; onChange: (value: string | null) => void }
type MultiTeamProps = { teams: Team[]; label?: string; values: string[]; onChange: (values: string[]) => void }
type TeamFilterProps = SingleTeamProps | MultiTeamProps
export function TeamFilter(props: SingleTeamProps): React.ReactNode
export function TeamFilter(props: MultiTeamProps): React.ReactNode
export function TeamFilter(props: TeamFilterProps) {
  if ('values' in props) return <CompactMultiFilterMenu values={props.values} options={props.teams.map(team => ({ value: team.id, label: team.shortName, accessibilityLabel: team.name }))} onChange={props.onChange} label={props.label ?? 'Team'} title="Team" allLabel="All teams" menuClassName="max-h-64 grid-cols-2 overflow-y-auto overscroll-contain" />
  const { value, teams, onChange, label = 'Team' } = props
  const options: CompactFilterOption<string | null>[] = [ALL_TEAMS, ...teams.map(team => ({ value: team.id, label: team.shortName, accessibilityLabel: team.name }))]
  return <CompactFilterMenu value={value} options={options} onChange={onChange} label={label} allValue={null} allLabel="Team" allAccessibilityLabel="All teams" menuClassName="max-h-64 grid-cols-2 overflow-y-auto overscroll-contain" />
}
