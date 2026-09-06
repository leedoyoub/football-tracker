import { createContext, useEffect, useMemo, useState } from 'react'
import { DndContext, PointerSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { FORMATION_SLOTS, Pitch, UNIVERSAL_TACTICAL_SLOTS, type TacticalSlot } from '../components/Pitch'
import { calculateFormation } from '../engine/formation'
import { playerSeasonStats } from '../engine/stats'
import { POSITIONS, type Appearance, type Best11Slot, type MatchEvent, type Player, type Position, type View } from '../types'
import { useStore } from '../store'
import { playerDisplayName, StatIcons } from '../components/ui'

type FormationSlotConfig = TacticalSlot

const StarterPositionContext = createContext<{ positions: Record<string, Position>; highlightPosition?: Position }>({ positions: {} })

function fillFormationSlots(
  squad: { id: string; position: Position }[],
  slots: FormationSlotConfig[],
  existing: string[] = [],
): string[] {
  const ordered = existing.filter(Boolean).map((id) => squad.find((player) => player.id === id)).filter((player): player is { id: string; position: Position } => Boolean(player))
  const available = squad.filter((player) => !ordered.some((selected) => selected.id === player.id))
  const remaining = [...ordered, ...available]
  const used = new Set<string>()
  return slots.map((slot) => {
    const match = remaining.find((player) => !used.has(player.id) && player.position === slot.position)
    const fallback = remaining.find((player) => !used.has(player.id))
    const selected = match ?? fallback
    if (!selected) return ''
    used.add(selected.id)
    return selected.id
  })
}

export function NewMatchScreen({
  teamId,
  onNavigate,
}: {
  teamId?: string
  onNavigate: (view: View) => void
}) {
  const { teams, players, matches, addMatch, saveDraftMatch, clearDraftMatch } = useStore()
  const [draftId] = useState(() => crypto.randomUUID())
  const selectedTeamId = teamId ?? teams[0]?.id ?? ''
  // Season and match day are deliberately scoped to the registered team.
  const teamMatches = matches.filter((match) => match.teamId === selectedTeamId || (!match.teamId && (match.homeTeamId === selectedTeamId || match.awayTeamId === selectedTeamId)))
  const nextMatchIndex = teamMatches.length
  const season = `Season ${Math.floor(nextMatchIndex / 38) + 1}`
  const formation = '4-3-3'
  const matchDay = (nextMatchIndex % 38) + 1
  const date = new Date().toISOString().split('T')[0]
  const [opponentName, setOpponentName] = useState('OPP')
  const opponentId = `opponent:${draftId}`
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home')
  const homeTeamId = homeAway === 'home' ? selectedTeamId : opponentId
  const awayTeamId = homeAway === 'home' ? opponentId : selectedTeamId

  const [step, setStep] = useState(0) // 0: Lineups, 1: Events
  const [homeXi, setHomeXi] = useState<string[]>(Array(11).fill(''))
  const [homeBench, setHomeBench] = useState<string[]>(Array(12).fill(''))
  
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [evType, setEvType] = useState<'goal' | 'save' | 'sub'>('goal')
  const [minute, setMinute] = useState(10)
  const [eventTeamId, setEventTeamId] = useState(homeTeamId)
  const [playerId, setPlayerId] = useState('')
  const [assistId, setAssistId] = useState('')
  const [playerOutId, setPlayerOutId] = useState('')
  const [playerInId, setPlayerInId] = useState('')
  const [subPos, setSubPos] = useState<Position>('CM')
  const [goalType, setGoalType] = useState<'normal' | 'wonder' | 'assist-led'>('normal')
  const [ownGoal, setOwnGoal] = useState(false)
  const [concededGoalCausePlayerId, setConcededGoalCausePlayerId] = useState('')
  const [liveEvent, setLiveEvent] = useState<'goal' | 'conceded' | 'substitution' | 'save' | null>(null)
  const [liveMinute, setLiveMinute] = useState(1)
  const [liveScorerId, setLiveScorerId] = useState('')
  const [liveAssistId, setLiveAssistId] = useState('')
  const [liveGoalType, setLiveGoalType] = useState<'normal' | 'wonder' | 'assist-led'>('normal')
  const [liveCauseId, setLiveCauseId] = useState('')
  const [livePicker, setLivePicker] = useState<'scorer' | 'assist' | 'cause' | 'save'>('scorer')
  const [liveSaveCount, setLiveSaveCount] = useState(1)
  const [liveSavePlayerId, setLiveSavePlayerId] = useState('')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [subDraftAssignments, setSubDraftAssignments] = useState<Record<string, string> | null>(null)
  const [subDraftBench, setSubDraftBench] = useState<string[] | null>(null)
  const [activePlayer, setActivePlayer] = useState<{ group: 'starting' | 'substitute' | 'squad'; id: string; slotId?: string } | null>(null)
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null)
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({})
  const [startingSnapshot, setStartingSnapshot] = useState<Record<string, string>>({})
  const [benchSnapshot, setBenchSnapshot] = useState<string[]>([])
  const lineupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  )
  const formationSlots = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-3-3']
  const universalPitchSlots = UNIVERSAL_TACTICAL_SLOTS.map((slot) => ({ ...slot, playerId: slotAssignments[slot.slot] ?? null, teamId: selectedTeamId, avgRating: 0, matches: 0 }))
  const activeFormationName = calculateFormation(
    UNIVERSAL_TACTICAL_SLOTS.filter((slot) => Boolean(slotAssignments[slot.slot])).map((slot) => slot.matchPosition),
  )
  const startingIds = UNIVERSAL_TACTICAL_SLOTS.map((slot) => slotAssignments[slot.slot]).filter(Boolean)
  const focusedPlayer = focusedPlayerId ? players.find((player) => player.id === focusedPlayerId) : undefined
  const starterPositionByPlayer = Object.fromEntries(UNIVERSAL_TACTICAL_SLOTS.flatMap((slot) => {
    const id = slotAssignments[slot.slot]
    return id ? [[id, slot.matchPosition]] : []
  })) as Record<string, Position>

  useEffect(() => {
    const fill = (tid: string, setXi: (v: string[]) => void, setBench: (v: string[]) => void) => {
      const squad = players.filter((p) => (p.teamIds ?? [p.teamId]).includes(tid))
      const initial = fillFormationSlots(squad, FORMATION_SLOTS['4-3-3'])
      setXi(initial)
      if (tid === selectedTeamId) {
        setSlotAssignments(Object.fromEntries(FORMATION_SLOTS['4-3-3'].map((slot, index) => [slot.slot, initial[index]]).filter((entry) => Boolean(entry[1]))))
        setXi(initial)
      }
      const starterIds = new Set(initial.filter(Boolean))
      const b = squad.filter((player) => !starterIds.has(player.id)).slice(0, 12).map((player) => player.id)
      setBench(b)
    }
    fill(selectedTeamId, setHomeXi, setHomeBench)
  }, [selectedTeamId, players])

  const homeSquad = players.filter((p) => (p.teamIds ?? [p.teamId]).includes(selectedTeamId))
  // Kept for the legacy hidden event editor; live events always use our current XI.
  const eventSquad = homeSquad
  const draftPlayers = homeSquad
  const usedIds = new Set([...startingIds, ...homeBench.filter(Boolean)])
  const squadPlayers = draftPlayers.filter((player) => !usedIds.has(player.id))
  const seasonStats = Object.fromEntries(draftPlayers.map((player) => {
    const stats = playerSeasonStats(player, matches, season)
    return [player.id, { goals: stats.goals, assists: stats.assists }]
  }))
  const liveSlots = UNIVERSAL_TACTICAL_SLOTS
    .map((slot) => ({ ...slot, playerId: slotAssignments[slot.slot] ?? null, teamId: selectedTeamId, avgRating: 0, matches: 0 }))
  const liveStats = Object.fromEntries(draftPlayers.map((player) => {
    const committed = editingEventId ? events.filter((event) => event.id !== editingEventId) : events
    return [player.id, {
      goals: committed.filter((event) => event.type === 'goal' && event.playerId === player.id).length + (liveEvent === 'goal' && liveScorerId === player.id ? 1 : 0),
      assists: committed.filter((event) => event.type === 'goal' && event.assistPlayerId === player.id).length + (liveEvent === 'goal' && liveAssistId === player.id ? 1 : 0),
    }]
  }))
  const liveOnPitchIds = new Set(liveSlots.flatMap((slot) => slot.playerId ? [slot.playerId] : []))
  const liveOnPitchPlayers = draftPlayers.filter((player) => liveOnPitchIds.has(player.id))
  const liveBenchPlayers = homeBench.filter(Boolean).map((id) => draftPlayers.find((player) => player.id === id)).filter((player): player is NonNullable<typeof player> => Boolean(player))
  const minuteIsValid = Number.isInteger(liveMinute) && liveMinute >= 0 && liveMinute <= 90

  function openLiveEvent(type: NonNullable<typeof liveEvent>) {
    setEditingEventId(null)
    setLiveEvent(type)
    setLiveMinute(Math.max(1, Math.min(90, liveMinute)))
    setLiveScorerId('')
    setLiveAssistId('')
    setLiveCauseId('')
    setLiveSavePlayerId('')
    setLiveSaveCount(1)
    setLivePicker(type === 'conceded' ? 'cause' : type === 'save' ? 'save' : 'scorer')
    if (type === 'substitution') {
      setSubDraftAssignments({ ...slotAssignments })
      setSubDraftBench([...homeBench])
    }
  }

  function saveLiveEvent() {
    if (!liveEvent || !minuteIsValid) return
    const id = crypto.randomUUID()
    const writeEvent = (event: MatchEvent) => setEvents(editingEventId ? events.map((existing) => existing.id === editingEventId ? event : existing) : [...events, event])
    if (liveEvent === 'goal') {
      if (liveScorerId && liveScorerId === liveAssistId) return
      writeEvent({ id: editingEventId ?? id, type: 'goal', minute: liveMinute, teamId: selectedTeamId, playerId: liveScorerId || undefined, assistPlayerId: liveScorerId ? liveAssistId || undefined : undefined, goalType: liveGoalType })
    } else if (liveEvent === 'conceded') {
      writeEvent({ id: editingEventId ?? id, type: 'goal', minute: liveMinute, teamId: opponentId, playerId: undefined, concededGoalCausePlayerId: liveCauseId || undefined })
    } else if (liveEvent === 'save') {
      const keeper = liveOnPitchPlayers.find((player) => player.id === liveSavePlayerId && player.position === 'GK')
      if (!keeper || !Number.isInteger(liveSaveCount) || liveSaveCount < 1) return
      writeEvent({ id: editingEventId ?? id, type: 'save', teamId: selectedTeamId, playerId: keeper.id, count: liveSaveCount })
    } else if (subDraftAssignments && subDraftBench) {
      const substitutions = UNIVERSAL_TACTICAL_SLOTS.flatMap((slot) => {
        const playerOutId = slotAssignments[slot.slot]
        const playerInId = subDraftAssignments[slot.slot]
        return playerOutId && playerInId && playerOutId !== playerInId
          ? [{ id: crypto.randomUUID(), type: 'sub' as const, minute: liveMinute, teamId: selectedTeamId, playerOutId, playerInId, position: slot.matchPosition }]
          : []
      })
      if (!substitutions.length) return
      setEvents([...events, ...substitutions])
      setSlotAssignments(subDraftAssignments)
      setHomeBench(subDraftBench)
      setHomeXi(UNIVERSAL_TACTICAL_SLOTS.map((slot) => subDraftAssignments[slot.slot] ?? '').filter(Boolean))
    }
    setLiveEvent(null)
    setEditingEventId(null)
    setSubDraftAssignments(null)
    setSubDraftBench(null)
  }

  function cancelLiveEvent() {
    setLiveEvent(null)
    setEditingEventId(null)
    setLiveScorerId('')
    setLiveAssistId('')
    setLiveCauseId('')
    setLiveSavePlayerId('')
  }

  function editLiveEvent(event: MatchEvent) {
    if (event.type === 'sub') return
    setEditingEventId(event.id)
    if (event.type === 'save') {
      setLiveEvent('save'); setLiveSavePlayerId(event.playerId); setLiveSaveCount(event.count ?? 1); setLivePicker('save'); return
    }
    setLiveMinute(event.minute)
    if (event.teamId === selectedTeamId) {
      setLiveEvent('goal'); setLiveScorerId(event.playerId ?? ''); setLiveAssistId(event.assistPlayerId ?? ''); setLiveGoalType(event.goalType ?? (event.wondergoal ? 'wonder' : 'normal')); setLivePicker('scorer')
    } else {
      setLiveEvent('conceded'); setLiveCauseId(event.concededGoalCausePlayerId ?? ''); setLivePicker('cause')
    }
  }

  function deleteLiveEvent(event: MatchEvent) {
    if (!window.confirm('Delete this event?')) return
    setEvents(events.filter((existing) => existing.id !== event.id))
  }

  function commitLiveSubstitutions(nextAssignments: Record<string, string>, nextBench: string[], substitutionMinute: number) {
    const substitutions = UNIVERSAL_TACTICAL_SLOTS.flatMap((slot) => {
      const playerOutId = slotAssignments[slot.slot]
      const playerInId = nextAssignments[slot.slot]
      return playerInId && playerInId !== playerOutId
        ? [{ id: crypto.randomUUID(), type: 'sub' as const, minute: substitutionMinute, teamId: selectedTeamId, playerOutId: playerOutId ?? '', playerInId, position: slot.matchPosition }]
        : []
    })
    if (!substitutions.length) return false
    setEvents([...events, ...substitutions])
    setSlotAssignments(nextAssignments)
    setHomeBench(nextBench)
    setHomeXi(UNIVERSAL_TACTICAL_SLOTS.map((slot) => nextAssignments[slot.slot] ?? '').filter(Boolean))
    return true
  }

  function swapDraft(targetGroup: 'starting' | 'substitute' | 'squad', targetId: string) {
    if (!activePlayer || activePlayer.group === targetGroup) return
    const nextAssignments = { ...slotAssignments }
    const nextXi = [...homeXi]
    const nextBench = [...homeBench]
    if (activePlayer.group === 'starting' && activePlayer.slotId) {
      const slotIndex = formationSlots.findIndex((slot) => slot.slot === activePlayer.slotId)
      const oldId = nextAssignments[activePlayer.slotId] ?? nextXi[slotIndex]
      if (targetGroup === 'substitute') {
        const targetIndex = nextBench.indexOf(targetId)
        nextAssignments[activePlayer.slotId] = targetId
        if (targetIndex >= 0) nextBench[targetIndex] = oldId
      } else nextAssignments[activePlayer.slotId] = targetId
    } else if (activePlayer.group === 'substitute') {
      const activeIndex = nextBench.indexOf(activePlayer.id)
      if (targetGroup === 'starting') {
        const targetSlot = Object.keys(nextAssignments).find((slotId) => nextAssignments[slotId] === targetId)
        if (activeIndex >= 0 && targetSlot) {
          nextBench[activeIndex] = targetId
          nextAssignments[targetSlot] = activePlayer.id
        }
      } else {
        if (activeIndex >= 0) nextBench[activeIndex] = targetId
      }
    } else {
      if (targetGroup === 'starting') {
        const targetSlot = Object.keys(nextAssignments).find((slotId) => nextAssignments[slotId] === targetId)
        if (targetSlot) nextAssignments[targetSlot] = activePlayer.id
      } else {
        const targetIndex = nextBench.indexOf(targetId)
        if (targetIndex >= 0) nextBench[targetIndex] = activePlayer.id
      }
    }
    const syncedXi = UNIVERSAL_TACTICAL_SLOTS.map((slot) => nextAssignments[slot.slot] ?? '').filter(Boolean)
    setSlotAssignments(nextAssignments)
    setHomeXi(syncedXi)
    setHomeBench(nextBench)
    setActivePlayer(null)
  }

  function moveStartingSlot(activeSlot: string, targetSlot: string) {
    const playerId = slotAssignments[activeSlot]
    const targetPlayerId = slotAssignments[targetSlot]
    if (!playerId || activeSlot === targetSlot) return
    const next = { ...slotAssignments }
    if (targetPlayerId) next[activeSlot] = targetPlayerId
    else delete next[activeSlot]
    next[targetSlot] = playerId
    setSlotAssignments(next)
    setHomeXi(UNIVERSAL_TACTICAL_SLOTS.map((slot) => next[slot.slot] ?? '').filter(Boolean))
  }

  function handleLineupDragEnd(event: DragEndEvent) {
    const active = String(event.active.id)
    const target = String(event.over?.id ?? '')
    if (!target || active === target) return

    if (active.startsWith('player:') && target.startsWith('target:')) {
      moveStartingSlot(active.slice(7), target.slice(7))
      return
    }

    const source = active.match(/^roster:(substitute|squad):(.+)$/)
    const rosterTarget = target.match(/^roster:(substitute|squad):(.+)$/)
    const starterSource = active.match(/^player:(.+)$/)
    const starterTarget = target.match(/^target:(.+)$/)
    const nextAssignments = { ...slotAssignments }
    const nextBench = [...homeBench]

    if (starterSource && rosterTarget) {
      const outgoingId = nextAssignments[starterSource[1]]
      const incomingId = rosterTarget[2]
      if (!outgoingId) return
      nextAssignments[starterSource[1]] = incomingId
      if (rosterTarget[1] === 'substitute') {
        const index = nextBench.indexOf(incomingId)
        if (index >= 0) nextBench[index] = outgoingId
      }
    } else if (source && starterTarget) {
      const incomingId = source[2]
      const outgoingId = nextAssignments[starterTarget[1]]
      if (!outgoingId) return
      nextAssignments[starterTarget[1]] = incomingId
      if (source[1] === 'substitute') {
        const index = nextBench.indexOf(incomingId)
        if (index >= 0) nextBench[index] = outgoingId
      }
    } else if (source && rosterTarget && source[1] !== rosterTarget[1]) {
      const sourceId = source[2]
      const targetId = rosterTarget[2]
      if (source[1] === 'substitute') {
        const index = nextBench.indexOf(sourceId)
        if (index >= 0) nextBench[index] = targetId
      } else {
        const index = nextBench.indexOf(targetId)
        if (index >= 0) nextBench[index] = sourceId
      }
    } else return

    setSlotAssignments(nextAssignments)
    setHomeBench(nextBench)
    setHomeXi(UNIVERSAL_TACTICAL_SLOTS.map((slot) => nextAssignments[slot.slot] ?? '').filter(Boolean))
  }

  function handleLineupDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    const playerId = id.startsWith('player:')
      ? slotAssignments[id.slice(7)]
      : id.match(/^roster:(?:substitute|squad):(.+)$/)?.[1]
    if (playerId) setFocusedPlayerId(playerId)
  }

  const appearances: Appearance[] = useMemo(() => {
    const res: Appearance[] = []
    const source = Object.keys(startingSnapshot).length ? startingSnapshot : slotAssignments
    Object.entries(source).forEach(([slotId, id]) => {
          if (!id) return
          const slot = UNIVERSAL_TACTICAL_SLOTS.find((item) => item.slot === slotId)
          const p = players.find((x) => x.id === id)
          res.push({ playerId: id, teamId: selectedTeamId, position: p?.position ?? 'CM', matchPosition: slot?.matchPosition, role: 'starter' })
    })
    const initialBench = benchSnapshot.length ? benchSnapshot : homeBench
    initialBench.filter(Boolean).forEach((id) => {
      const p = players.find((x) => x.id === id)
      res.push({ playerId: id, teamId: selectedTeamId, position: p?.position ?? 'CM', role: 'bench' })
    })
    return res
  }, [selectedTeamId, homeBench, players, slotAssignments, startingSnapshot, benchSnapshot])

  useEffect(() => {
    if (step !== 1) return
    saveDraftMatch({ id: draftId, season, matchDay, date, formation: activeFormationName, homeAway, homeTeamId, awayTeamId, teamId: selectedTeamId, opponentName, duration: 90, appearances, events })
  }, [step, draftId, season, matchDay, date, activeFormationName, homeAway, homeTeamId, awayTeamId, selectedTeamId, opponentName, appearances, events, saveDraftMatch])

  function save() {
    const id = addMatch({ id: draftId,
      season, matchDay, date, formation: activeFormationName, homeAway, homeTeamId, awayTeamId, teamId: selectedTeamId, opponentName, duration: 90, appearances, events,
    })
    clearDraftMatch()
    onNavigate({ name: 'match', id })
  }

  return (
    <StarterPositionContext.Provider value={{ positions: starterPositionByPlayer, highlightPosition: focusedPlayer?.position }}>
    <div className="flex h-full flex-col bg-black text-white">
      <div className="px-4 pt-6">
        <button onClick={() => onNavigate(teamId ? { name: 'team', id: teamId } : { name: 'teams' })} className="mb-3 text-xs font-semibold text-emerald-400">← Cancel</button>
        <h1 className="text-2xl font-bold">Log Match</h1>
        <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {season} · MD {matchDay} · Step {step + 1} of 2
        </p>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-24">
        {step === 0 && (
          <DndContext sensors={lineupSensors} collisionDetection={closestCenter} onDragStart={handleLineupDragStart} onDragEnd={handleLineupDragEnd}>
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(['home', 'away'] as const).map((value) => <button key={value} type="button" onClick={() => setHomeAway(value)} className={`rounded-xl py-3 text-xs font-black uppercase ${homeAway === value ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}>{value}</button>)}
              </div>
              <label className="block text-[10px] font-bold uppercase text-zinc-500">Opponent code (3 characters)<input value={opponentName} maxLength={3} onChange={(event) => setOpponentName(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-black text-white" /></label>
              <div className="text-[10px] font-bold uppercase text-zinc-500">Formation<div className="mt-1 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-black text-white">{activeFormationName}</div><span className="mt-1 block text-[9px] normal-case text-zinc-500">Calculated from current tactical slots</span></div>
            </div>

            <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Starting XI</h2><Pitch slots={universalPitchSlots} players={draftPlayers} teams={teams} statsByPlayer={seasonStats} badgeMode="position" draggable externalDnd onSlotDrop={moveStartingSlot} onSlotClick={(slot) => { if (slot.playerId) { setFocusedPlayerId(slot.playerId); setActivePlayer({ group: 'starting', id: slot.playerId, slotId: slot.slot }) } }} /></section>
            <DragPlayerGroup title="Substitutes" group="substitute" players={homeBench.filter(Boolean).map((id) => draftPlayers.find((player) => player.id === id)).filter((player): player is NonNullable<typeof player> => Boolean(player))} statsByPlayer={seasonStats} onClick={(id) => { setFocusedPlayerId(id); setActivePlayer({ group: 'substitute', id }) }} />
            <DragPlayerGroup title="Squad" group="squad" players={squadPlayers} statsByPlayer={seasonStats} onClick={(id) => { setFocusedPlayerId(id); setActivePlayer({ group: 'squad', id }) }} />
            <button disabled={startingIds.length !== 11 || opponentName.length !== 3} onClick={() => { setStartingSnapshot({ ...slotAssignments }); setBenchSnapshot([...homeBench]); setStep(1) }} className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-black shadow-xl disabled:opacity-40">CONTINUE</button>
            {activePlayer && <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-4" onClick={() => setActivePlayer(null)}><div className="max-h-[75vh] w-full overflow-y-auto rounded-2xl bg-zinc-950 p-4" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-black uppercase">Change Player</h2><button type="button" onClick={() => setActivePlayer(null)} className="text-zinc-500">×</button></div>{activePlayer.group !== 'starting' && <PlayerGroup title="Starting XI" players={homeXi.filter(Boolean).map((id) => draftPlayers.find((player) => player.id === id)).filter((player): player is NonNullable<typeof player> => Boolean(player))} onClick={(id) => swapDraft('starting', id)} />}{activePlayer.group !== 'substitute' && <PlayerGroup title="Substitutes" players={homeBench.filter(Boolean).map((id) => draftPlayers.find((player) => player.id === id)).filter((player): player is NonNullable<typeof player> => Boolean(player))} onClick={(id) => swapDraft('substitute', id)} />}{activePlayer.group !== 'squad' && <PlayerGroup title="Squad" players={squadPlayers} onClick={(id) => swapDraft('squad', id)} />}<button type="button" onClick={() => setActivePlayer(null)} className="mt-4 w-full rounded-xl bg-zinc-900 py-3 text-xs font-bold">CANCEL</button></div></div>}
          </div>
          </DndContext>
        )}

        {step === 1 && <LiveMatchStep
          slots={liveSlots} players={draftPlayers} benchPlayers={liveBenchPlayers} stats={liveStats} events={events}
          liveEvent={liveEvent} liveMinute={liveMinute} liveScorerId={liveScorerId} liveAssistId={liveAssistId} liveGoalType={liveGoalType} liveCauseId={liveCauseId} livePicker={livePicker} liveSaveCount={liveSaveCount} liveSavePlayerId={liveSavePlayerId}
          onOpen={openLiveEvent} onSave={saveLiveEvent} onCancel={cancelLiveEvent} onMinute={setLiveMinute} onScorer={(id) => { setLiveScorerId(id); if (liveAssistId === id) setLiveAssistId(''); setLivePicker('assist') }} onAssist={setLiveAssistId} onGoalType={setLiveGoalType} onCause={setLiveCauseId} onPicker={setLivePicker} onSaveCount={setLiveSaveCount} onSavePlayer={setLiveSavePlayerId}
          validMinute={minuteIsValid} onPitchClick={(id) => { if (livePicker === 'scorer') { setLiveScorerId(id); if (liveAssistId === id) setLiveAssistId(''); setLivePicker('assist') } else if (livePicker === 'assist' && id !== liveScorerId) setLiveAssistId(id); else if (livePicker === 'cause') setLiveCauseId(id); else if (livePicker === 'save' && draftPlayers.find((player) => player.id === id)?.position === 'GK') setLiveSavePlayerId(id) }}
          onBack={() => setStep(0)} onFinish={save} selectedTeamId={selectedTeamId} onCommitSubstitutions={commitLiveSubstitutions} onEditEvent={editLiveEvent} onDeleteEvent={deleteLiveEvent} />}

        {step === 99 && (
          <div className="space-y-4">
             <div className="grid grid-cols-3 gap-2">
              {(['goal', 'save', 'sub'] as const).map((t) => (
                <button key={t} onClick={() => setEvType(t)} className={`rounded-xl py-3 text-xs font-bold capitalize ${evType === t ? 'bg-emerald-500 text-black' : 'bg-zinc-900'}`}>{t}</button>
              ))}
            </div>
            
            <div className="rounded-2xl bg-zinc-900 p-4 space-y-3">
              <div className="flex gap-2">
                <input type="number" value={minute} onChange={(e) => setMinute(Number(e.target.value))} className="w-16 rounded-xl bg-black px-3 py-2 text-sm" placeholder="Min" />
                <select value={eventTeamId} onChange={(e) => setEventTeamId(e.target.value)} className="flex-1 rounded-xl bg-black px-3 py-2 text-sm">
                  <option value={homeTeamId}>Home</option>
                  <option value={awayTeamId}>Away</option>
                </select>
              </div>

              {evType !== 'sub' && (
                <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="w-full rounded-xl bg-black px-3 py-2 text-sm">
                  <option value="">Select Player</option>
                  {eventSquad.map((p) => <option key={p.id} value={p.id}>#{p.number} {playerDisplayName(p)}</option>)}
                </select>
              )}

              {evType === 'goal' && (
                <div className="space-y-2">
                  <select value={goalType} onChange={(e) => setGoalType(e.target.value as 'normal' | 'wonder' | 'assist-led')} className="w-full rounded-xl bg-black px-3 py-2 text-sm">
                    <option value="normal">Normal Goal</option>
                    <option value="wonder">Wonder Goal</option>
                    <option value="assist-led">Assist-led Goal</option>
                  </select>
                  <select value={assistId} onChange={(e) => setAssistId(e.target.value)} className="w-full rounded-xl bg-black px-3 py-2 text-sm">
                    <option value="">Assist (None)</option>
                    {eventSquad.map((p) => <option key={p.id} value={p.id}>{playerDisplayName(p)}</option>)}
                  </select>
                  <select value={concededGoalCausePlayerId} onChange={(e) => setConcededGoalCausePlayerId(e.target.value)} className="w-full rounded-xl bg-black px-3 py-2 text-sm">
                    <option value="">Conceded Goal Cause (None)</option>
                    {players.filter((p) => p.teamId !== eventTeamId).map((p) => <option key={p.id} value={p.id}>{playerDisplayName(p)}</option>)}
                  </select>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase"><input type="checkbox" checked={ownGoal} onChange={(e) => setOwnGoal(e.target.checked)} /> Own Goal</label>
                  </div>
                </div>
              )}

              {evType === 'sub' && (
                <div className="space-y-2">
                  <select value={subPos} onChange={(e) => setSubPos(e.target.value as Position)} className="w-full rounded-xl bg-black px-3 py-2 text-sm">
                    {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos} position</option>)}
                  </select>
                  <select value={playerOutId} onChange={(e) => setPlayerOutId(e.target.value)} className="w-full rounded-xl bg-black px-3 py-2 text-sm">
                    <option value="">Player Out</option>
                    {eventSquad.map((p) => <option key={p.id} value={p.id}>{playerDisplayName(p)}</option>)}
                  </select>
                  <select value={playerInId} onChange={(e) => setPlayerInId(e.target.value)} className="w-full rounded-xl bg-black px-3 py-2 text-sm">
                    <option value="">Player In</option>
                    {eventSquad.map((p) => <option key={p.id} value={p.id}>{playerDisplayName(p)}</option>)}
                  </select>
                </div>
              )}

              <button onClick={() => {
                const id = crypto.randomUUID()
                if (evType === 'goal' && playerId) setEvents([...events, { id, type: 'goal', minute, teamId: eventTeamId, playerId, assistPlayerId: assistId || undefined, goalType, concededGoalCausePlayerId: concededGoalCausePlayerId || undefined, ownGoal: ownGoal || undefined }])
                else if (evType === 'save' && playerId) setEvents([...events, { id, type: 'save', minute, teamId: eventTeamId, playerId }])
                else if (evType === 'sub' && playerOutId && playerInId) setEvents([...events, { id, type: 'sub', minute, teamId: eventTeamId, playerOutId, playerInId, position: subPos }])
              }} className="w-full rounded-xl bg-zinc-800 py-2 text-xs font-bold uppercase">Add Event</button>
            </div>

            <div className="space-y-1.5">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2 text-[11px]">
                  <span>{e.minute}' {e.type.toUpperCase()} · {playerDisplayName(players.find(p => p.id === (e.type === 'sub' ? e.playerInId : e.playerId)))}</span>
                  <button onClick={() => setEvents(events.filter(x => x.id !== e.id))} className="text-zinc-500">✕</button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(0)} className="flex-1 rounded-2xl bg-zinc-900 py-4 text-sm font-black">BACK</button>
              <button onClick={save} className="flex-2 rounded-2xl bg-emerald-500 py-4 text-sm font-black text-black shadow-xl">FINISH & SAVE</button>
            </div>
          </div>
        )}
      </div>
    </div>
    </StarterPositionContext.Provider>
  )
}

function LiveMatchStep(props: {
  slots: Best11Slot[]; players: Player[]; benchPlayers: Player[]; stats: Record<string, { goals: number; assists: number }>; events: MatchEvent[]; selectedTeamId: string
  liveEvent: 'goal' | 'conceded' | 'substitution' | 'save' | null; liveMinute: number; liveScorerId: string; liveAssistId: string; liveGoalType: 'normal' | 'wonder' | 'assist-led'; liveCauseId: string; livePicker: 'scorer' | 'assist' | 'cause' | 'save'; liveSaveCount: number; liveSavePlayerId: string; validMinute: boolean
  onOpen: (type: 'goal' | 'conceded' | 'substitution' | 'save') => void; onSave: () => void; onCancel: () => void; onMinute: (value: number) => void; onScorer: (id: string) => void; onAssist: (id: string) => void; onGoalType: (type: 'normal' | 'wonder' | 'assist-led') => void; onCause: (id: string) => void; onPicker: (picker: 'scorer' | 'assist' | 'cause' | 'save') => void; onSaveCount: (count: number) => void; onSavePlayer: (id: string) => void; onPitchClick: (id: string) => void; onBack: () => void; onFinish: () => void; onCommitSubstitutions: (assignments: Record<string, string>, bench: string[], minute: number) => boolean; onEditEvent: (event: MatchEvent) => void; onDeleteEvent: (event: MatchEvent) => void
}) {
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string> | null>(null)
  const [draftBench, setDraftBench] = useState<string[] | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [selectedBenchId, setSelectedBenchId] = useState<string | null>(null)
  const eventName = props.liveEvent === 'conceded' ? 'Conceded Goal' : props.liveEvent === 'save' ? 'Save' : 'Goal'
  const playerName = (id: string) => playerDisplayName(props.players.find((player) => player.id === id))
  const activeSlots = draftAssignments ? props.slots.map((slot) => ({ ...slot, playerId: draftAssignments[slot.slot] ?? null })) : props.slots
  const activeBench = draftBench ? draftBench.map((id) => props.players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player)) : props.benchPlayers
  const open = (type: 'goal' | 'conceded' | 'substitution' | 'save') => { props.onOpen(type); if (type === 'substitution') { setDraftAssignments(Object.fromEntries(props.slots.map((slot) => [slot.slot, slot.playerId ?? '']))); setDraftBench(props.benchPlayers.map((player) => player.id)) } }
  const handleSubDragEnd = (event: DragEndEvent) => {
    if (!draftAssignments || !draftBench) return
    const fromBench = String(event.active.id).match(/^roster:substitute:(.+)$/)
    const toBench = String(event.over?.id ?? '').match(/^roster:substitute:(.+)$/)
    const fromSlot = String(event.active.id).match(/^player:(.+)$/)
    const toSlot = String(event.over?.id ?? '').match(/^target:(.+)$/)
    const nextAssignments = { ...draftAssignments }; const nextBench = [...draftBench]
    if (fromBench && toSlot) { const out = nextAssignments[toSlot[1]]; nextAssignments[toSlot[1]] = fromBench[1]; const index = nextBench.indexOf(fromBench[1]); if (index >= 0) { if (out) nextBench[index] = out; else nextBench.splice(index, 1) } }
    else if (fromSlot && toBench) { const out = nextAssignments[fromSlot[1]]; if (!out) return; nextAssignments[fromSlot[1]] = toBench[1]; const index = nextBench.indexOf(toBench[1]); if (index >= 0) nextBench[index] = out }
    else return
    setDraftAssignments(nextAssignments); setDraftBench(nextBench)
  }
  const selectSwap = (slotId?: string, benchId?: string) => {
    if (!draftAssignments || !draftBench) return
    
    // If we have a selection already, check if we're completing a swap
    if (selectedSlot && benchId) {
      // Slot -> Bench (Slot was clicked, now clicking bench)
      const playerId = draftAssignments[selectedSlot]
      if (playerId) {
        // Swap or Move? Existing logic expects a specific swap flow
      }
    }
    
    // Fallback to original logic but ensure it uses the state
    const nextSlot = slotId ?? selectedSlot
    const nextBench = benchId ?? selectedBenchId
    
    if (!nextSlot && !nextBench) {
      if (slotId) setSelectedSlot(slotId)
      if (benchId) setSelectedBenchId(benchId)
      return
    }

    // Toggle/Swap logic
    if (nextSlot && nextBench) {
        // perform swap
        const outgoing = draftAssignments[nextSlot]
        const index = draftBench.indexOf(nextBench)
        
        setDraftAssignments({ ...draftAssignments, [nextSlot]: nextBench })
        const updatedBench = [...draftBench];
        if (outgoing) updatedBench[index] = outgoing;
        else updatedBench.splice(index, 1);
        setDraftBench(updatedBench)
        
        setSelectedSlot(null)
        setSelectedBenchId(null)
    } else {
        // Just selecting
        if (slotId) setSelectedSlot(slotId)
        if (benchId) setSelectedBenchId(benchId)
    }
  }
  return <DndContext collisionDetection={closestCenter} onDragEnd={handleSubDragEnd}><div className="space-y-5">
    <div className="grid grid-cols-4 gap-2">{([['goal', 'GOAL'], ['conceded', 'CONCEDED'], ['substitution', 'SUBSTITUTION'], ['save', 'SAVE']] as const).map(([type, label]) => <button key={type} type="button" onClick={() => open(type)} className={`rounded-xl py-3 text-[10px] font-black ${props.liveEvent === type ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-white'}`}>{label}</button>)}</div>
    <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Starting XI</h2><Pitch slots={activeSlots} players={props.players} statsByPlayer={props.stats} badgeMode="position" draggable={props.liveEvent === 'substitution'} externalDnd onSlotClick={(slot) => { if (props.liveEvent === 'substitution') selectSwap(slot.slot); else if (slot.playerId) props.onPitchClick(slot.playerId) }} /></section>
    {props.liveEvent === 'substitution' && <DragPlayerGroup title="Substitutes" group="substitute" players={activeBench} statsByPlayer={props.stats} onClick={(id) => selectSwap(undefined, id)} />}
    {props.liveEvent && props.liveEvent !== 'substitution' && <div className="space-y-3 rounded-2xl bg-zinc-900 p-4">{props.liveEvent !== 'save' && <div className="flex items-center gap-2"><label className="text-[10px] font-black uppercase text-zinc-500">{eventName} Time</label><input type="number" min="0" max="90" value={props.liveMinute} onChange={(event) => props.onMinute(Number(event.target.value))} className="ml-auto w-16 rounded-xl bg-black px-3 py-2 text-sm" /></div>}
      {props.liveEvent === 'goal' && <><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => props.onPicker('scorer')} className={`rounded-xl p-2 text-[10px] font-bold ${props.livePicker === 'scorer' ? 'bg-emerald-500 text-black' : 'bg-black'}`}>Scorer: {props.liveScorerId ? playerName(props.liveScorerId) : 'No scorer / Opponent own goal'}</button><button type="button" onClick={() => props.onPicker('assist')} className={`rounded-xl p-2 text-[10px] font-bold ${props.livePicker === 'assist' ? 'bg-emerald-500 text-black' : 'bg-black'}`}>Assist: {props.liveAssistId ? playerName(props.liveAssistId) : 'No assist'}</button></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => props.onScorer('')} className="rounded-xl bg-black p-2 text-[10px] font-bold">NO SCORER</button><button type="button" onClick={() => props.onAssist('')} className="rounded-xl bg-black p-2 text-[10px] font-bold">NO ASSIST</button></div><select value={props.liveGoalType} onChange={(event) => props.onGoalType(event.target.value as 'normal' | 'wonder' | 'assist-led')} className="w-full rounded-xl bg-black px-3 py-2 text-sm"><option value="normal">Normal Goal</option><option value="wonder">Wonder Goal</option><option value="assist-led">Assist-led Goal</option></select></>}
      {props.liveEvent === 'conceded' && <><button type="button" onClick={() => props.onPicker('cause')} className={`w-full rounded-xl p-2 text-left text-[10px] font-bold ${props.livePicker === 'cause' ? 'bg-emerald-500 text-black' : 'bg-black'}`}>Conceded Goal Cause: {props.liveCauseId ? playerName(props.liveCauseId) : 'No cause'}</button><button type="button" onClick={() => props.onCause('')} className="w-full rounded-xl bg-black p-2 text-[10px] font-bold">NO CAUSE</button></>}
      {props.liveEvent === 'save' && <><button type="button" onClick={() => props.onPicker('save')} className={`w-full rounded-xl p-2 text-left text-[10px] font-bold ${props.livePicker === 'save' ? 'bg-emerald-500 text-black' : 'bg-black'}`}>Goalkeeper: {props.liveSavePlayerId ? playerName(props.liveSavePlayerId) : 'Select goalkeeper on pitch'}</button><label className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500">Saves <input type="number" min="1" step="1" value={props.liveSaveCount} onChange={(event) => props.onSaveCount(Number(event.target.value))} className="ml-auto w-16 rounded-xl bg-black px-3 py-2 text-sm text-white" /></label></>}
      <div className="flex gap-2"><button type="button" onClick={props.onCancel} className="flex-1 rounded-xl bg-black py-3 text-xs font-black">CANCEL</button><button type="button" disabled={props.liveEvent !== 'save' && !props.validMinute} onClick={props.onSave} className="flex-1 rounded-xl bg-emerald-500 py-3 text-xs font-black text-black disabled:opacity-40">SAVE {eventName.toUpperCase()}</button></div></div>}
    {props.liveEvent === 'substitution' && draftAssignments && draftBench && <div className="space-y-3 rounded-2xl bg-zinc-900 p-4"><label className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500">Substitution Time <input type="number" min="0" max="90" value={props.liveMinute} onChange={(event) => props.onMinute(Number(event.target.value))} className="ml-auto w-16 rounded-xl bg-black px-3 py-2 text-sm text-white" /></label><p className="text-[10px] text-zinc-400">Click a starter and a substitute in either order to swap. Make all swaps before confirming.</p><button type="button" disabled={!props.validMinute} onClick={() => { if (props.onCommitSubstitutions(draftAssignments, draftBench, props.liveMinute)) { setDraftAssignments(null); setDraftBench(null); setSelectedSlot(null); setSelectedBenchId(null) } }} className="w-full rounded-xl bg-emerald-500 py-3 text-xs font-black text-black disabled:opacity-40">CONFIRM SUBSTITUTIONS</button></div>}
    <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Event History</h2><div className="space-y-1.5">{props.events.slice().sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)).map((event) => <div key={event.id} className="rounded-xl bg-zinc-900 px-3 py-2 text-[11px]">{event.type !== 'save' && `${event.minute}' `}{event.type === 'goal' ? event.teamId === props.selectedTeamId ? `Goal${event.playerId ? `: ${playerName(event.playerId)}` : ' · Opponent own goal'}${event.assistPlayerId ? ` · Assist: ${playerName(event.assistPlayerId)}` : ''}` : `Conceded${event.concededGoalCausePlayerId ? ` · Cause: ${playerName(event.concededGoalCausePlayerId)}` : ''}` : event.type === 'sub' ? `Substitution: ${playerName(event.playerOutId)} → ${playerName(event.playerInId)}` : `Save: ${playerName(event.playerId)} × ${event.count ?? 1}`}</div>)}</div></section>
    {props.events.length > 0 && <div className="flex flex-wrap justify-end gap-2">{props.events.map((event) => <span key={`actions-${event.id}`} className="flex items-center gap-1 rounded-lg bg-black/40 px-2 py-1 text-[9px]"><button type="button" onClick={() => props.onEditEvent(event)} className="text-emerald-400">EDIT {event.minute ?? 'SAVE'}</button><button type="button" onClick={() => props.onDeleteEvent(event)} className="text-red-400">DELETE</button></span>)}</div>}
    <div className="flex gap-2"><button type="button" onClick={props.onBack} className="flex-1 rounded-2xl bg-zinc-900 py-4 text-sm font-black">BACK</button><button type="button" onClick={props.onFinish} className="flex-2 rounded-2xl bg-emerald-500 py-4 text-sm font-black text-black shadow-xl">FINISH & SAVE</button></div>
  </div></DndContext>
}

function DragPlayerGroup({ title, group, players, onClick, statsByPlayer }: { title: string; group: 'substitute' | 'squad'; players: { id: string; name: string; displayName?: string; number: number; position: Position; image?: string }[]; onClick: (id: string) => void; statsByPlayer?: Record<string, { goals: number; assists: number }> }) {
  return <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">{title}</h2><div className="grid grid-cols-4 gap-2">{players.map((player) => <DraggableRosterPlayer key={player.id} player={player} group={group} onClick={onClick} stats={statsByPlayer?.[player.id]} />)}</div></section>
}

function DraggableRosterPlayer({ player, group, onClick, stats }: { player: { id: string; name: string; displayName?: string; number: number; position: Position; image?: string }; group: 'substitute' | 'squad'; onClick: (id: string) => void; stats?: { goals: number; assists: number } }) {
  const drag = useDraggable({ id: `roster:${group}:${player.id}` })
  const drop = useDroppable({ id: `roster:${group}:${player.id}` })
  return <button ref={drop.setNodeRef} type="button" onClick={() => onClick(player.id)} className={`flex min-w-0 flex-col items-center rounded-lg bg-zinc-900 p-1 text-center ${drop.isOver ? 'ring-2 ring-white/80' : ''}`}><span ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="relative flex h-8 w-8 items-center justify-center overflow-visible rounded-full border border-white/50 bg-zinc-800 text-[10px] font-black" style={{ opacity: drag.isDragging ? 0.45 : 1, touchAction: 'none' }}><span className="absolute inset-0 overflow-hidden rounded-full">{player.image && <img src={player.image} alt="" className="h-full w-full object-cover" />}</span><span className="relative z-10 drop-shadow">{player.number}</span><span className="absolute -left-1 -top-1 rounded bg-zinc-800 px-0.5 text-[6px] font-black text-zinc-300">{player.position}</span></span><span className="w-full truncate text-[8px] font-semibold">{player.displayName ?? player.name}</span>{stats && <StatIcons goals={stats.goals} assists={stats.assists} className="text-[7px] text-zinc-400" />}</button>
}

function PlayerGroup({ title, players, onClick }: { title: string; players: { id: string; name: string; number: number; position: Position; image?: string }[]; onClick: (id: string) => void }) {
  return <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">{title}</h2><div className="grid grid-cols-4 gap-2">{players.map((player) => <button key={player.id} type="button" onClick={() => onClick(player.id)} className="flex min-w-0 flex-col items-center rounded-lg bg-zinc-900 p-1 text-center"><span className="relative flex h-8 w-8 items-center justify-center overflow-visible rounded-full border border-white/50 bg-zinc-800 text-[10px] font-black"><span className="absolute inset-0 overflow-hidden rounded-full">{player.image && <img src={player.image} alt="" className="h-full w-full object-cover" />}</span><span className="relative z-10 drop-shadow">{player.number ?? '—'}</span><span className="absolute -left-1 -top-1 rounded bg-zinc-800 px-0.5 text-[6px] font-black text-zinc-300">{player.position}</span></span><span className="w-full truncate text-[8px] font-semibold">{player.name}</span></button>)}</div></section>
}
