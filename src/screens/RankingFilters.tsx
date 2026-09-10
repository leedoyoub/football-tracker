import { useEffect, useRef, useState } from 'react'
import { POSITION_GROUPS, REGISTRATION_POSITIONS, type Match, type Player, type Position, type Team } from '../types'

export type RankingFilters = { seasons: string[]; teams: string[]; positions: Position[] }
export const emptyFilters: RankingFilters = { seasons: [], teams: [], positions: [] }
/** Virtual filter value only. It is never persisted as a Team. */
export const NO_TEAM_FILTER = '__no-team__'
export function playerHasNoCurrentTeam(player: Player) { return ![player.teamId, ...(player.teamIds ?? [])].filter(Boolean).length }

export function matchesForPlayer(player: Player, matches: Match[], filters: RankingFilters) {
  return matches.filter(match =>
    (!filters.seasons.length || filters.seasons.includes(match.season)) &&
    match.appearances.some(appearance => appearance.playerId === player.id) &&
    (!filters.teams.length ||
      (filters.teams.includes(NO_TEAM_FILTER) && playerHasNoCurrentTeam(player)) ||
      match.appearances.some(appearance => appearance.playerId === player.id && filters.teams.includes(appearance.teamId))),
  )
}

export function RankingFilterButton({ applied, onApply, seasons, teams }: {
  applied: RankingFilters
  onApply: (filters: RankingFilters) => void
  seasons: string[]
  teams: Team[]
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(applied)
  useEffect(() => {
    const element = dialog.current
    return () => element?.close()
  }, [])
  const toggle = <K extends keyof RankingFilters>(key: K, value: RankingFilters[K][number]) => {
    setDraft(previous => {
      const values = previous[key] as string[]
      return { ...previous, [key]: values.includes(value) ? values.filter(item => item !== value) : [...values, value] }
    })
  }
  const cancel = () => { setDraft(applied); dialog.current?.close() }
  return <>
    <button type="button" className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold" onClick={() => {
      setDraft({ seasons: [...applied.seasons], teams: [...applied.teams], positions: [...applied.positions] })
      dialog.current?.showModal()
    }}>Filter</button>
    <dialog ref={dialog} onCancel={cancel} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-white backdrop:bg-black/70">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 border-b border-white/10 bg-zinc-900 px-4 pt-4 pb-3"><h2 className="mb-3 text-lg font-semibold">Filter</h2><div className="flex justify-end gap-3">
        <button type="button" onClick={cancel} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm">Cancel</button>
        <button type="button" onClick={() => { onApply(draft); dialog.current?.close() }} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black">Apply</button>
      </div></div>
      <fieldset className="mb-4"><legend className="mb-2 text-sm font-semibold">Season</legend>
        <div className="flex flex-wrap gap-3">{seasons.map(season => <label key={season} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.seasons.includes(season)} onChange={() => toggle('seasons', season)} />{season}</label>)}</div>
      </fieldset>
      <fieldset className="mb-4"><legend className="mb-2 text-sm font-semibold">Team</legend>
        <div className="space-y-2"><label className="flex items-center gap-2 break-words text-xs"><input type="checkbox" checked={draft.teams.includes(NO_TEAM_FILTER)} onChange={() => toggle('teams', NO_TEAM_FILTER)} />No Team</label>{teams.map(team => <label key={team.id} className="flex items-center gap-2 break-words text-xs"><input type="checkbox" checked={draft.teams.includes(team.id)} onChange={() => toggle('teams', team.id)} />{team.name}</label>)}</div>
      </fieldset>
      <fieldset><legend className="mb-2 text-sm font-semibold">Detailed Position</legend>
        <div className="mb-3 grid grid-cols-2 gap-3">{Object.entries(POSITION_GROUPS).map(([name, positions]) => <label key={name} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={positions.every(position => draft.positions.includes(position))} onChange={() => setDraft(previous => ({ ...previous, positions: positions.every(position => previous.positions.includes(position)) ? previous.positions.filter(position => !(positions as readonly Position[]).includes(position)) : [...new Set([...previous.positions, ...positions])] }))} />
          All {name.charAt(0) + name.slice(1).toLowerCase()}
        </label>)}</div>
        <div className="grid grid-cols-4 gap-3">{REGISTRATION_POSITIONS.map(position => <label key={position} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.positions.includes(position)} onChange={() => toggle('positions', position)} />{position}</label>)}</div>
      </fieldset>
    </dialog>
  </>
}
