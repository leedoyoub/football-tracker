import { useState } from 'react'
import { useStore } from '../store'
import { REGISTRATION_POSITIONS, type RegistrationPosition, type View } from '../types'

export function EditPlayerScreen({ playerId, onNavigate }: { playerId: string; onNavigate: (view: View) => void }) {
  const { players, teams, updatePlayer } = useStore()
  const player = players.find((item) => item.id === playerId)
  const [fullName, setFullName] = useState(player?.fullName ?? player?.name ?? '')
  const [displayName, setDisplayName] = useState(player?.displayName ?? player?.name ?? '')
  const [number, setNumber] = useState(player?.number ?? 0)
  const [position, setPosition] = useState<RegistrationPosition>((player?.position as RegistrationPosition) ?? 'CM')
  const [teamIds, setTeamIds] = useState<string[]>(player?.teamIds ?? (player?.teamId ? [player.teamId] : []))

  if (!player) return <div className="p-6">Player not found.</div>
  
  return (
    <div className="px-4 pb-8 pt-6">
      <button type="button" onClick={() => onNavigate({ name: 'player', id: playerId })} className="mb-3 text-xs text-emerald-400">Cancel</button>
      <h1 className="mb-4 text-2xl font-semibold">Edit player</h1>
      <div className="space-y-3">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5" />
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5" />
        <input type="number" value={number} onChange={(e) => setNumber(Number(e.target.value))} className="w-full rounded-xl bg-zinc-900 px-3 py-2.5" />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value as RegistrationPosition)}
          className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
        >
          {REGISTRATION_POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
        <div className="rounded-xl bg-zinc-900 p-3">
          <p className="mb-2 text-xs font-bold text-zinc-400">Assigned teams</p>
          {teams.map((team) => {
            const rosterCount = players.filter(p => p.teamIds?.includes(team.id)).length
            const isAssigned = teamIds.includes(team.id)
            const canAdd = rosterCount < 23 || isAssigned
            return (
              <label key={team.id} className={`mb-2 flex items-center gap-2 text-sm ${canAdd ? '' : 'opacity-40'}`}>
                <input 
                    type="checkbox" 
                    checked={isAssigned} 
                    disabled={!canAdd}
                    onChange={() => setTeamIds((ids) => ids.includes(team.id) ? ids.filter((id) => id !== team.id) : [...ids, team.id])} 
                />
                {team.name} ({rosterCount}/23)
              </label>
            )
          })}
        </div>
        <button 
            type="button" 
            disabled={!displayName.trim()} 
            onClick={() => { 
                updatePlayer(playerId, { 
                    name: displayName.trim(), 
                    fullName: fullName.trim() || displayName.trim(), 
                    displayName: displayName.trim(), 
                    number, 
                    position, 
                    teamIds, 
                    teamId: teamIds[0] ?? '' 
                }); 
                onNavigate({ name: 'player', id: playerId }) 
            }} 
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-black text-black disabled:opacity-40"
        >
            SAVE PLAYER
        </button>
      </div>
    </div>
  )
}
