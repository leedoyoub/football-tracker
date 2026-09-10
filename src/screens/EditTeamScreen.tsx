import { useState } from 'react'
import { TEAM_COLORS, TEAM_PLAY_STYLES, type TeamColor, type TeamPlayStyle, type View } from '../types'
import { useStore } from '../store'

export function EditTeamScreen({ teamId, onNavigate }: { teamId: string; onNavigate: (view: View) => void }) {
  const { teams, updateTeam } = useStore()
  const team = teams.find((item) => item.id === teamId)
  const [name, setName] = useState(team?.name ?? '')
  const [abbreviation, setAbbreviation] = useState(team?.abbreviation ?? '')
  const [style, setStyle] = useState<'solid' | 'striped'>(team?.visualStyle ?? 'solid')
  const [primary, setPrimary] = useState<TeamColor>(team?.primaryColor ?? 'green')
  const [secondary, setSecondary] = useState<TeamColor>(team?.secondaryColor ?? 'white')
  const [numberColor, setNumberColor] = useState<TeamColor>(team?.jerseyNumberColor ?? 'white')
  const [playStyle, setPlayStyle] = useState<TeamPlayStyle>(team?.playStyle ?? 'possession')

  if (!team) return <div className="p-6">Team not found.</div>

  const select = (value: TeamColor, onChange: (v: TeamColor) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as TeamColor)} className="rounded-xl bg-zinc-900 px-3 py-2 text-sm">
      {TEAM_COLORS.map((color) => <option key={color}>{color}</option>)}
    </select>
  )

  return (
    <div className="px-4 pb-8 pt-6">
      <button type="button" onClick={() => onNavigate({ name: 'team', id: teamId })} className="mb-3 text-xs text-emerald-400">Cancel</button>
      <h1 className="mb-4 text-2xl font-semibold">Edit team</h1>
      <div className="space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Club name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5" />
        <input value={abbreviation} onChange={(e) => setAbbreviation(e.target.value.toUpperCase().slice(0, 3))} placeholder="ABC" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5" />
        <div className="grid grid-cols-2 gap-2">
          {(['solid', 'striped'] as const).map((item) => (
            <button key={item} type="button" onClick={() => setStyle(item)} className={`rounded-xl py-2 text-xs font-bold ${style === item ? 'bg-emerald-500 text-black' : 'bg-zinc-900'}`}>{item.toUpperCase()}</button>
          ))}
        </div>
        <label className="flex items-center justify-between rounded-xl bg-zinc-900 p-3 text-sm">Primary {select(primary, setPrimary)}</label>
        {style === 'striped' && <label className="flex items-center justify-between rounded-xl bg-zinc-900 p-3 text-sm">Secondary {select(secondary, setSecondary)}</label>}
        <label className="flex items-center justify-between rounded-xl bg-zinc-900 p-3 text-sm">Jersey number {select(numberColor, setNumberColor)}</label>
        <label className="flex items-center justify-between rounded-xl bg-zinc-900 p-3 text-sm">Play style <select aria-label="Team play style" value={playStyle} onChange={(e) => setPlayStyle(e.target.value as TeamPlayStyle)} className="rounded-xl bg-black px-3 py-2 text-sm">{TEAM_PLAY_STYLES.map(item => <option key={item} value={item}>{item === 'possession' ? 'Possession' : item === 'short-pass-counter' ? 'Short-Pass Counter' : 'Long-Pass Counter'}</option>)}</select></label>
        <button
          type="button"
          disabled={abbreviation.length !== 3}
          onClick={() => {
            updateTeam(teamId, { name: name.trim(), abbreviation, shortName: abbreviation, visualStyle: style, primaryColor: primary, secondaryColor: style === 'striped' ? secondary : null, jerseyNumberColor: numberColor, playStyle });
            onNavigate({ name: 'team', id: teamId })
          }}
          className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-black text-black"
        >
          SAVE TEAM
        </button>
      </div>
    </div>
  )
}
