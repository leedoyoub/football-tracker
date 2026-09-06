import { useMemo, useState } from 'react'
import { POSITIONS, type Position, type View } from '../types'
import { useStore } from '../store'

export function NewPlayerScreen({
  teamId,
  onNavigate,
}: {
  teamId?: string
  onNavigate: (view: View) => void
}) {
  const { teams, players, addPlayer } = useStore()
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [number, setNumber] = useState(10)
  const [position, setPosition] = useState<Position>('CM')
  const [selectedTeam, setSelectedTeam] = useState(teamId ?? teams[0]?.id ?? '')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions = useMemo(() => {
    if (!displayName.trim()) return []
    const q = displayName.toLowerCase()
    const uniqueNames = [...new Set(players.map((p) => p.displayName ?? p.name))]
    return uniqueNames
      .filter((n) => n.toLowerCase().startsWith(q))
      .slice(0, 5)
  }, [displayName, players])

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
            }}
            placeholder="Full name"
            className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
          />
        </div>
        <div className="relative">
          <input value={displayName} onChange={(e) => { setDisplayName(e.target.value); setShowSuggestions(true) }} onFocus={() => setShowSuggestions(true)} placeholder="Display name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm" />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-xl">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setDisplayName(s)
                    setShowSuggestions(false)
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="number"
          value={number}
          onChange={(e) => setNumber(Number(e.target.value))}
          className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
        />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"
        >
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!displayName.trim() || !selectedTeam}
          onClick={() => {
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
          Create player
        </button>
      </div>
    </div>
  )
}
