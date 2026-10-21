import { useMemo } from 'react'
import { AwardBestXI } from '../components/AwardBestXI'
import { CompactFilterMenu } from '../components/CompactFilterMenu'
import { RankingMetricTabs, RankingRow } from '../components/RankingRow'
import { VirtualRankingList } from '../components/VirtualRankingList'
import { COMPETITION_OPTIONS } from '../lib/competitionOptions'
import { historicalPlayerLabel } from '../lib/historicalPlayerDisplay'
import { playerFullName } from '../components/ui'
import { officialAwardSeasons } from '../engine/officialAwards'
import { teamAwardMomentLabel, teamHistoryBestXI, teamHistoryHonors, teamHistoryRecords, type TeamHistoryRecordRow } from '../engine/teamHistory'
import type { CompetitionState, Match, Player, ScreenStateByView, Team, View } from '../types'

type TeamHistoryProps = {
  teamId: string; season: string; teams: Team[]; players: Player[]; matches: Match[]; states: CompetitionState[]
  screenState: ScreenStateByView['team']; onStateChange: (patch: Partial<ScreenStateByView['team']>) => void; onNavigate: (view: View) => void
}
const competitionLabel = { league: 'League', cup: 'Cup', champions: 'Champions' }

/** Mounted only in History. Each menu derives its own model and leaves other menus idle. */
export function TeamHistory({ teamId, season, teams, players, matches, states, screenState, onStateChange, onNavigate }: TeamHistoryProps) {
  const competition = screenState.historyCompetition ?? 'all'
  const menu = screenState.historyMenu ?? 'honors'
  const recordsMode = screenState.historyRecordsMode ?? 'season'
  const seasons = useMemo(() => officialAwardSeasons(matches, states), [matches, states])
  const selectedSeason = screenState.historySeason && seasons.includes(screenState.historySeason) ? screenState.historySeason : seasons.includes(season) ? season : seasons[0] ?? season
  const disclosures = screenState.historyDisclosures ?? []
  const expandedRecords = screenState.historyExpandedRecords ?? []
  const toggle = (key: string) => onStateChange({ historyDisclosures: disclosures.includes(key) ? disclosures.filter(item => item !== key) : [...disclosures, key] })
  const honors = useMemo(() => menu === 'honors' ? teamHistoryHonors(teams, players, matches, states, teamId, competition) : undefined, [menu, teams, players, matches, states, teamId, competition])
  const records = useMemo(() => menu === 'records' ? teamHistoryRecords(players, matches, { teamId, competition, season: recordsMode === 'all-time' ? null : selectedSeason }) : [], [menu, players, matches, teamId, competition, recordsMode, selectedSeason])
  const bestXI = useMemo(() => menu === 'best-xi' ? teamHistoryBestXI(players, matches, { teamId, competition, season: selectedSeason }) : undefined, [menu, players, matches, teamId, competition, selectedSeason])
  const byId = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const honorName = (id: string) => playerFullName(byId.get(id)).trim() || historicalPlayerLabel(id, byId.get(id)).trim() || historicalPlayerLabel(id)
  const team = teams.find(item => item.id === teamId)
  const openPlayer = (id: string, awardSeason?: string) => onNavigate({ name: 'player', id, season: awardSeason ?? selectedSeason, competitionType: competition })
  const renderRecord = (row: TeamHistoryRecordRow) => <RankingRow rank={row.rank} player={byId.get(row.playerId)} team={team} positionLabel={row.position} value={String(row.value)} onClick={() => openPlayer(row.playerId)} />
  return <section className="mt-4 min-w-0" aria-label="Team History">
    <RankingMetricTabs label="Team History competition" value={competition} options={COMPETITION_OPTIONS} onChange={historyCompetition => onStateChange({ historyCompetition })} />
    <div className="mt-3"><RankingMetricTabs label="Team History menu" value={menu} options={[{ value: 'honors', label: 'Honors' }, { value: 'records', label: 'Records' }, { value: 'best-xi', label: 'Best XI' }]} onChange={historyMenu => onStateChange({ historyMenu })} /></div>
    {menu !== 'honors' && <div className="my-4 flex flex-wrap items-center gap-2">
      {menu === 'records' && <RankingMetricTabs label="Team History records period" value={recordsMode} options={[{ value: 'season', label: 'Season' }, { value: 'all-time', label: 'All-Time' }]} onChange={historyRecordsMode => onStateChange({ historyRecordsMode })} />}
      {(menu === 'best-xi' || recordsMode === 'season') && <CompactFilterMenu label="Team History season" value={selectedSeason} options={(seasons.length ? seasons : [season]).map(value => ({ value, label: value }))} onChange={historySeason => onStateChange({ historySeason })} popupAlign="start" />}
    </div>}
    {menu === 'honors' && honors && <>
      <div className="my-4 grid grid-cols-3 gap-2 text-center">{[['Championships', honors.championships], ['Runner-ups', honors.runnerUps], ['Finals', honors.finals]].map(([label, value]) => <div key={label} className="rounded-xl bg-zinc-900 px-1 py-3"><b className="block text-lg">{value}</b><span className="text-[9px] uppercase text-zinc-500">{label}</span></div>)}</div>
      <section className="mb-4 overflow-hidden rounded-xl bg-zinc-900">
        <button type="button" className="flex min-h-12 w-full items-center justify-between gap-2 p-3 text-left text-sm font-semibold" aria-expanded={!disclosures.includes('season-history-closed')} onClick={() => toggle('season-history-closed')}>Season History <span className="text-zinc-500">{disclosures.includes('season-history-closed') ? '+' : '−'}</span></button>
        {!disclosures.includes('season-history-closed') && <div className="px-3 pb-3">{honors.seasonHistory.map(row => {
          const seasonKey = `season:${row.season}`, seasonOpen = disclosures.includes(seasonKey)
          return <div key={row.season} className="border-t border-white/5"><button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-xs font-bold" aria-expanded={seasonOpen} onClick={() => toggle(seasonKey)}>{row.season}<span className="text-zinc-500">{seasonOpen ? '−' : '+'}</span></button>{seasonOpen && <div className="pb-2">{row.results.map(result => <div key={result.competition} className="flex items-start justify-between gap-3 py-1 text-[11px]"><span className="text-zinc-500">{competitionLabel[result.competition]}</span><span className={`text-right ${result.result?.champion ? 'font-bold text-amber-300' : 'text-zinc-300'}`}>{result.status}</span></div>)}</div>}</div>
        })}{!honors.seasonHistory.length && <p className="text-xs text-zinc-500">No season history yet.</p>}</div>}
      </section>
      <section className="overflow-hidden rounded-xl bg-zinc-900">
        <button type="button" className="flex min-h-12 w-full items-center justify-between gap-2 p-3 text-left text-sm font-semibold" aria-expanded={!disclosures.includes('individual-closed')} onClick={() => toggle('individual-closed')}>Individual Honors <span className="text-xs text-zinc-500">{honors.individual.reduce((sum, kind) => sum + kind.count, 0)} {disclosures.includes('individual-closed') ? '+' : '−'}</span></button>
        {!disclosures.includes('individual-closed') && <div className="px-3 pb-3">{honors.individual.map(kind => {
          const key = `kind:${kind.kind}`, expanded = disclosures.includes(key)
          return <div key={kind.kind} className="border-t border-white/5">
            <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-xs font-semibold" aria-expanded={expanded} onClick={() => toggle(key)}><span>{kind.label}</span><span className="shrink-0 text-emerald-300">{kind.count} {expanded ? '−' : '+'}</span></button>
            {expanded && <div className="space-y-2 pb-3">{kind.players.map(player => {
              const playerKey = `${key}:player:${player.playerId}`, momentsOpen = disclosures.includes(playerKey)
              return <div key={player.playerId} className="rounded-lg bg-black/20 p-2"><div className="flex items-center justify-between gap-2"><button type="button" className="min-w-0 py-1 text-left text-xs font-semibold text-zinc-200 [overflow-wrap:anywhere]" onClick={() => openPlayer(player.playerId, player.events[0]?.season)}>{honorName(player.playerId)}</button><button type="button" className="shrink-0 rounded-lg px-2 py-2 text-[10px] font-bold text-emerald-300" aria-label={`${kind.label} award moments for ${honorName(player.playerId)}`} aria-expanded={momentsOpen} onClick={() => toggle(playerKey)}>{player.count} {momentsOpen ? '−' : '+'}</button></div>{momentsOpen && <div className="flex flex-wrap gap-1">{player.events.map(event => <span key={event.id} className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">{teamAwardMomentLabel(event)}</span>)}</div>}</div>
            })}</div>}
          </div>
        })}{!honors.individual.length && <p className="text-xs text-zinc-500">No official individual honors in this scope yet.</p>}</div>}
      </section>
    </>}
    {menu === 'records' && <div className="space-y-4">{records.map(group => {
      const expanded = expandedRecords.includes(group.metric)
      return <section key={group.metric} className="overflow-hidden rounded-xl bg-zinc-900"><h3 className="px-3 pt-3 text-sm font-semibold">{group.label}</h3><div className="mt-2">{expanded ? <VirtualRankingList rows={group.rows} renderRow={renderRecord} /> : group.rows.slice(0, 3).map(row => <div key={row.playerId} className="border-b border-white/5 last:border-0">{renderRecord(row)}</div>)}{!group.rows.length && <p className="p-3 text-xs text-zinc-500">No recorded appearances in this scope.</p>}</div>{group.rows.length > 3 && <button type="button" aria-expanded={expanded} onClick={() => onStateChange({ historyExpandedRecords: expanded ? [] : [group.metric] })} className="secondary-view-all m-3 w-[calc(100%-1.5rem)]">{expanded ? 'Show Top 3' : 'View All'}</button>}</section>
    })}</div>}
    {menu === 'best-xi' && bestXI && <>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-400">{selectedSeason} · {competition === 'all' ? 'All competitions' : competitionLabel[competition]}<br />
        {bestXI.formation && <>Most-used formation: {bestXI.formation.label} · {bestXI.formation.matches} matches<br /></>}
        Minimum {bestXI.minimumAppearances} of {bestXI.teamMatches} recorded team matches (40%).</p>
      {bestXI.formation ? <AwardBestXI title={`Team Best XI · ${bestXI.formation.label}`} result={bestXI} players={players} teams={teams} showEmptySlots presentation="team-history" onPlayerOpen={id => openPlayer(id)} /> : <p className="rounded-xl bg-zinc-900 p-4 text-xs text-zinc-400">No valid saved kickoff formation in this scope.</p>}
      {bestXI.formation && !bestXI.bestXI.some(slot => slot.playerId) && <p className="text-xs text-zinc-500">No qualifying players in this scope yet.</p>}
    </>}
  </section>
}
