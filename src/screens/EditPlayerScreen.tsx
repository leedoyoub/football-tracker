import { useState } from 'react'
import { useStore } from '../store'
import { REGISTRATION_POSITIONS, type RegistrationPosition, type View } from '../types'
import { TEAM_ROSTER_LIMIT, rosterCount } from '../lib/roster'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { fetchApiFootballPlayer, searchApiFootballPlayers, apiFootballPlayerIdQuery, type ApiFootballPlayerSearchResult } from '../lib/apiFootball'
import { useAuth } from '../lib/auth'
import { deriveApiPlayerNames } from '../lib/playerNames'

export function EditPlayerScreen({ playerId, onNavigate, onDone }: { playerId: string; onNavigate: (view: View) => void; onDone?: (playerId: string) => void }) {
  const { players, teams, updatePlayer } = useStore()
  const { user } = useAuth()
  const player = players.find((item) => item.id === playerId)
  const [fullName, setFullName] = useState(player?.fullName ?? player?.name ?? '')
  const [displayName, setDisplayName] = useState(player?.displayName ?? player?.name ?? '')
  const [number, setNumber] = useState(player?.number ?? 0)
  const [position, setPosition] = useState<RegistrationPosition>((player?.position as RegistrationPosition) ?? 'CM')
  const [teamIds, setTeamIds] = useState<string[]>(player?.teamIds ?? (player?.teamId ? [player.teamId] : []))
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | undefined>(player?.photoUrl)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [photoQuery, setPhotoQuery] = useState('')
  const [photoResults, setPhotoResults] = useState<ApiFootballPlayerSearchResult[]>([])
  const [photoSelected, setPhotoSelected] = useState<ApiFootballPlayerSearchResult | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMessage, setNameMessage] = useState('')

  if (!player) return <div className="p-6">Player not found.</div>

  const finish = () => onDone ? onDone(playerId) : onNavigate({ name: 'player', id: playerId })

  const previewPhotoUrl = photoChanged ? pendingPhotoUrl : player.photoUrl || player.image
  const closePhoto = () => { setPhotoOpen(false); setPhotoSelected(null); setPhotoResults([]); setPhotoError('') }
  const searchPhotos = async () => {
    const trimmed = photoQuery.trim()
    if (!user) {
      setPhotoError('Google sign-in is required for API player search.')
      return
    }
    const exactId = apiFootballPlayerIdQuery(trimmed)
    if (exactId === undefined) {
      setPhotoError('Enter a valid API-Football Player ID.')
      return
    }
    setPhotoLoading(true)
    setPhotoError('')
    setPhotoResults([])
    try {
      const results = await searchApiFootballPlayers(trimmed)
      setPhotoResults(results)
      if (!results.length) {
        setPhotoError('No player found for this API-Football ID.')
      }
    } catch (error) {
      setPhotoError('No player found for this API-Football ID.')
    } finally {
      setPhotoLoading(false)
    }
  }
  const usePhoto = () => { if (!photoSelected?.photo) return; setPendingPhotoUrl(photoSelected.photo); setPhotoChanged(true); closePhoto() }
  const removePhoto = () => { setPendingPhotoUrl(undefined); setPhotoChanged(true) }
  const refreshApiName = async () => { if (player.externalPlayerId === undefined) return; setNameLoading(true); setNameMessage(''); try { const candidate = await fetchApiFootballPlayer(player.externalPlayerId); const names = deriveApiPlayerNames(candidate); setFullName(names.fullName); setDisplayName(names.displayName); setNameMessage('API names loaded. Review them, then save to apply changes.') } catch (error) { setNameMessage(error instanceof Error ? error.message : 'Could not refresh API name.') } finally { setNameLoading(false) } }
  
  return (
    <div className="px-4 pb-8 pt-6">
      <button type="button" onClick={finish} className="mb-3 text-xs text-emerald-400">Cancel</button>
      <h1 className="mb-4 text-2xl font-semibold">Edit player</h1>
      <div className="space-y-3">
        <section className="rounded-xl border border-white/10 bg-zinc-900 p-3">
          <h2 className="text-sm font-semibold">Player Photo</h2>
          <div className="mt-3 flex items-center gap-3"><PlayerAvatar photoUrl={previewPhotoUrl} number={number} className="h-14 w-14 text-sm" /><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPhotoOpen(true)} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold">Change Photo</button><button type="button" onClick={removePhoto} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold">Remove Photo</button></div></div>
        </section>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5" />
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5" />
        {player.externalPlayerId !== undefined && <div className="flex items-center gap-2"><button type="button" disabled={nameLoading} onClick={() => void refreshApiName()} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold disabled:opacity-40">{nameLoading ? 'Refreshing…' : 'Refresh API Name'}</button>{nameMessage && <p role="status" className="text-xs text-zinc-400">{nameMessage}</p>}</div>}
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
            const isAssigned = teamIds.includes(team.id)
            const count = rosterCount(players, team.id)
            const canAdd = count < TEAM_ROSTER_LIMIT || isAssigned
            return (
              <label key={team.id} className={`mb-2 flex items-center gap-2 text-sm ${canAdd ? '' : 'opacity-40'}`}>
                <input 
                    type="checkbox" 
                    checked={isAssigned} 
                    disabled={!canAdd}
                    onChange={() => setTeamIds((ids) => ids.includes(team.id) ? ids.filter((id) => id !== team.id) : [...ids, team.id])} 
                />
                {team.name} {canAdd ? `(${count}/${TEAM_ROSTER_LIMIT})` : `— Full (${TEAM_ROSTER_LIMIT}/${TEAM_ROSTER_LIMIT})`}
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
                    teamId: teamIds[0] ?? '',
                    ...(photoChanged ? { photoUrl: pendingPhotoUrl } : {})
                }); 
                finish()
            }} 
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-black text-black disabled:opacity-40"
        >
            SAVE PLAYER
        </button>
      </div>
      {photoOpen && <div role="dialog" aria-modal="true" aria-label="Change Photo" className="fixed inset-0 z-50 flex items-end bg-black/80 p-4 sm:items-center"><div className="max-h-[85vh] w-full overflow-y-auto rounded-2xl bg-zinc-950 p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Change Photo</h2><button type="button" onClick={closePhoto} className="text-sm text-zinc-400">Cancel</button></div><p className="mb-3 text-xs text-zinc-400">Search API-Football, then explicitly choose a photo. Names and player data will not change.</p><div className="flex gap-2"><input aria-label="Search API player for photo" value={photoQuery} onChange={event => setPhotoQuery(event.target.value)} placeholder="API-Football Player ID" className="min-w-0 flex-1 rounded-xl bg-zinc-900 px-3 py-2 text-sm" /><button type="button" onClick={() => void searchPhotos()} disabled={photoLoading} className="rounded-xl bg-zinc-800 px-3 py-2 text-xs font-bold disabled:opacity-40">{photoLoading ? 'Searching…' : 'Search'}</button></div>{photoError && <p role="alert" className="mt-2 text-xs text-amber-300">{photoError}</p>}<div className="mt-3 space-y-1">{photoResults.map(candidate => <button key={candidate.id} type="button" onClick={() => setPhotoSelected(candidate)} className={`flex w-full items-center gap-3 rounded-xl p-2 text-left ${photoSelected?.id === candidate.id ? 'bg-emerald-500/15 ring-1 ring-emerald-400' : 'bg-zinc-900'}`}><PlayerAvatar photoUrl={candidate.photo} number={candidate.number ?? undefined} className="h-10 w-10 text-[10px]" /><span className="min-w-0"><b className="block truncate text-sm">{candidate.name}</b><span className="block truncate text-[10px] text-zinc-400">{candidate.position || 'Outfield'} · {candidate.age ? `${candidate.age} yrs` : 'Age unavailable'}{candidate.nationality ? ` · ${candidate.nationality}` : ''}{candidate.currentTeam ? ` · ${candidate.currentTeam}` : ''}</span></span></button>)}</div><div className="mt-4 flex justify-end"><button type="button" disabled={!photoSelected?.photo} onClick={usePhoto} className="rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black text-black disabled:opacity-40">Use This Photo</button></div></div></div>}
    </div>
  )
}
