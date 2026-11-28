import { useMemo, useState } from 'react'
import { findPartners } from '../engine/partnershipRecords'
import type { RecordsMatchFilters } from '../engine/recordsScope'
import type { Match, Player, Team, View } from '../types'
import { PlayerIdentityAction } from './EntityActions'
import { PlayerAvatar } from './PlayerAvatar'
import { TeamLink } from './TeamLink'
import { VirtualRankingList } from './VirtualRankingList'
import { playerFullName } from './ui'

type Props = {
  players: Player[]
  teams: Team[]
  matches: Match[]
  scope: RecordsMatchFilters
  playerId?: string
  onPlayerChange: (id: string) => void
  onNavigate: (view: View) => void
}

const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFKC').replace(/\s+/g, '')

export function FindPartner({ players, teams, matches, scope, playerId, onPlayerChange, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [selecting, setSelecting] = useState(false)
  const selected = players.find(player => player.id === playerId)
  const choosePlayer = selecting || !selected
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const options = useMemo(() => players.slice().sort((a, b) => playerFullName(a).localeCompare(playerFullName(b))), [players])
  const needle = normalize(query)
  const candidates = choosePlayer ? options.filter(player => [player.name, player.displayName, player.fullName].some(name => name && normalize(name).includes(needle))) : []
  const partners = useMemo(() => findPartners(players, matches, scope, playerId ?? '').map(partner => ({
    ...partner,
    id: JSON.stringify([partner.playerIds[1], partner.teamId]),
  })), [players, matches, scope, playerId])

  return <section aria-label="Find Partner" className="space-y-4">
    {selected && <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-white/5 bg-zinc-900 px-3 py-2">
      <PlayerIdentityAction player={selected} onNavigate={id => onNavigate({ name: 'player', id })} className="flex min-h-10 min-w-0 items-center gap-2 text-sm font-semibold">
        <PlayerAvatar photoUrl={selected.photoUrl || selected.image} number={selected.number} className="h-8 w-8 text-[9px]" />
        <span className="min-w-0 break-words">{playerFullName(selected)}</span>
      </PlayerIdentityAction>
      <button type="button" aria-expanded={selecting} onClick={() => setSelecting(open => !open)} className="min-h-10 shrink-0 rounded-md px-2 text-xs font-semibold text-emerald-300">
        {selecting ? 'Close search' : 'Change player'}
      </button>
    </div>}
    {choosePlayer && <div className="rounded-xl border border-white/5 bg-zinc-900 p-3">
      <label className="block text-xs font-semibold text-zinc-300">Search players
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Player name" className="mt-2 min-h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white focus:border-emerald-400 focus:outline-none" />
      </label>
      <div className="mt-2 max-h-52 overflow-y-auto overscroll-contain">
        {candidates.map(player => <button key={player.id} type="button" aria-pressed={player.id === selected?.id} onClick={() => {
          onPlayerChange(player.id)
          setSelecting(false)
          setQuery('')
        }} className="block min-h-10 w-full rounded-md px-2 text-left text-sm text-zinc-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-emerald-300 aria-pressed:text-emerald-300">
          {playerFullName(player)}
        </button>)}
        {!candidates.length && <p className="p-2 text-xs text-zinc-500">No players match your search.</p>}
      </div>
    </div>}
    {selected && (partners.length ? <div className="overflow-hidden rounded-xl border border-white/5 bg-zinc-900">
      <VirtualRankingList rows={partners} renderRow={partner => {
        const teammate = playerById.get(partner.playerIds[1])
        const team = teamById.get(partner.teamId)
        return <div className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
          <div className="min-w-0">
            <PlayerIdentityAction player={teammate} onNavigate={id => onNavigate({ name: 'player', id })} className="block max-w-full truncate text-sm font-semibold">
              {playerFullName(teammate)}
            </PlayerIdentityAction>
            <div className="flex min-w-0 items-center gap-2 text-[10px] text-zinc-400">
              {team ? <TeamLink team={team} onNavigate={id => onNavigate({ name: 'team', id })} /> : <span className="truncate">{partner.teamId}</span>}
              <span className="shrink-0">{partner.matchesTogether} {partner.matchesTogether === 1 ? 'match' : 'matches'} · {Number(partner.minutesTogether.toFixed(2))}′</span>
            </div>
          </div>
          <button type="button" aria-label={`Open partnership with ${playerFullName(teammate)}${team ? ' at ' + team.name : ''}`} onClick={() => onNavigate({
            name: 'partnership', playerIds: partner.playerIds, teamId: partner.teamId, seasonIds: scope.seasons, competition: scope.competition,
          })} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-emerald-300 focus-visible:outline focus-visible:outline-emerald-300">
            Details <span aria-hidden="true">›</span>
          </button>
        </div>
      }} />
    </div> : <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">No teammates played in the same match with this player in the selected scope.</p>)}
  </section>
}
