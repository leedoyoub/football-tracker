import { createContext, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, TouchSensor, closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type CollisionDetection } from '@dnd-kit/core'
import { FORMATION_SLOTS, Pitch, UNIVERSAL_TACTICAL_SLOTS, type TacticalSlot } from '../components/Pitch'
import { calculateFormation } from '../engine/formation'
import { playerSeasonStats } from '../engine/stats'
import { pitchWindow } from '../engine/rating'
import { canConfirmSubstitution, lineupTarget, moveLineup, moveSubstitution, type LineupTarget, type SubstitutionDraft } from './matchLineup'
import { getNextMatchDayForTeam } from '../engine/match'
import type { Appearance, Best11Slot, Match, MatchEvent, Player, Position, PositionChange, Team, View } from '../types'
import { useStore } from '../store'
import { playerDisplayName, GoalIcon, AssistIcon, StatIcons, SubstitutePlayerCard, SubstitutionSelection } from '../components/ui'
import { PlayerAvatar } from '../components/PlayerAvatar'

import { rebuildLiveHistory } from './liveHistory'

type FormationSlotConfig = TacticalSlot
type MatchDraftState = { slotAssignments: Record<string, string>; homeBench: string[]; events: MatchEvent[]; positionHistories: Record<string, PositionChange[]> }

function restoreDraft(match: Match | undefined, players: Player[]): { draft: MatchDraftState; starters: Record<string, string>; bench: string[] } | null {
  if (!match || !Array.isArray(match.appearances) || !Array.isArray(match.events)) return null
  try {
    const playerIds = new Set(players.map(player => player.id))
    const starters: Record<string, string> = {}
    for (const appearance of match.appearances.filter(item => item.role === 'starter' && playerIds.has(item.playerId))) {
      const slot = UNIVERSAL_TACTICAL_SLOTS.find(item => item.matchPosition === appearance.matchPosition && !starters[item.slot])
        ?? UNIVERSAL_TACTICAL_SLOTS.find(item => item.matchPosition === appearance.position && !starters[item.slot])
      if (slot) starters[slot.slot] = appearance.playerId
    }
    if (!Object.keys(starters).length) return null
    const bench = [...new Set(match.appearances.filter(item => item.role === 'bench' && playerIds.has(item.playerId) && !Object.values(starters).includes(item.playerId)).map(item => item.playerId))]
    const histories = Object.fromEntries(match.appearances.filter(item => item.positionHistory?.length).map(item => [item.playerId, item.positionHistory!])) as Record<string, PositionChange[]>
    const positions = Object.fromEntries(UNIVERSAL_TACTICAL_SLOTS.map(slot => [slot.slot, slot.matchPosition]))
    const roster = [...new Set([...Object.values(starters), ...bench])]
    const draft = match.events.length ? rebuildLiveHistory(starters, roster, match.events, histories, positions) : { slotAssignments: starters, homeBench: bench, events: match.events, positionHistories: histories }
    return { draft, starters, bench }
  } catch {
    // A malformed old draft is ignored; it must never prevent the editor starting.
    return null
  }
}

const lineupCollision: CollisionDetection = args => {
  return args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)
}

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
  const { teams, players, matches, draftMatch, addMatch, saveDraftMatch, clearDraftMatch } = useStore()
  const selectedTeamId = teamId ?? draftMatch?.teamId ?? draftMatch?.homeTeamId ?? teams[0]?.id ?? ''
  const restored = useMemo(() => draftMatch && (draftMatch.teamId ?? draftMatch.homeTeamId) === selectedTeamId ? restoreDraft(draftMatch, players) : null, [draftMatch, players, selectedTeamId])
  const [draftId] = useState(() => restored ? draftMatch!.id : crypto.randomUUID())
  const savingRef = useRef(false)
  const nextMatch = useMemo(() => getNextMatchDayForTeam(selectedTeamId, matches), [selectedTeamId, matches])
  const season = restored ? draftMatch!.season : nextMatch.season
  const matchDay = restored ? draftMatch!.matchDay : nextMatch.matchDay
  const date = restored ? draftMatch!.date : new Date().toISOString().split('T')[0]
  
  const [step, setStep] = useState(() => restored?.draft.events.length ? 1 : 0) // 0: Lineups, 1: Events
  
  // 통합된 matchDraft 상태
  const [matchDraft, setMatchDraft] = useState<MatchDraftState>(() => restored?.draft ?? {
      slotAssignments: {} as Record<string, string>,
      homeBench: [] as string[],
      events: [] as MatchEvent[],
      positionHistories: {} as Record<string, PositionChange[]>,
  })
  
  const opponentId = `opponent:${draftId}`
  const homeTeamId = selectedTeamId
  const awayTeamId = opponentId
  
  // 기타 Live Events 관련 상태들 (matchDraft 외부 유지)
  const [liveEvent, setLiveEvent] = useState<'goal' | 'conceded' | 'substitution' | null>(null)
  const [minuteInput, setMinuteInput] = useState('')
  const liveMinute = minuteInput === '' ? NaN : Number(minuteInput)
  const [assistChosen, setAssistChosen] = useState(false)
  const [liveScorerId, setLiveScorerId] = useState('')
  const [liveAssistId, setLiveAssistId] = useState('')
  const [liveCauseId, setLiveCauseId] = useState('')
  const [livePicker, setLivePicker] = useState<'scorer' | 'assist' | 'cause' | 'minute'>('scorer')
  const totalSavesEventId = useRef<string | null>(matchDraft.events.find(event => event.type === 'save')?.id ?? null)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [substitutionDraft, setSubstitutionDraft] = useState<SubstitutionDraft | null>(null)
  const [subSelection, setSubSelection] = useState<LineupTarget | null>(null)
  const [substitutionError, setSubstitutionError] = useState('')
  const pendingMoves = useRef<{ source: LineupTarget; target: LineupTarget }[]>([])
  const pendingBase = useRef<SubstitutionDraft | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [subEdit, setSubEdit] = useState<Extract<MatchEvent, { type: 'sub' }> | null>(null)
  const [subEditMinute, setSubEditMinute] = useState('')
  const suppressDragClick = useRef(false)
  const [activePlayer, setActivePlayer] = useState<{ group: 'starting' | 'substitute' | 'squad'; id: string; slotId?: string } | null>(null)
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null)
  const [startingSnapshot, setStartingSnapshot] = useState<Record<string, string>>(() => restored?.starters ?? {})
  const [startingBenchSnapshot, setStartingBenchSnapshot] = useState<string[]>(() => restored?.bench ?? [])
  const initializedTeam = useRef<string | null>(restored ? selectedTeamId : null)
  const [draftReady, setDraftReady] = useState(Boolean(restored))
  const lineupLocked = matchDraft.events.length > 0
  
  const lineupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  )
  
  function handleLineupDragStart(event: DragStartEvent) {
    suppressDragClick.current = true
    const id = String(event.active.id)
    const playerId = id.startsWith('player:')
      ? matchDraft.slotAssignments[id.slice(7)]
      : id.match(/^roster:(?:substitute|squad):(.+)$/)?.[1]
    if (playerId) setFocusedPlayerId(playerId)
  }

  const universalPitchSlots = UNIVERSAL_TACTICAL_SLOTS.map((slot) => ({ ...slot, playerId: matchDraft.slotAssignments[slot.slot] ?? null, teamId: selectedTeamId, avgRating: 0, matches: 0 }))
  const activeFormationName = calculateFormation(
    UNIVERSAL_TACTICAL_SLOTS.filter((slot) => Boolean(matchDraft.slotAssignments[slot.slot])).map((slot) => slot.matchPosition),
  )
  const startingIds = UNIVERSAL_TACTICAL_SLOTS.map((slot) => matchDraft.slotAssignments[slot.slot]).filter(Boolean)
  const focusedPlayer = focusedPlayerId ? players.find((player) => player.id === focusedPlayerId) : undefined
  const starterPositionByPlayer = Object.fromEntries(UNIVERSAL_TACTICAL_SLOTS.flatMap((slot) => {
    const id = matchDraft.slotAssignments[slot.slot]
    return id ? [[id, slot.matchPosition]] : []
  })) as Record<string, Position>

  useEffect(() => {
    if (initializedTeam.current === selectedTeamId || !players.length) return
    initializedTeam.current = selectedTeamId
    const squad = players.filter((p) => (p.teamIds ?? [p.teamId]).includes(selectedTeamId))
    const initial = fillFormationSlots(squad, FORMATION_SLOTS['4-3-3'])
    const slotAssignments = Object.fromEntries(FORMATION_SLOTS['4-3-3'].map((slot, index) => [slot.slot, initial[index]]).filter((entry) => Boolean(entry[1])))
    const starterIds = new Set(initial.filter(Boolean))
    const b = squad.filter((player) => !starterIds.has(player.id)).slice(0, 12).map((player) => player.id)
    setMatchDraft(prev => ({ ...prev, slotAssignments, homeBench: b }))
    setDraftReady(true)
  }, [selectedTeamId, players])

  const homeSquad = players.filter((p) => (p.teamIds ?? [p.teamId]).includes(selectedTeamId))
  const draftPlayers = homeSquad
  const usedIds = new Set([...startingIds, ...matchDraft.homeBench.filter(Boolean)])
  const squadPlayers = draftPlayers.filter((player) => !usedIds.has(player.id))
  const seasonStats = Object.fromEntries(draftPlayers.map((player) => {
    const stats = playerSeasonStats(player, players, matches, season)
    return [player.id, { goals: stats.goals, assists: stats.assists }]
  }))
  const activeDraft = substitutionDraft ?? matchDraft
  // Visual feedback comes only from the current selection and unconfirmed draft.
  const substitutionSelection: Record<string, 'in' | 'out'> = {}
  const pendingSubs = substitutionDraft?.events.filter((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub' && !matchDraft.events.some(saved => saved.id === event.id)) ?? []
  if (liveEvent === 'substitution' && substitutionDraft) {
    for (const event of pendingSubs) {
      substitutionSelection[event.playerOutId] = 'out'
      substitutionSelection[event.playerInId] = 'in'
    }
    const before = Object.values(substitutionDraft.checkpoint.slotAssignments)
    const after = Object.values(substitutionDraft.slotAssignments)
    for (const id of before) if (id && !after.includes(id)) substitutionSelection[id] = 'out'
    for (const id of after) if (id && !before.includes(id)) substitutionSelection[id] = 'in'
    if (subSelection) {
      const id = subSelection.group === 'starting' ? activeDraft.slotAssignments[subSelection.id] : subSelection.id
      if (id) substitutionSelection[id] = subSelection.group === 'starting' ? 'out' : 'in'
    }
  }
  const liveSlots = UNIVERSAL_TACTICAL_SLOTS
    .map((slot) => ({ ...slot, playerId: activeDraft.slotAssignments[slot.slot] ?? null, teamId: selectedTeamId, avgRating: 0, matches: 0 }))
  const liveStats = Object.fromEntries(draftPlayers.map((player) => {
    const committed = editingEventId ? matchDraft.events.filter((e) => e.id !== editingEventId) : matchDraft.events
    return [player.id, {
      goals: committed.filter((e) => e.type === 'goal' && e.playerId === player.id).length + (liveEvent === 'goal' && liveScorerId === player.id ? 1 : 0),
      assists: committed.filter((e) => e.type === 'goal' && e.assistPlayerId === player.id).length + (liveEvent === 'goal' && liveAssistId === player.id ? 1 : 0),
    }]
  }))
  const liveBenchPlayers = activeDraft.homeBench.filter(Boolean).map((id) => draftPlayers.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const minuteIsValid = /^\d{1,2}$/.test(minuteInput) && liveMinute >= 0 && liveMinute <= (liveEvent === 'substitution' ? 89 : 90)

  function openLiveEvent(type: NonNullable<typeof liveEvent>) {
    pendingMoves.current = []; pendingBase.current = null
    setHistoryError('')
    setEditingEventId(null)
    setLiveEvent(type)
    setMinuteInput('')
    setAssistChosen(false)
    setSubSelection(null)
    setSubstitutionError('')
    setSubstitutionDraft(null)
    setLiveScorerId('')
    setLiveAssistId('')
    setLiveCauseId('')
    setLivePicker(type === 'conceded' ? 'minute' : 'scorer')
    if (type === 'substitution') {
      setSubstitutionDraft({ slotAssignments: { ...matchDraft.slotAssignments }, homeBench: [...matchDraft.homeBench], events: [...matchDraft.events], positionHistories: { ...matchDraft.positionHistories }, checkpoint: { slotAssignments: matchDraft.slotAssignments, homeBench: matchDraft.homeBench } })
    }
  }

  function saveLiveEvent() {
    if (!liveEvent || !minuteIsValid) return
    const id = crypto.randomUUID()
    const writeEvent = (event: MatchEvent) => setMatchDraft(prev => ({ ...prev, events: editingEventId ? prev.events.map((e) => e.id === editingEventId ? event : e) : [...prev.events, event] }))
    if (liveEvent === 'goal') {
      if (!liveScorerId || !assistChosen || !eligibleGoalIds.includes(liveScorerId) || (liveAssistId && (!eligibleGoalIds.includes(liveAssistId) || liveScorerId === liveAssistId))) return
      writeEvent({ id: editingEventId ?? id, type: 'goal', minute: liveMinute, teamId: selectedTeamId, playerId: liveScorerId || undefined, assistPlayerId: liveScorerId ? liveAssistId || undefined : undefined, goalType: 'normal' })
    } else if (liveEvent === 'conceded') {
      if (liveCauseId && !eligibleGoalIds.includes(liveCauseId)) return
      writeEvent({ id: editingEventId ?? id, type: 'goal', minute: liveMinute, teamId: opponentId, playerId: undefined, concededGoalCausePlayerId: liveCauseId || undefined })
    } else if (substitutionDraft) {
      if (substitutionError || !canConfirmSubstitution(substitutionDraft, matchDraft)) return
      setMatchDraft(prev => ({ ...prev, slotAssignments: substitutionDraft.slotAssignments, homeBench: substitutionDraft.homeBench, events: substitutionDraft.events, positionHistories: substitutionDraft.positionHistories }))
    }
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setMinuteInput(''); setLiveScorerId(''); setLiveAssistId(''); setLiveCauseId(''); setAssistChosen(false)
    setLiveEvent(null)
    setEditingEventId(null)
    setSubstitutionDraft(null)
    setSubSelection(null)
    setSubstitutionError('')
  }

  function cancelLiveEvent() {
    setSubstitutionDraft(null)
    setSubSelection(null)
    setSubstitutionError('')
    setLiveEvent(null)
    setEditingEventId(null)
    setLiveScorerId('')
    setLiveAssistId('')
    setLiveCauseId('')
  }

  function editLiveEvent(event: MatchEvent) {
    if (event.type === 'sub') { setSubEdit(event); setSubEditMinute(String(event.minute)); setHistoryError(''); return }
    cancelLiveEvent()
    setEditingEventId(event.id)
    if (event.type === 'save') return
    setMinuteInput(String(event.minute))
    if (event.teamId === selectedTeamId) {
      setLiveEvent('goal'); setLiveScorerId(event.playerId ?? ''); setLiveAssistId(event.assistPlayerId ?? ''); setAssistChosen(true); setLivePicker('minute')
    } else {
      setLiveEvent('conceded'); setLiveCauseId(event.concededGoalCausePlayerId ?? ''); setLivePicker('minute')
    }
  }

  function correctEvents(events: MatchEvent[], histories = matchDraft.positionHistories) {
    try {
      const roster = [...new Set([...Object.values(startingSnapshot), ...Object.values(matchDraft.slotAssignments), ...matchDraft.homeBench])].filter(Boolean)
      setMatchDraft(rebuildLiveHistory(startingSnapshot, roster, events, histories, slotPositions))
      setHistoryError('')
      return true
    } catch (error) { setHistoryError((error as Error).message); return false }
  }
  function deleteLiveEvent(event: MatchEvent) {
    if (liveEvent) return
    if (event.type === 'sub') correctEvents(matchDraft.events.filter(e => e.id !== event.id))
    else setMatchDraft(prev => ({ ...prev, events: prev.events.filter(e => e.id !== event.id) }))
  }
  function saveSubEdit() {
    if (!subEdit || !/^\d{1,2}$/.test(subEditMinute) || Number(subEditMinute) >= 90) return
    const original = matchDraft.events.find(e => e.id === subEdit.id)!
    const minute = Number(subEditMinute)
    const histories = Object.fromEntries(Object.entries(matchDraft.positionHistories).map(([id, changes]) => [id, changes.map(c => c.minute === original.minute && !matchDraft.events.some(e => e.type === 'sub' && e.id !== original.id && e.minute === original.minute) ? { ...c, minute } : c)]))
    if (correctEvents(matchDraft.events.map(e => e.id === subEdit.id ? { ...subEdit, minute } : e), histories)) setSubEdit(null)
  }

  const slotPositions = Object.fromEntries(UNIVERSAL_TACTICAL_SLOTS.map(slot => [slot.slot, slot.matchPosition]))

  function applyLiveMove(source: LineupTarget, target: LineupTarget) {
    if (!substitutionDraft) return
    if (minuteInput === '' || pendingMoves.current.length) {
      const preview = moveLineup(substitutionDraft, source, target)
      if (preview === substitutionDraft) return
      if (!pendingBase.current) pendingBase.current = substitutionDraft
      pendingMoves.current.push({ source, target })
      setSubstitutionDraft({ ...substitutionDraft, ...preview })
      setSubSelection(null)
      if (minuteInput !== '') replayPendingMoves(liveMinute)
      return
    }
    const next = moveSubstitution(substitutionDraft, source, target, startingSnapshot, slotPositions, liveMinute, selectedTeamId, () => crypto.randomUUID())
    if (next === substitutionDraft) {
      setSubstitutionError('Invalid substitution or time.')
      setSubSelection(null)
      return
    }
    setSubstitutionDraft(next)
    setSubSelection(null)
    setSubstitutionError('')
  }

  function replayPendingMoves(minute: number) {
    if (!pendingBase.current || !Number.isInteger(minute) || minute < 0 || minute >= 90) return
    let draft = pendingBase.current
    for (const move of pendingMoves.current) {
      const next = moveSubstitution(draft, move.source, move.target, startingSnapshot, slotPositions, minute, selectedTeamId, () => crypto.randomUUID())
      if (next === draft) { setSubstitutionError('Invalid substitution or time.'); return }
      draft = next
    }
    setSubstitutionDraft(draft); setSubstitutionError('')
  }

  function selectSubstitutionTarget(target: LineupTarget) {
    if (suppressDragClick.current) return
    if (target.group === 'substitute' && target.id && !activeDraft.homeBench.includes(target.id)) return
    if (subSelection) {
      if (subSelection.group === target.group && subSelection.id === target.id) setSubSelection(null)
      else applyLiveMove(subSelection, target)
    } else if (target.group === 'starting' ? activeDraft.slotAssignments[target.id] : target.id) {
      setSubSelection(target)
      setSubstitutionError('')
    }
  }

  function handleSubstitutionDragEnd(event: DragEndEvent) {
    const source = lineupTarget(String(event.active.id))
    const target = lineupTarget(String(event.over?.id ?? ''))
    if (source && target) applyLiveMove(source, target)
    window.setTimeout(() => { suppressDragClick.current = false }, 0)
  }

  function swapDraft(targetGroup: 'starting' | 'substitute' | 'squad', targetId: string) {
    if (lineupLocked || !activePlayer) return
    const source: LineupTarget = { group: activePlayer.group, id: activePlayer.group === 'starting' ? activePlayer.slotId! : activePlayer.id }
    const target: LineupTarget = { group: targetGroup, id: targetGroup === 'starting' ? Object.keys(matchDraft.slotAssignments).find(slot => matchDraft.slotAssignments[slot] === targetId)! : targetId }
    setMatchDraft(prev => ({ ...prev, ...moveLineup(prev, source, target) }))
    setActivePlayer(null)
  }

  function moveStartingSlot(activeSlot: string, targetSlot: string) {
    if (lineupLocked) return
    setMatchDraft(prev => ({ ...prev, ...moveLineup(prev, { group: 'starting', id: activeSlot }, { group: 'starting', id: targetSlot }) }))
  }

  function handleLineupDragEnd(event: DragEndEvent) {
    window.setTimeout(() => { suppressDragClick.current = false }, 0)
    if (lineupLocked) return
    const source = lineupTarget(String(event.active.id))
    const target = lineupTarget(String(event.over?.id ?? ''))
    if (source && target) setMatchDraft(prev => ({ ...prev, ...moveLineup(prev, source, target) }))
  }

  const appearances: Appearance[] = useMemo(() => {
    const res: Appearance[] = []
    const source = lineupLocked ? startingSnapshot : matchDraft.slotAssignments
    Object.entries(source).forEach(([slotId, id]) => {
          if (!id) return
          const slot = UNIVERSAL_TACTICAL_SLOTS.find((item) => item.slot === slotId)
          const p = players.find((x) => x.id === id)
          res.push({ playerId: id, teamId: selectedTeamId, position: p?.position ?? 'CM', matchPosition: slot?.matchPosition, role: 'starter' })
    })
    const enteredSubs = matchDraft.events.filter((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub')
    for (const event of enteredSubs) {
      if (res.some(appearance => appearance.playerId === event.playerInId)) continue
      const player = players.find(item => item.id === event.playerInId)
      if (player) res.push({ playerId: player.id, teamId: selectedTeamId, position: player.position, matchPosition: event.position, role: 'bench' })
    }
    // Before kickoff the editable bench is the match-day bench; after kickoff
    // retain the original bench so restored substitutions keep their history.
    for (const id of (lineupLocked ? startingBenchSnapshot : matchDraft.homeBench)) {
      if (res.some(a => a.playerId === id)) continue
      const player = players.find(p => p.id === id)
      if (player) res.push({ playerId: id, teamId: selectedTeamId, position: player.position, role: 'bench' })
    }
    return res.map(appearance => matchDraft.positionHistories[appearance.playerId]?.length
      ? { ...appearance, positionHistory: matchDraft.positionHistories[appearance.playerId] }
      : appearance)
  }, [selectedTeamId, players, matchDraft, startingSnapshot, startingBenchSnapshot, lineupLocked])

  const eventMatch = { id: draftId, season, matchDay, date, duration: 90, homeTeamId, awayTeamId, appearances, events: matchDraft.events }
  function eligibleAt(minute: number) {
    return appearances.filter(appearance => {
      const window = pitchWindow(eventMatch, appearance)
      const offAtMinute = matchDraft.events.some(event => event.type === 'sub' && event.playerOutId === appearance.playerId && event.minute === minute)
      return window && minute >= window.enter && (minute < window.exit || (minute === 90 && window.exit === 90 && !offAtMinute))
    })
  }
  const eligibleAppearances = Number.isFinite(liveMinute) ? eligibleAt(liveMinute) : appearances.filter(a => liveSlots.some(slot => slot.playerId === a.playerId))
  const eligibleGoalIds = eligibleAppearances.map(a => a.playerId)
  const occupiedGoalSlots = new Set<string>()
  const goalSlots: Best11Slot[] = Number.isFinite(liveMinute) ? eligibleAppearances.map(a => {
    const on = matchDraft.events.find(event => event.type === 'sub' && event.playerInId === a.playerId)
    const history = [...(a.positionHistory ?? [])].filter(change => change.minute <= liveMinute).sort((a, b) => a.minute - b.minute)
    const position = history.at(-1)?.position ?? (a.role === 'bench' && on?.type === 'sub' ? on.position : a.matchPosition ?? a.position)
    const originalSlot = Object.keys(startingSnapshot).find(slot => startingSnapshot[slot] === a.playerId)
    const candidates = UNIVERSAL_TACTICAL_SLOTS.filter(slot => slot.matchPosition === position && !occupiedGoalSlots.has(slot.slot))
    const tactical = candidates.find(slot => slot.slot === originalSlot) ?? candidates.find(slot => slot.slot === position) ?? candidates[0]
    const slotId = tactical?.slot ?? position
    occupiedGoalSlots.add(slotId)
    return { slot: slotId, position: a.position, matchPosition: position, playerId: a.playerId, teamId: a.teamId, avgRating: 0, matches: 0 }
  }) : liveSlots
  function chooseScorer(id: string) {
    if (!eligibleGoalIds.includes(id)) return
    setLiveScorerId(id); setLiveAssistId(''); setAssistChosen(false); setLivePicker('assist')
  }
  function chooseAssist(id: string) {
    if (!liveScorerId || (id && (id === liveScorerId || !eligibleGoalIds.includes(id)))) return
    setLiveAssistId(id); setAssistChosen(true); setLivePicker('minute')
  }
  function changeMinute(value: string | number) {
    const input = String(value)
    if (!/^\d{0,2}$/.test(input)) return
    setMinuteInput(input)
    if (liveEvent === 'substitution' && input !== '') replayPendingMoves(Number(input))
    if (liveCauseId && input !== '' && !eligibleAt(Number(input)).some(a => a.playerId === liveCauseId)) setLiveCauseId('')
    if (liveEvent === 'goal' && input !== '') {
      const ids = eligibleAt(Number(input)).map(a => a.playerId)
      if (liveScorerId && !ids.includes(liveScorerId)) {
        setLiveScorerId(''); setLiveAssistId(''); setAssistChosen(false); setLivePicker('scorer')
      } else if (liveAssistId && !ids.includes(liveAssistId)) {
        setLiveAssistId(''); setAssistChosen(false); setLivePicker('assist')
      }
    }
  }

  const startingGoalkeeperId = startingSnapshot.GK
  const totalSavesEvent = matchDraft.events.find((event): event is Extract<MatchEvent, { type: 'save' }> => event.type === 'save' && event.id === totalSavesEventId.current)
  const totalSaves = totalSavesEvent ? String(totalSavesEvent.count ?? 0) : ''
  function changeTotalSaves(value: string) {
    if (!/^\d*$/.test(value) || !startingGoalkeeperId || substitutionDraft) return
    const count = Number(value)
    if (!Number.isSafeInteger(count)) return
    if (value !== '' && !totalSavesEventId.current) totalSavesEventId.current = crypto.randomUUID()
    const eventId = totalSavesEventId.current
    setMatchDraft(prev => {
      const existing = prev.events.find(event => event.id === eventId)
      const event: MatchEvent = { id: eventId!, type: 'save', teamId: selectedTeamId, playerId: startingGoalkeeperId, count }
      return { ...prev, events: value === '' ? prev.events.filter(event => event.id !== eventId) : existing ? prev.events.map(item => item.id === eventId ? event : item) : [...prev.events, event] }
    })
  }

  useEffect(() => {
    if (!draftReady) return
    saveDraftMatch({ id: draftId, season, matchDay, date, formation: activeFormationName, homeAway: 'home', homeTeamId, awayTeamId, teamId: selectedTeamId, opponentName: 'OPP', duration: 90, appearances, events: matchDraft.events })
  }, [draftReady, draftId, season, matchDay, date, activeFormationName, matchDraft, homeTeamId, awayTeamId, selectedTeamId, appearances, saveDraftMatch])

  function save() {
    if (savingRef.current || liveEvent || startingIds.length !== 11) return
    savingRef.current = true
    const id = addMatch({ id: draftId,
      season, matchDay, date, formation: activeFormationName, homeAway: 'home', homeTeamId, awayTeamId, teamId: selectedTeamId, opponentName: 'OPP', duration: 90, appearances, events: matchDraft.events,
    })
    clearDraftMatch()
    onNavigate({ name: 'match', id })
  }

  return (
    <StarterPositionContext.Provider value={{ positions: starterPositionByPlayer, highlightPosition: focusedPlayer?.position }}>
    <div className="flex h-full min-h-0 flex-col bg-black text-white">
      <div className="px-4 pt-3">
        <button onClick={() => onNavigate(teamId ? { name: 'team', id: teamId } : { name: 'teams' })} className="mb-3 text-xs font-semibold text-emerald-400">← Cancel</button>
        <h1 className="text-2xl font-bold">Log Match</h1>
        <div className="mb-2 rounded-xl bg-zinc-900 px-3 py-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Next Match Day</p>
          <p className="text-sm font-black text-emerald-400">{season} · MD {matchDay}</p>
        </div>
      </div>

      {historyError && <p role="alert" className="px-4 text-xs text-red-400">{historyError}</p>}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {step === 0 && (
          <DndContext sensors={lineupSensors} collisionDetection={lineupCollision} onDragStart={handleLineupDragStart} onDragEnd={handleLineupDragEnd} onDragCancel={() => { suppressDragClick.current = false }}>
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase text-zinc-500">Formation<div className="mt-1 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-black text-white">{activeFormationName}</div><span className="mt-1 block text-[9px] normal-case text-zinc-500">Calculated from current tactical slots</span></div>
            </div>

            <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Starting XI</h2><Pitch slots={universalPitchSlots} players={draftPlayers} teams={teams} statsByPlayer={seasonStats} badgeMode="position" draggable={!lineupLocked} externalDnd onSlotDrop={moveStartingSlot} onSlotClick={(slot) => { if (!lineupLocked && !suppressDragClick.current && slot.playerId) { setFocusedPlayerId(slot.playerId); setActivePlayer({ group: 'starting', id: slot.playerId, slotId: slot.slot }) } }} /></section>
            <DragPlayerGroup title="Substitutes" group="substitute" team={teams.find(team => team.id === selectedTeamId)} players={matchDraft.homeBench.filter(Boolean).map((id) => draftPlayers.find((player) => player.id === id)).filter((player): player is NonNullable<typeof player> => Boolean(player))} statsByPlayer={seasonStats} onClick={(id) => { if (lineupLocked || suppressDragClick.current) return; setFocusedPlayerId(id); setActivePlayer({ group: 'substitute', id }) }} />
            <DragPlayerGroup title="Squad" group="squad" players={squadPlayers} statsByPlayer={seasonStats} onClick={(id) => { if (lineupLocked || suppressDragClick.current) return; setFocusedPlayerId(id); setActivePlayer({ group: 'squad', id }) }} />
            <button disabled={startingIds.length !== 11} onClick={() => { if (!lineupLocked) { setStartingSnapshot({ ...matchDraft.slotAssignments }); setStartingBenchSnapshot([...matchDraft.homeBench]) } setStep(1) }} className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-black shadow-xl disabled:opacity-40">CONTINUE</button>
            {activePlayer && <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-4" onClick={() => setActivePlayer(null)}><div className="max-h-[75vh] w-full overflow-y-auto rounded-2xl bg-zinc-950 p-4" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-black uppercase">Change Player</h2><button type="button" onClick={() => setActivePlayer(null)} className="text-zinc-500">×</button></div>{activePlayer.group !== 'starting' && <PlayerGroup title="Starting XI" players={UNIVERSAL_TACTICAL_SLOTS.map(s => matchDraft.slotAssignments[s.slot]).filter(Boolean).map((id) => draftPlayers.find((player) => player.id === id)).filter((player): player is NonNullable<typeof player> => Boolean(player))} onClick={(id) => swapDraft('starting', id)} />}{activePlayer.group !== 'substitute' && <PlayerGroup title="Substitutes" players={matchDraft.homeBench.filter(Boolean).map((id) => draftPlayers.find((player) => player.id === id)).filter((player): player is NonNullable<typeof player> => Boolean(player))} onClick={(id) => swapDraft('substitute', id)} />}{activePlayer.group !== 'squad' && <PlayerGroup title="Squad" players={squadPlayers} onClick={(id) => swapDraft('squad', id)} />}<button type="button" onClick={() => setActivePlayer(null)} className="mt-4 w-full rounded-xl bg-zinc-900 py-3 text-xs font-bold">CANCEL</button></div></div>}
          </div>
          </DndContext>
        )}

        {step === 1 && <LiveMatchStep
          teams={teams} substitutionSelection={substitutionSelection} pendingSubs={pendingSubs}
          goalReady={!!liveScorerId && assistChosen && eligibleGoalIds.includes(liveScorerId) && (!liveAssistId || eligibleGoalIds.includes(liveAssistId))} assistChosen={assistChosen}
          slots={liveEvent === 'goal' || liveEvent === 'conceded' ? goalSlots : liveSlots} players={draftPlayers} benchPlayers={liveBenchPlayers} stats={liveStats} events={activeDraft.events}
          totalSaves={totalSaves} onTotalSaves={changeTotalSaves} hasStartingGoalkeeper={!!startingGoalkeeperId} subOutId={subSelection ? (subSelection.group === 'starting' ? activeDraft.slotAssignments[subSelection.id] : subSelection.id) : ''} substitutionError={substitutionError}
          onSubSlot={(id) => selectSubstitutionTarget({ group: 'starting', id })}
          onSubBench={() => selectSubstitutionTarget({ group: 'substitute', id: '' })}
          onSubOut={(id) => { const slot = Object.keys(activeDraft.slotAssignments).find(slotId => activeDraft.slotAssignments[slotId] === id); if (slot) selectSubstitutionTarget({ group: 'starting', id: slot }) }}
          onSubIn={(id) => selectSubstitutionTarget({ group: 'substitute', id })}
          onSubDragEnd={handleSubstitutionDragEnd}
          onDragStart={() => { suppressDragClick.current = true; setSubSelection(null) }}
          onDragCancel={() => { suppressDragClick.current = false }}
          canConfirmSubstitutions={!substitutionError && !!substitutionDraft && canConfirmSubstitution(substitutionDraft, matchDraft)}
          liveEvent={liveEvent} liveMinute={minuteInput} liveScorerId={liveScorerId} liveAssistId={liveAssistId} liveCauseId={liveCauseId} livePicker={livePicker}
          onOpen={openLiveEvent} onSave={saveLiveEvent} onCancel={cancelLiveEvent} onMinute={changeMinute} onScorer={chooseScorer} onAssist={chooseAssist} onCause={setLiveCauseId} onPicker={setLivePicker}
          validMinute={minuteIsValid} onPitchClick={(id) => { if (liveEvent === 'goal') { if (livePicker === 'scorer') chooseScorer(id); else if (livePicker === 'assist') chooseAssist(id) }  else if (liveEvent === 'conceded' && livePicker === 'cause' && eligibleGoalIds.includes(id)) { setLiveCauseId(id === liveCauseId ? '' : id); setLivePicker('minute') } }}
          onBack={() => { cancelLiveEvent(); setStep(0) }} onFinish={save} startingGoalkeeperName={playerDisplayName(players.find(p => p.id === startingGoalkeeperId))} selectedTeamId={selectedTeamId} onEditEvent={editLiveEvent} onDeleteEvent={deleteLiveEvent} />}
      </div>
    </div>
    {subEdit && <div role="dialog" aria-modal="true" aria-label="Edit substitution" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="w-full max-w-sm space-y-3 rounded-xl bg-zinc-900 p-4 text-white"><h2>Edit substitution</h2>{historyError && <p role="alert" className="text-xs text-red-400">{historyError}</p>}<label className="block">OUT<select aria-label="OUT player" value={subEdit.playerOutId} onChange={e => setSubEdit({ ...subEdit, playerOutId: e.target.value })} className="w-full bg-black p-2">{draftPlayers.map(p => <option key={p.id} value={p.id}>{playerDisplayName(p)}</option>)}</select></label><label className="block">IN<select aria-label="IN player" value={subEdit.playerInId} onChange={e => setSubEdit({ ...subEdit, playerInId: e.target.value })} className="w-full bg-black p-2">{draftPlayers.map(p => <option key={p.id} value={p.id}>{playerDisplayName(p)}</option>)}</select></label><MinuteInput value={subEditMinute} onChange={setSubEditMinute} label="Substitution Time" /><button disabled={!/^\d{1,2}$/.test(subEditMinute) || Number(subEditMinute) >= 90} onClick={saveSubEdit} className="w-full rounded-lg bg-emerald-500 p-2 font-bold text-black disabled:opacity-40">SAVE</button><button onClick={() => { setSubEdit(null); setHistoryError('') }} className="w-full p-2">CANCEL</button></div></div>}
    </StarterPositionContext.Provider>
  )
}

function LiveMatchStep(props: {
  startingGoalkeeperName: string;
  goalReady: boolean; assistChosen: boolean; teams: Team[]; substitutionSelection: Record<string, 'in' | 'out'>; pendingSubs: Extract<MatchEvent, { type: 'sub' }>[]
  totalSaves: string; onTotalSaves: (value: string) => void; hasStartingGoalkeeper: boolean; subOutId: string; substitutionError: string; canConfirmSubstitutions: boolean
  onSubOut: (id: string) => void; onSubIn: (id: string) => void; onSubSlot: (id: string) => void; onSubBench: () => void
  onSubDragEnd: (event: DragEndEvent) => void; onDragStart: () => void; onDragCancel: () => void
  slots: Best11Slot[]; players: Player[]; benchPlayers: Player[]; stats: Record<string, { goals: number; assists: number }>; events: MatchEvent[]; selectedTeamId: string
  liveEvent: 'goal' | 'conceded' | 'substitution' | null; liveMinute: string; liveScorerId: string; liveAssistId: string; liveCauseId: string; livePicker: 'scorer' | 'assist' | 'cause' | 'minute'; validMinute: boolean
  onOpen: (type: 'goal' | 'conceded' | 'substitution') => void; onSave: () => void; onCancel: () => void; onMinute: (value: string | number) => void; onScorer: (id: string) => void; onAssist: (id: string) => void; onCause: (id: string) => void; onPicker: (picker: 'scorer' | 'assist' | 'cause' | 'minute') => void; onPitchClick: (id: string) => void; onBack: () => void; onFinish: () => void; onEditEvent: (event: MatchEvent) => void; onDeleteEvent: (event: MatchEvent) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  )
  const [finishStage, setFinishStage] = useState<'saves' | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<MatchEvent | null>(null)
  const finishMatch = () => {
    if (finishing) return
    setFinishing(true)
    props.onFinish()
  }
  const eventName = props.liveEvent === 'conceded' ? 'Conceded Goal' : 'Goal'
  const playerName = (id: string) => playerDisplayName(props.players.find((player) => player.id === id))
  return <DndContext sensors={sensors} collisionDetection={lineupCollision} onDragStart={props.onDragStart} onDragEnd={props.onSubDragEnd} onDragCancel={props.onDragCancel}><div className="space-y-3">
    <div className="sticky top-0 z-30 space-y-2 bg-black/95 py-2">
    <div className="grid grid-cols-3 gap-2">{([['goal', 'GOAL'], ['conceded', 'CONCEDED'], ['substitution', 'SUBSTITUTION']] as const).map(([type, label]) => <button key={type} type="button" disabled={!!props.liveEvent} onClick={() => props.onOpen(type)} className={`rounded-xl py-3 text-[10px] font-black ${props.liveEvent === type ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-white'}`}>{label}</button>)}</div>
    {props.liveEvent && props.liveEvent !== 'substitution' && <div className="space-y-2 rounded-xl bg-zinc-900 p-2">{props.liveEvent !== 'goal' && <MinuteInput value={props.liveMinute} onChange={props.onMinute} label={`${eventName} Time`} />}
      {props.liveEvent === 'goal' && <div className="space-y-3">
        <div aria-live="polite" className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => props.onPicker('scorer')} className="rounded-xl bg-black p-2 text-left text-xs font-bold"><GoalIcon className="inline h-3 w-3" /> {props.liveScorerId ? playerName(props.liveScorerId) : 'Select scorer'}</button>
          <button type="button" disabled={!props.liveScorerId} onClick={() => props.onPicker('assist')} className="rounded-xl bg-black p-3 text-left text-xs font-bold disabled:opacity-40"><AssistIcon className="inline h-3 w-3" /> {props.liveAssistId ? playerName(props.liveAssistId) : props.assistChosen ? 'No Assist' : 'Select assist'}</button>
        </div>
        {props.liveScorerId && props.livePicker === 'assist' && <button type="button" onClick={() => props.onAssist('')} className="w-full rounded-xl bg-black p-3 text-xs font-bold">No Assist</button>}
        <MinuteInput value={props.liveMinute} onChange={props.onMinute} label="Goal Time" autoFocus={props.livePicker === 'minute'} />
      </div>}
      {props.liveEvent === 'conceded' && <><button type="button" onClick={() => props.onPicker(props.livePicker === 'cause' ? 'minute' : 'cause')} className={`w-full rounded-xl p-2 text-left text-[10px] font-bold ${props.livePicker === 'cause' ? 'bg-emerald-500 text-black' : 'bg-black'}`}>{props.liveCauseId ? 'Fault: ' + playerName(props.liveCauseId) : 'ADD FAULT PLAYER / No Fault'}</button>{(props.liveCauseId || props.livePicker === 'cause') && <button type="button" onClick={() => { props.onCause(''); props.onPicker('minute') }} className="w-full rounded-xl bg-black p-2 text-[10px] font-bold">NO FAULT</button>}</>}
      <div className="flex gap-2"><button type="button" onClick={props.onCancel} className="flex-1 rounded-xl bg-black py-2 text-xs font-black">CANCEL</button><button type="button" disabled={!props.validMinute || (props.liveEvent === 'goal' && !props.goalReady)} onClick={props.onSave} className="flex-1 rounded-xl bg-emerald-500 py-2 text-xs font-black text-black disabled:opacity-40">SAVE {eventName.toUpperCase()}</button></div></div>}
    {props.liveEvent === 'substitution' && <div className="space-y-2 rounded-xl bg-zinc-900 p-2">
      <MinuteInput value={props.liveMinute} onChange={props.onMinute} label="Substitution Time" />
      <div aria-live="polite" className="space-y-1 text-xs font-semibold">
        {props.subOutId && <p>{props.players.find(player => player.id === props.subOutId)?.number} {playerName(props.subOutId)} <SubstitutionSelection direction={props.substitutionSelection[props.subOutId] ?? 'out'} /></p>}
        {props.pendingSubs.length === 0 && Object.entries(props.substitutionSelection).map(([id, direction]) => <span key={id} className="mr-2 inline-flex items-center gap-1">{props.players.find(p => p.id === id)?.number} {playerName(id)} <SubstitutionSelection direction={direction} /></span>)}
        {props.pendingSubs.map(event => <p key={event.id}><span className="text-red-400">{props.players.find(player => player.id === event.playerOutId)?.number} {playerName(event.playerOutId)} OUT</span> &rarr; <span className="text-emerald-400">{props.players.find(player => player.id === event.playerInId)?.number} {playerName(event.playerInId)} IN</span></p>)}
      </div>
      <p className="text-xs text-zinc-400">On pitch: {props.slots.filter(slot => slot.playerId).length} / 11</p>
      {props.substitutionError && <p role="alert" className="text-xs text-red-400">{props.substitutionError}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={props.onCancel} className="flex-1 rounded-xl bg-black py-2 text-xs font-black">CANCEL</button>
        <button type="button" disabled={!props.validMinute || !props.canConfirmSubstitutions} onClick={props.onSave} className="flex-1 rounded-xl bg-emerald-500 py-2 text-xs font-black text-black disabled:opacity-40">CONFIRM SUBSTITUTIONS</button>
      </div>
    </div>}
    </div>
    <section>{props.liveEvent === 'goal' && <p className="mb-3 text-sm font-bold text-emerald-300">{props.livePicker === 'scorer' ? '1. Select scorer on the pitch' : props.livePicker === 'assist' ? '2. Select assist on the pitch or No Assist' : '3. Enter minute and save'}</p>}<h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Starting XI</h2><Pitch compact goalSelection={props.liveEvent === 'goal' ? { ...(props.liveScorerId ? { [props.liveScorerId]: 'scorer' as const } : {}), ...(props.liveAssistId ? { [props.liveAssistId]: 'assist' as const } : {}) } : props.liveEvent === 'conceded' && props.liveCauseId ? { [props.liveCauseId]: 'fault' } : undefined} disabledPlayerIds={props.liveEvent === 'goal' && props.livePicker === 'assist' ? [props.liveScorerId] : undefined} slots={props.slots} players={props.players} teams={props.teams} substitutionSelection={props.substitutionSelection} statsByPlayer={props.stats} badgeMode="position" draggable={props.liveEvent === 'substitution'} externalDnd onEmptySlotClick={props.liveEvent === 'substitution' ? slot => props.onSubSlot(slot.slot) : undefined} onSlotClick={(slot) => { if (!slot.playerId) return; if (props.liveEvent === 'substitution') props.onSubOut(slot.playerId); else props.onPitchClick(slot.playerId) }} /></section>
    {props.liveEvent === 'substitution' && <><DragPlayerGroup title="Substitutes" group="substitute" team={props.teams.find(team => team.id === props.selectedTeamId)} selection={props.substitutionSelection} players={props.benchPlayers} statsByPlayer={props.stats} onClick={props.onSubIn} /><BenchDropTarget onClick={props.onSubBench} /></>}
    <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Event History</h2><button type="button" disabled={!!props.liveEvent || !props.events.some(e => e.type !== 'save')} onClick={() => { const event = props.events.filter(e => e.type !== 'save').at(-1); if (event) props.onDeleteEvent(event) }} className="mb-2 text-xs font-bold text-emerald-400 disabled:opacity-40">UNDO LAST</button><div className="space-y-1.5">{props.events.slice().sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)).map((event) => <button type="button" disabled={!!props.liveEvent} onClick={() => event.type === 'save' ? setFinishStage('saves') : setSelectedEvent(event)} key={event.id} className="block w-full rounded-xl bg-zinc-900 px-3 py-2 text-left text-[11px]">{event.type !== 'save' && `${event.minute}' `}{event.type === 'goal' ? event.teamId === props.selectedTeamId ? `Goal${event.playerId ? `: ${playerName(event.playerId)}` : ' · Opponent own goal'}${event.assistPlayerId ? ` · Assist: ${playerName(event.assistPlayerId)}` : ''}` : `Conceded${event.concededGoalCausePlayerId ? ` · Cause: ${playerName(event.concededGoalCausePlayerId)}` : ''}` : event.type === 'sub' ? `Substitution: ${playerName(event.playerOutId)} → ${playerName(event.playerInId)}` : `Save: ${playerName(event.playerId)} × ${event.count ?? 1}`}</button>)}</div></section>
    <div className="flex gap-2"><button type="button" onClick={props.onBack} className="flex-1 rounded-2xl bg-zinc-900 py-4 text-sm font-black">BACK</button><button type="button" disabled={!!props.liveEvent} onClick={() => setFinishStage('saves')} className="flex-2 rounded-2xl bg-emerald-500 py-4 text-sm font-black text-black shadow-xl">END MATCH</button></div>
    {finishStage && <div role="dialog" aria-modal="true" aria-label="End match" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="w-full max-w-sm space-y-3 rounded-xl bg-zinc-900 p-4">
      <p className="font-bold">{props.startingGoalkeeperName || 'No starting goalkeeper'}</p><label className="flex items-center justify-between">Saves<input aria-label="Total saves" type="text" inputMode="numeric" pattern="[0-9]*" value={props.totalSaves} disabled={!props.hasStartingGoalkeeper || finishing} onChange={event => props.onTotalSaves(event.target.value)} className="w-20 rounded-lg bg-black p-2 text-base" /></label><button disabled={finishing || (props.hasStartingGoalkeeper && props.totalSaves === '')} onClick={finishMatch} className="w-full rounded-lg bg-emerald-500 p-3 text-xs font-black text-black disabled:opacity-40">{finishing ? 'SAVING…' : 'SAVE & FINISH MATCH'}</button>
      <button onClick={() => setFinishStage(null)} className="w-full p-2 text-xs">CANCEL</button>
    </div></div>}
    {selectedEvent && <div role="dialog" aria-modal="true" aria-label="Event actions" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="flex w-full max-w-sm gap-2 rounded-xl bg-zinc-900 p-4"><button className="flex-1 p-3" onClick={() => { props.onEditEvent(selectedEvent); setSelectedEvent(null) }}>EDIT</button><button className="flex-1 p-3 text-red-400" onClick={() => { props.onDeleteEvent(selectedEvent); setSelectedEvent(null) }}>DELETE</button><button className="flex-1 p-3" onClick={() => setSelectedEvent(null)}>CANCEL</button></div></div>}
  </div></DndContext>
}

function BenchDropTarget({ onClick }: { onClick: () => void }) {
  const drop = useDroppable({ id: 'bench:empty' })
  return <button ref={drop.setNodeRef} type="button" onClick={onClick} aria-label="Move selected player to bench" className={`w-full rounded-lg border border-dashed p-3 text-xs ${drop.isOver ? 'border-emerald-400 text-emerald-400' : 'border-zinc-700 text-zinc-400'}`}>Bench</button>
}

function DragPlayerGroup({ title, group, players, onClick, statsByPlayer, team, selection }: { title: string; group: 'substitute' | 'squad'; team?: Team; selection?: Record<string, 'in' | 'out'>; players: Player[]; onClick: (id: string) => void; statsByPlayer?: Record<string, { goals: number; assists: number }> }) {
  return <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">{title}</h2><div className="grid grid-cols-4 gap-2">{players.map((player) => <DraggableRosterPlayer key={player.id} player={player} team={team} selection={selection?.[player.id]} group={group} onClick={onClick} stats={statsByPlayer?.[player.id]} />)}</div></section>
}

function DraggableRosterPlayer({ player, group, onClick, stats, team, selection }: { player: Player; team?: Team; selection?: 'in' | 'out'; group: 'substitute' | 'squad'; onClick: (id: string) => void; stats?: { goals: number; assists: number } }) {
  const drag = useDraggable({ id: `roster:${group}:${player.id}` })
  const drop = useDroppable({ id: `roster:${group}:${player.id}` })
  if (group === 'substitute') return <div ref={drop.setNodeRef} className={`min-w-0 ${drop.isOver ? 'rounded-lg ring-2 ring-white/80' : ''}`}><div ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} role={undefined} tabIndex={undefined} style={{ opacity: drag.isDragging ? 0.45 : 1, touchAction: 'none' }}><SubstitutePlayerCard player={player} team={team} stats={stats} showRating={false} selection={selection} onClick={() => onClick(player.id)} /></div></div>
  return <button ref={drop.setNodeRef} type="button" onClick={() => onClick(player.id)} className={`flex min-w-0 flex-col items-center rounded-lg bg-zinc-900 p-1 text-center ${drop.isOver ? 'ring-2 ring-white/80' : ''}`}><span ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="relative flex h-8 w-8 items-center justify-center overflow-visible" style={{ opacity: drag.isDragging ? 0.45 : 1, touchAction: 'none' }}><PlayerAvatar photoUrl={player.photoUrl || player.image} number={player.number} className="h-8 w-8 text-[10px]" /><span className="absolute -left-1 -top-1 rounded bg-zinc-800 px-0.5 text-[6px] font-black text-zinc-300">{player.position}</span></span><span className="w-full truncate text-[8px] font-semibold">{player.displayName ?? player.name}</span>{stats && <StatIcons goals={stats.goals} assists={stats.assists} className="text-[7px] text-zinc-400" />}</button>
}

function PlayerGroup({ title, players, onClick }: { title: string; players: { id: string; name: string; number: number; position: Position; photoUrl?: string; image?: string }[]; onClick: (id: string) => void }) {
  return <section><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">{title}</h2><div className="grid grid-cols-4 gap-2">{players.map((player) => <button key={player.id} type="button" onClick={() => onClick(player.id)} className="flex min-w-0 flex-col items-center rounded-lg bg-zinc-900 p-1 text-center"><span className="relative flex h-8 w-8 items-center justify-center overflow-visible"><PlayerAvatar photoUrl={player.photoUrl || player.image} number={player.number} className="h-8 w-8 text-[10px]" /><span className="absolute -left-1 -top-1 rounded bg-zinc-800 px-0.5 text-[6px] font-black text-zinc-300">{player.position}</span></span><span className="w-full truncate text-[8px] font-semibold">{player.name}</span></button>)}</div></section>
}

function MinuteInput({ value, onChange, label, autoFocus = false }: { value: string; onChange: (value: string) => void; label: string; autoFocus?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) input.current?.focus() }, [autoFocus])
  return <label className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500">{label}<input ref={input} aria-label={label} type="text" inputMode="numeric" pattern="[0-9]{1,2}" maxLength={2} value={value} onChange={event => { if (/^\d{0,2}$/.test(event.target.value)) onChange(event.target.value) }} onFocus={event => event.currentTarget.scrollIntoView?.({ block: 'nearest' })} className="ml-auto w-16 rounded-xl bg-black px-3 py-2 text-base text-white" /></label>
}
