import { useMemo, useState } from 'react'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { playerDisplayName } from '../components/ui'
import { apiFootballPlayerIdQuery, searchApiFootballPlayers, type ApiFootballPlayerSearchResult } from '../lib/apiFootball'
import { useAuth } from '../lib/auth'
import { RosterCapacityError, rosterCount, TEAM_ROSTER_LIMIT } from '../lib/roster'
import { importedPosition, sameExternalPlayer, validImportedNumber } from '../lib/squadImport'
import { deriveApiPlayerNames } from '../lib/playerNames'
import { useStore } from '../store'
import { REGISTRATION_POSITIONS, type RegistrationPosition, type View } from '../types'

export function NewPlayerScreen({ teamId, onNavigate }: { teamId?: string; onNavigate: (view: View) => void }) {
  const { teams, players, addPlayer, updatePlayer } = useStore(); const { user } = useAuth()
  const [fullName, setFullName] = useState(''); const [displayName, setDisplayName] = useState(''); const [number, setNumber] = useState(10); const [position, setPosition] = useState<RegistrationPosition>('CM')
  const [selectedTeam, setSelectedTeam] = useState(() => teamId && rosterCount(players, teamId) < TEAM_ROSTER_LIMIT ? teamId : '')
  const [saveError, setSaveError] = useState(''); const [showSuggestions, setShowSuggestions] = useState(false); const [searchField, setSearchField] = useState<'fullName' | 'displayName'>('displayName'); const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [apiQuery, setApiQuery] = useState(''); const [apiResults, setApiResults] = useState<ApiFootballPlayerSearchResult[]>([]); const [apiSelected, setApiSelected] = useState<ApiFootballPlayerSearchResult | null>(null); const [apiLoading, setApiLoading] = useState(false); const [apiError, setApiError] = useState('')
  const selectedPlayer = players.find(player => player.id === selectedPlayerId)
  const suggestions = useMemo(() => { const q = (searchField === 'fullName' ? fullName : displayName).trim().toLowerCase(); return q ? players.filter(player => [player.displayName, player.fullName, player.name].some(name => name?.toLowerCase().includes(q))) : [] }, [displayName, fullName, searchField, players])
  const runSearch = async () => {
    const trimmed = apiQuery.trim()
    if (!user) {
      setApiError('Google sign-in is required for API player search. Manual creation is still available.')
      return
    }
    const exactId = apiFootballPlayerIdQuery(trimmed)
    if (exactId === undefined) {
      setApiError('Enter a valid API-Football Player ID.')
      return
    }
    setApiLoading(true)
    setApiError('')
    setApiResults([])
    try {
      const results = await searchApiFootballPlayers(trimmed)
      setApiResults(results)
      if (!results.length) {
        setApiError('No player found for this API-Football ID.')
      }
    } catch (error) {
      setApiError('No player found for this API-Football ID.')
    } finally {
      setApiLoading(false)
    }
  }
  const selectApiPlayer = (candidate: ApiFootballPlayerSearchResult) => { const existing = players.find(player => sameExternalPlayer(player, candidate.id)); const names = deriveApiPlayerNames(candidate); setApiSelected(candidate); setFullName(names.fullName); setDisplayName(names.displayName); setNumber(validImportedNumber(candidate.number)); setPosition(importedPosition(candidate.position) as RegistrationPosition); setSelectedPlayerId(existing?.id ?? null); setShowSuggestions(false); setApiResults([]); setApiError(existing ? 'This API player already exists. Saving will reuse it and add the selected team if needed.' : '') }
  const save = () => { try { if (selectedPlayer) { updatePlayer(selectedPlayer.id, { teamIds: [...new Set([selectedPlayer.teamId, ...(selectedPlayer.teamIds ?? []), selectedTeam].filter(Boolean))], ...(apiSelected ? { externalPlayerId: apiSelected.id, photoUrl: apiSelected.photo || selectedPlayer.photoUrl } : {}) }); onNavigate({ name: 'player', id: selectedPlayer.id }); return }; const id = addPlayer({ name: displayName.trim(), fullName: fullName.trim() || displayName.trim(), displayName: displayName.trim(), number, position, teamId: selectedTeam, ...(apiSelected ? { externalPlayerId: apiSelected.id, photoUrl: apiSelected.photo || undefined } : {}) }); onNavigate({ name: 'player', id }) } catch (error) { setSaveError(error instanceof RosterCapacityError ? 'That team is full (23/23). Choose another team or No Team.' : 'Could not save player.') } }
  return <div className="px-4 pb-8 pt-6"><button type="button" onClick={() => onNavigate(teamId ? { name: 'team', id: teamId } : { name: 'players' })} className="mb-3 text-xs font-semibold text-emerald-400">← Cancel</button><h1 className="mb-4 text-2xl font-semibold">New player</h1>
    <section className="mb-4 rounded-xl border border-white/10 bg-zinc-900 p-3">
      <h2 className="text-sm font-semibold">Search API Player</h2>
      <p className="mb-2 text-[11px] text-zinc-400">Optional — search by numeric API-Football Player ID. Team selection remains completely separate.</p>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-zinc-400">API-Football Player ID</label>
        <div className="flex gap-2">
          <input value={apiQuery} onChange={event => setApiQuery(event.target.value)} placeholder="e.g. 152982" className="min-w-0 flex-1 rounded-lg bg-black px-3 py-2 text-sm" />
          <button type="button" onClick={() => void runSearch()} disabled={apiLoading} className="shrink-0 rounded-lg bg-zinc-700 px-3 py-2 text-xs font-bold disabled:opacity-40">{apiLoading ? 'Searching…' : 'Search'}</button>
        </div>
      </div>
      {apiError && <p role="alert" className="mt-2 text-xs text-amber-300">{apiError}</p>}
      {apiResults.length > 0 && <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">{apiResults.map(candidate => <button key={candidate.id} type="button" onClick={() => selectApiPlayer(candidate)} className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-zinc-800"><PlayerAvatar photoUrl={candidate.photo} number={candidate.number ?? undefined} className="h-9 w-9 text-[9px]" /><span className="min-w-0 flex-1"><b className="block truncate text-xs">{candidate.name}</b><span className="block truncate text-[10px] text-zinc-400">{candidate.position || 'Outfield'} · {candidate.age ? `${candidate.age} yrs` : 'Age unavailable'}{candidate.nationality ? ` · ${candidate.nationality}` : ''}{candidate.currentTeam ? ` · ${candidate.currentTeam}` : ''}</span></span></button>)}</div>}
    </section>
    {apiSelected && <p className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">Selected API player: {apiSelected.name}. Team assignment below remains yours to choose.</p>}
    <div className="space-y-3"><select value={selectedTeam} onChange={event => { setSelectedTeam(event.target.value); setSaveError('') }} className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm"><option value="">No Team</option>{teams.map(team => <option key={team.id} value={team.id} disabled={rosterCount(players, team.id) >= TEAM_ROSTER_LIMIT}>{team.name} — {rosterCount(players, team.id) >= TEAM_ROSTER_LIMIT ? `Full (${TEAM_ROSTER_LIMIT}/${TEAM_ROSTER_LIMIT})` : `${rosterCount(players, team.id)}/${TEAM_ROSTER_LIMIT}`}</option>)}</select>
      <input value={fullName} onChange={event => { setFullName(event.target.value); setSelectedPlayerId(null); setSearchField('fullName'); setShowSuggestions(true) }} onFocus={() => { setSearchField('fullName'); setShowSuggestions(true) }} placeholder="Full name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm" />
      <div className="relative"><input value={displayName} onChange={event => { setDisplayName(event.target.value); setSelectedPlayerId(null); setSearchField('displayName'); setShowSuggestions(true) }} onFocus={() => { setSearchField('displayName'); setShowSuggestions(true) }} placeholder="Display name" className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm" />{showSuggestions && suggestions.length > 0 && <div className="absolute left-0 top-full z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 shadow-xl">{suggestions.map(player => <button key={player.id} type="button" onClick={() => { setSelectedPlayerId(player.id); setDisplayName(playerDisplayName(player)); setFullName(player.fullName || player.name); setShowSuggestions(false) }} className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800"><span className="block truncate">{playerDisplayName(player)}</span><span className="block truncate text-xs text-zinc-400">#{player.number} · {teams.filter(team => [player.teamId, ...(player.teamIds ?? [])].includes(team.id)).map(team => team.shortName).join(', ')}</span></button>)}</div>}</div>
      <input type="number" value={selectedPlayer?.number ?? number} disabled={!!selectedPlayer} onChange={event => setNumber(Number(event.target.value))} className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm" />
      <select value={selectedPlayer?.position ?? position} disabled={!!selectedPlayer} onChange={event => setPosition(event.target.value as RegistrationPosition)} className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm">{selectedPlayer && !REGISTRATION_POSITIONS.includes(selectedPlayer.position as RegistrationPosition) && <option value={selectedPlayer.position}>{selectedPlayer.position}</option>}{REGISTRATION_POSITIONS.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <button type="button" disabled={!displayName.trim()} onClick={save} className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-black disabled:opacity-40">{selectedPlayer ? 'Add to team' : 'Create player'}</button>{saveError && <p role="alert" className="text-xs font-semibold text-red-400">{saveError}</p>}</div>
  </div>
}
