import { useMemo, useState } from 'react'
import { REGISTRATION_POSITIONS, type RegistrationPosition, type View } from '../types'
import { useStore } from '../store'
import { playerDisplayName } from '../components/ui'

export function NewPlayerScreen({
  teamId,
  onNavigate,
}: {
  teamId?: string
  onNavigate: (view: View) => void
}) {
  const { teams, players, addPlayer, updatePlayer } = useStore()
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [number, setNumber] = useState(10)
  const [position, setPosition] = useState<RegistrationPosition>('CM')
  const [selectedTeam, setSelectedTeam] = useState(teamId ?? teams[0]?.id ?? '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchField, setSearchField] = useState<'fullName' | 'displayName'>('displayName')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const selectedPlayer = players.find(player => player.id === selectedPlayerId)

  const suggestions = useMemo(() => {
    const q = (searchField === 'fullName' ? fullName : displayName).trim().toLowerCase()
    if (!q) return []
    return players.filter(player => [player.displayName, player.fullName, player.name]
      .some(name => name?.toLowerCase().includes(q)))
  }, [displayName, fullName, searchField, players])

  return (
    <div className="px-4 pb-8 pt-6">
      <button
        type="button"
        onClick={() => onNavigate(teamId ? { name: 'team', id: teamId } : { name: 'players' })}
        className="mb-3 text-xs font-semibold text-emerald-400"
      >
        ← Cancel
      </button>
      <h1 className="mb-4 text-2xl font-semibold">New player</h1>
      <div className="space-y-3">
        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <input
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value)
              setSelectedPlayerId(null)
              setSearchField('fullName')
              setShowSuggestions(true)
            }}
            onFocus={() => { setSearchField('fullName'); setShowSuggestions(true) }}
            placeholder="Full name"
            className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
          />
        </div>
        <div className="relative">
          <input value={displayName} onChange={(e) => { setDisplayName(e.target.value); setSelectedPlayerId(null); setSearchField('displayName'); setShowSuggestions(true) }} onFocus={() => { setSearchField('displayName'); setShowSuggestions(true) }} placeholder="Display name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm" />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 top-full z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 shadow-xl">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlayerId(s.id)
                    setDisplayName(playerDisplayName(s))
                    setFullName(s.fullName || s.name)
                    setShowSuggestions(false)
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800"
                >
                  <span className="block truncate">{playerDisplayName(s)}</span>
                  <span className="block truncate text-xs text-zinc-400">{s.fullName || s.name} · #{s.number} · {teams.filter(team => [s.teamId, ...(s.teamIds ?? [])].includes(team.id)).map(team => team.shortName).join(', ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="number"
          value={selectedPlayer?.number ?? number}
          disabled={!!selectedPlayer}
          onChange={(e) => setNumber(Number(e.target.value))}
          className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
        />
        <select
          value={selectedPlayer?.position ?? position}
          disabled={!!selectedPlayer}
          onChange={(e) => setPosition(e.target.value as RegistrationPosition)}
          className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
        >
          {selectedPlayer && !REGISTRATION_POSITIONS.some(pos => pos === selectedPlayer.position) && <option value={selectedPlayer.position}>{selectedPlayer.position}</option>}
          {REGISTRATION_POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!displayName.trim() || !selectedTeam}
          onClick={() => {
            if (selectedPlayer) {
              updatePlayer(selectedPlayer.id, {
                teamIds: [...new Set([selectedPlayer.teamId, ...(selectedPlayer.teamIds ?? []), selectedTeam].filter(Boolean))],
              })
              onNavigate({ name: 'player', id: selectedPlayer.id })
              return
            }
            const id = addPlayer({
              name: displayName.trim(),
              fullName: fullName.trim() || displayName.trim(),
              displayName: displayName.trim(),
              number,
              position,
              teamId: selectedTeam,
            })
            onNavigate({ name: 'player', id })
          }}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-black disabled:opacity-40"
        >
          {selectedPlayer ? 'Add to team' : 'Create player'}
        </button>
      </div>
    </div>
  )
}
