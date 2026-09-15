import { useMemo, useState } from 'react'
import { TeamIcon } from '../components/TeamIcon'
import { compactTeamCompetitionProgressMap, competitionSeasonStatus } from '../engine/competition'
import { currentStaticTeams } from '../data/teams'
import { drawRandomTeam } from '../lib/randomDraw'
import { useStore } from '../store'
import type { CompactTeamProgress } from '../engine/competition'
import type { Team, View } from '../types'

function teamAbbreviation(team: Team): string {
  return team.abbreviation || team.shortName || '—'
}

function TeamProgressCard({ team, progress, flipped, onFlip, onNavigate }: { team: Team; progress: CompactTeamProgress; flipped: boolean; onFlip: () => void; onNavigate: () => void }) {
  const faceClass = 'absolute inset-0 flex rounded-xl border border-white/10 bg-zinc-900 shadow-sm [backface-visibility:hidden]'
  const flipLabel = flipped ? `Show ${team.name} card front` : `Show ${team.name} competition progress`
  return <article aria-label={`${team.name} team card`} className="relative min-w-0 aspect-[0.82] [perspective:800px]">
    <div className="relative h-full w-full transition-transform duration-200 motion-reduce:transition-none [transform-style:preserve-3d]" style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
      <div className={`${faceClass} items-center justify-center p-1.5 ${flipped ? 'pointer-events-none' : ''}`}>
        <button type="button" onClick={onNavigate} aria-label={`Open ${team.name}`} className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
          <TeamIcon team={team} className="h-9 w-9 text-[9px] sm:h-11 sm:w-11" />
          <span className="text-[10px] font-black tracking-wide text-zinc-100 sm:text-[11px]">{teamAbbreviation(team)}</span>
        </button>
        <button type="button" onClick={onFlip} aria-label={flipLabel} title={flipLabel} className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white/15 bg-zinc-800 text-[9px] leading-none text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">i</button>
      </div>
      <div className={`${faceClass} items-center p-1.5 [transform:rotateY(180deg)] ${flipped ? '' : 'pointer-events-none'}`}>
        <dl className="w-full space-y-1 text-[9px] leading-tight sm:text-[10px]">
          <div className="flex items-center justify-between gap-1"><dt className="text-zinc-400">League</dt><dd className="font-bold text-zinc-100">{progress.league}</dd></div>
          <div className="flex items-center justify-between gap-1"><dt className="text-zinc-400">Cup</dt><dd className="font-bold text-zinc-100">{progress.cup}</dd></div>
          <div className="flex items-center justify-between gap-1"><dt className="text-zinc-400">UCL</dt><dd className="font-bold text-zinc-100">{progress.champions}</dd></div>
        </dl>
        <button type="button" onClick={onFlip} aria-label={flipLabel} title={flipLabel} className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white/15 bg-zinc-800 text-[9px] leading-none text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">↩</button>
      </div>
    </div>
  </article>
}

export function TeamsScreen({ season, onNavigate }: { season: string; onNavigate: (view: View) => void }) {
  const { teams, players, matches, competitionStates = [] } = useStore()
  const [drawn, setDrawn] = useState<Team | null>(null)
  const [flippedTeamIds, setFlippedTeamIds] = useState<Set<string>>(() => new Set())
  // Tournament engines use the canonical 16-team roster; the grid intentionally
  // displays every saved team, including custom or historical additions.
  const catalogTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const draw = competitionStates.find(state => state.id === `champions:${season}`)
  const status = useMemo(() => competitionSeasonStatus(catalogTeams, matches, season, players, draw), [catalogTeams, matches, season, players, draw])
  const progressByTeamId = useMemo(() => compactTeamCompetitionProgressMap(teams.map(team => team.id), status), [teams, status])
  const toggleFlip = (teamId: string) => setFlippedTeamIds(current => {
    const next = new Set(current)
    if (next.has(teamId)) next.delete(teamId)
    else next.add(teamId)
    return next
  })

  return <div className="px-4 pb-8 pt-6">
    <div className="mb-4"><h1 className="text-2xl font-semibold">Teams</h1><p className="mt-1 text-xs text-zinc-500">Current progress · {season}</p></div>
    <section className="mb-4 rounded-xl border border-white/10 bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Random Team</h2><div className="mt-2"><button type="button" disabled={!catalogTeams.length} onClick={() => setDrawn(drawRandomTeam(catalogTeams))} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black disabled:opacity-40">Draw</button></div>{drawn && <div aria-live="polite" className="mt-3 flex items-center gap-3 rounded-lg bg-black/50 p-3"><TeamIcon team={drawn} className="h-16 w-16 text-lg font-black" /><span className="text-sm font-bold text-emerald-300">{drawn.name}</span></div>}</section>
    <section aria-label="Teams" className="grid grid-cols-4 gap-2">
      {teams.map(team => {
        const progress = progressByTeamId.get(team.id)
        return progress ? <TeamProgressCard key={team.id} team={team} progress={progress} flipped={flippedTeamIds.has(team.id)} onFlip={() => toggleFlip(team.id)} onNavigate={() => onNavigate({ name: 'team', id: team.id })} /> : null
      })}
    </section>
  </div>
}
