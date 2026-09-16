import { useState } from 'react'
import { useStore } from '../store'
import type { View, TeamColor } from '../types'
import { TEAM_COLORS } from '../types'

export function NewTeamScreen({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { addTeam } = useStore()
  const [name, setName] = useState('')
  const [abbreviation, setAbbreviation] = useState('')
  const [primaryColor, setPrimaryColor] = useState<TeamColor>('blue')

  return (
    <div className="px-4 pb-8 pt-6">
      <button
        type="button"
        onClick={() => onNavigate({ name: 'teams' })}
        className="mb-3 text-xs font-semibold text-emerald-400"
      >
        ← Cancel
      </button>
      <h1 className="mb-4 text-2xl font-semibold">New team</h1>
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Club name"
          className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
        />
        <input
          value={abbreviation}
          onChange={(e) => setAbbreviation(e.target.value.toUpperCase().slice(0, 3))}
          placeholder="ABC"
          className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
        />
        <select value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value as TeamColor)} className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm">
          {TEAM_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          type="button"
          disabled={!name.trim() || abbreviation.length !== 3}
          onClick={() => {
            const id = addTeam({ name: name.trim(), abbreviation, shortName: abbreviation, visualStyle: 'solid', primaryColor: primaryColor, jerseyNumberColor: 'white' })
            onNavigate({ name: 'team', id })
          }}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-black disabled:opacity-40"
        >
          Create team
        </button>
      </div>
    </div>
  )
}
