import { useEffect, useMemo, useState } from 'react'
import { fetchApiFootballSquad, type ApiFootballSquadPlayer } from '../lib/apiFootball'
import { useAuth } from '../lib/auth'
import { RosterCapacityError } from '../lib/roster'
import { addsNewMembership, availableRosterSlots, importedPosition, validImportedNumber } from '../lib/squadImport'
import { useStore } from '../store'
import { PlayerAvatar } from '../components/PlayerAvatar'

export function SquadImportScreen({ teamId, onBack }: { teamId: string; onBack: () => void }) {
  const { teams, players, importPlayers } = useStore()
  const { user } = useAuth()
  const team = teams.find((item) => item.id === teamId)
  const [squad, setSquad] = useState<ApiFootballSquadPlayer[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState('')

  const existingByExternalId = useMemo(() => new Map(players.filter((player) => player.externalPlayerId !== undefined).map((player) => [String(player.externalPlayerId), player])), [players])
  const slots = team ? availableRosterSlots(players, team.id) : 0
  const selectedNewMemberships = useMemo(() => squad.filter((item) => selected.has(item.id) && addsNewMembership(existingByExternalId.get(String(item.id)), teamId)).length, [existingByExternalId, selected, squad, teamId])

  const loadSquad = async () => {
    if (!team?.externalTeamId) { setError('This team is not linked to an API-Football team yet.'); return }
    if (!user) { setError('Google sign-in is required for secure squad import.'); return }
    setLoading(true); setError(''); setComplete('')
    try {
      const result = await fetchApiFootballSquad(team.externalTeamId)
      setSquad(result)
      setSelected(new Set())
      if (!result.length) setError('No squad was returned for this team. Please try again later.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the squad. Check your connection and try again.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadSquad()
    // A screen entry makes one authenticated request; retry is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.externalTeamId, user?.id])

  if (!team) return <div className="p-6 text-sm text-zinc-400">Team not found.</div>

  const toggle = (entry: ApiFootballSquadPlayer) => {
    setError(''); setComplete('')
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(entry.id)) { next.delete(entry.id); return next }
      const existing = existingByExternalId.get(String(entry.id))
      if (addsNewMembership(existing, teamId) && selectedNewMemberships >= slots) {
        setError(slots ? `Only ${slots} new roster slot${slots === 1 ? '' : 's'} are available.` : 'This roster is full (23/23). You can only refresh players already in it.')
        return previous
      }
      next.add(entry.id)
      return next
    })
  }

  const submit = () => {
    if (!selected.size) return
    setImporting(true); setError(''); setComplete('')
    try {
      const chosen = squad.filter((entry) => selected.has(entry.id))
      importPlayers(chosen.map((entry) => ({ teamId, externalPlayerId: entry.id, name: entry.name.trim() || `Player ${entry.id}`, number: validImportedNumber(entry.number), position: importedPosition(entry.position), photoUrl: entry.photo || undefined })))
      setComplete(`${chosen.length} player${chosen.length === 1 ? '' : 's'} imported. Your roster is saved locally and will sync when cloud backup is available.`)
      setSelected(new Set())
    } catch (cause) {
      setError(cause instanceof RosterCapacityError ? 'The roster reached 23 players before this import could be saved. No changes were made.' : 'Could not import the selected players. No changes were made.')
    } finally { setImporting(false) }
  }

  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button>
    <div className="mb-5 flex items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Import squad</h1><p className="mt-1 text-xs text-zinc-400">{team.name} · API-Football</p></div><button type="button" onClick={() => void loadSquad()} disabled={loading || !user || !team.externalTeamId} className="rounded-full bg-zinc-800 px-3 py-2 text-xs font-bold disabled:opacity-40">Retry</button></div>
    <div className="mb-4 rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm"><div className="flex items-center justify-between font-semibold"><span>Selected {selected.size}</span><span>{Math.max(0, slots - selectedNewMemberships)} slots remaining</span></div><p className="mt-1 text-[11px] text-zinc-400">Existing roster members can be selected to refresh their API photo and details without using a slot.</p></div>
    {!user && <p role="alert" className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Google sign-in is required for secure squad import. The rest of the app remains available offline.</p>}
    {error && <p role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
    {complete && <p role="status" className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">{complete}</p>}
    {loading && <div className="rounded-xl bg-zinc-900 p-6 text-center text-sm text-zinc-400">Loading squad…</div>}
    {!loading && squad.length > 0 && <div className="space-y-2">{squad.map((entry) => {
      const existing = existingByExternalId.get(String(entry.id))
      const alreadyInRoster = Boolean(existing && !addsNewMembership(existing, teamId))
      const isSelected = selected.has(entry.id)
      const blocked = !isSelected && addsNewMembership(existing, teamId) && selectedNewMemberships >= slots
      return <button key={entry.id} type="button" aria-pressed={isSelected} disabled={blocked || importing} onClick={() => toggle(entry)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${isSelected ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 bg-zinc-900'} disabled:opacity-45`}><SquadAvatar entry={entry} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{entry.number ?? '—'} {entry.name}</span><span className="block text-[11px] text-zinc-400">{entry.position || 'Outfield'}{alreadyInRoster ? ' · Already in roster' : existing ? ' · Existing player' : ''}</span></span><span className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${isSelected ? 'border-emerald-400 bg-emerald-400 text-black' : 'border-zinc-600 text-transparent'}`}>✓</span></button>
    })}</div>}
    <button type="button" disabled={!selected.size || importing} onClick={submit} className="sticky bottom-3 mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-black disabled:opacity-40">{importing ? 'Importing…' : `Import Selected (${selected.size})`}</button>
  </div>
}

function SquadAvatar({ entry }: { entry: ApiFootballSquadPlayer }) { return <PlayerAvatar photoUrl={entry.photo} number={entry.number ?? undefined} className="h-11 w-11 text-xs" /> }
