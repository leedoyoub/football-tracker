import type { Best11Slot, Player, Position, Team } from '../types'
import { PlayerIcon } from './PlayerIcon'
import { playerCompactName, playerDisplayName, Badge, SubstitutionMarker, SubstitutionSelection, ratingBadgeColor } from './ui'
import { useRef } from 'react'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { NAMED_TACTICAL_FORMATIONS, TACTICAL_SLOT_DEFINITIONS } from '../engine/tacticalSlots'

export type TacticalSlot = { slot: string; position: Position; matchPosition: Position; displayPosition: string; x: number; y: number }

const grid: Record<string, TacticalSlot> = Object.fromEntries(TACTICAL_SLOT_DEFINITIONS.map(definition => [definition.id, { slot: definition.id, position: definition.ratingPosition, matchPosition: definition.ratingPosition, displayPosition: definition.displayPosition, x: definition.x, y: definition.y }]))

export const UNIVERSAL_TACTICAL_SLOTS = Object.values(grid)
const formation = (...ids: string[]) => ids.map((id) => grid[id])
/** Compatibility projection of the one canonical tactical formation catalogue. */
export const FORMATION_SLOTS: Record<string, TacticalSlot[]> = Object.fromEntries(Object.entries(NAMED_TACTICAL_FORMATIONS).map(([name, ids]) => [name, formation(...ids)]))

const ROW_SLOTS = {
  defenders: {
    1: ['CB'],
    2: ['LCB', 'RCB'],
    3: ['LCB', 'CB', 'RCB'],
    4: ['LB', 'LCB', 'RCB', 'RB'],
    5: ['LB', 'LCB', 'CB', 'RCB', 'RB'],
  },
  midfielders: {
    1: ['CM'],
    2: ['LCM', 'RCM'],
    3: ['LCM', 'CM', 'RCM'],
    4: ['LM', 'LCM', 'RCM', 'RM'],
    5: ['LM', 'LCM', 'CM', 'RCM', 'RM'],
  },
  deeperMidfielders: {
    1: ['CDM'],
    2: ['LDM', 'RDM'],
    3: ['LDM', 'CDM', 'RDM'],
  },
  advancedMidfielders: {
    1: ['CAM'],
    2: ['LCAM', 'RCAM'],
    3: ['LCAM', 'CAM', 'RCAM'],
  },
  attackers: {
    1: ['ST'],
    2: ['LST', 'RST'],
    3: ['LW', 'ST', 'RW'],
  },
} as const

/** Rebuilds any valid shape produced by New Match while keeping one unique tactical slot per starter. */
export function formationSlotsFor(name: string | undefined): TacticalSlot[] | undefined {
  if (!name) return undefined
  if (FORMATION_SLOTS[name]) return FORMATION_SLOTS[name]
  const counts = name.split('-').map(Number)
  if (!counts.every(Number.isInteger) || counts.reduce((sum, count) => sum + count, 0) !== 10) return undefined
  const ids = counts.length === 3
    ? [
        ROW_SLOTS.defenders[counts[0] as keyof typeof ROW_SLOTS.defenders],
        ROW_SLOTS.midfielders[counts[1] as keyof typeof ROW_SLOTS.midfielders],
        ROW_SLOTS.attackers[counts[2] as keyof typeof ROW_SLOTS.attackers],
      ]
    : counts.length === 4
      ? [
          ROW_SLOTS.defenders[counts[0] as keyof typeof ROW_SLOTS.defenders],
          ROW_SLOTS.deeperMidfielders[counts[1] as keyof typeof ROW_SLOTS.deeperMidfielders],
          ROW_SLOTS.advancedMidfielders[counts[2] as keyof typeof ROW_SLOTS.advancedMidfielders],
          ROW_SLOTS.attackers[counts[3] as keyof typeof ROW_SLOTS.attackers],
        ]
      : []
  if (!ids.length || ids.some(row => !row)) return undefined
  return formation(...ids.flat(), 'GK')
}


const homePositions: Record<string, { x: number; y: number }> = {
  LW: { x: 20, y: 22 }, ST: { x: 50, y: 22 }, RW: { x: 80, y: 22 }, LCM: { x: 25, y: 46 }, CM: { x: 50, y: 46 }, RCM: { x: 75, y: 46 }, LB: { x: 13, y: 69 }, LCB: { x: 38, y: 69 }, RCB: { x: 62, y: 69 }, RB: { x: 87, y: 69 }, GK: { x: 50, y: 88 },
}
const ratingColor = ratingBadgeColor
const HISTORY_SLOT_OFFSETS: Record<string, { x?: number; y?: number }> = {
  GK: { y: 3 }, CAM: { y: -3 }, LCAM: { x: 3 }, RCAM: { x: -3 },
}
const clampCoordinate = (value: number) => Math.max(4, Math.min(96, value))

function GoalIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-2.5 w-2.5 fill-none stroke-current stroke-2"><circle cx="12" cy="12" r="9" /><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Zm-6 4 3 1m9-1 3 1m-10 8 1-3m2 3-1-3" /></svg>
}

function AssistIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-2.5 w-2.5 fill-none stroke-current stroke-2"><path d="M4 15.5c2.5-2.8 5.2-4.6 8.1-5.4l3.2.8 3.1 3.1-1.9 2.7-4.1.2-2.2 2.3-4.8-.4L4 15.5Z" /><path d="m12.1 10.1 1.1-3 2.2.5 1.1 3.3M7.4 14.5l1.8 1.1" /></svg>
}

export function Pitch({ compact = false, slots, players, teams, statsByPlayer, outMinutesByPlayer, substitutionSelection, goalSelection, disabledPlayerIds, badgeMode = 'rating', showPositionBadge = true, showGoalkeeperSaves = false, motmPlayerId, onSlotClick, onEmptySlotClick, layout = 'tactical', presentation = 'editable', draggable = false, externalDnd = false, onSlotDrop }: { compact?: boolean; slots: Best11Slot[]; players: Player[]; teams?: Team[]; statsByPlayer?: Record<string, { goals: number; assists: number; saves?: number }>; outMinutesByPlayer?: Record<string, number>; substitutionSelection?: Record<string, 'in' | 'out'>; goalSelection?: Record<string, 'scorer' | 'assist' | 'fault'>; disabledPlayerIds?: string[]; badgeMode?: 'rating' | 'position'; showPositionBadge?: boolean; showGoalkeeperSaves?: boolean; motmPlayerId?: string; onSlotClick?: (slot: Best11Slot) => void; onEmptySlotClick?: (slot: Best11Slot) => void; layout?: 'tactical' | 'free'; presentation?: 'editable' | 'history'; draggable?: boolean; externalDnd?: boolean; onSlotDrop?: (activeSlot: string, targetSlot: string) => void }) {
  const byId = Object.fromEntries(players.map((player) => [player.id, player]))
  const teamById = Object.fromEntries((teams ?? []).map((team) => [team.id, team]))
  const suppressClick = useRef(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }))
  const nearest: CollisionDetection = ({ pointerCoordinates, droppableContainers, droppableRects }) => {
    if (!pointerCoordinates) return []
    let closest: { id: string | number; distance: number } | undefined
    for (const item of droppableContainers) { const rect = droppableRects.get(item.id); if (!rect) continue; const distance = Math.hypot(pointerCoordinates.x - rect.left - rect.width / 2, pointerCoordinates.y - rect.top - rect.height / 2); if (!closest || distance < closest.distance) closest = { id: item.id, distance } }
    return closest ? [{ id: closest.id }] : []
  }
  const endDrag = (event: DragEndEvent) => { const active = String(event.active.id).replace('player:', ''); const target = String(event.over?.id ?? '').replace('target:', ''); if (event.over && active !== target) onSlotDrop?.(active, target); window.setTimeout(() => { suppressClick.current = false }, 0) }
  const content = <div className={`relative mx-auto w-full overflow-hidden rounded-lg border border-emerald-700/50 pitch-grass ${compact ? 'aspect-square' : 'aspect-[3/4]'}`}><div className="pointer-events-none absolute inset-2 border border-white/40"><div className="absolute left-1/2 top-0 h-14 w-24 -translate-x-1/2 border border-t-0 border-white/40" /><div className="absolute bottom-0 left-1/2 h-14 w-24 -translate-x-1/2 border border-b-0 border-white/40" /><div className="absolute left-0 right-0 top-1/2 border-t border-white/40" /><div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" /></div>{slots.map((slot) => {
    const tactical = grid[slot.slot]
    // Saved historical coordinates can be normalized (0..1) or percentages.
    // Do not use `||`: zero is a valid edge coordinate.
    const coordinate = (value: number | undefined) => value === undefined ? undefined : clampCoordinate(value <= 1 ? value * 100 : value)
    const savedX = coordinate(slot.x); const savedY = coordinate(slot.y)
    const basePoint = savedX !== undefined && savedY !== undefined ? { x: savedX, y: savedY } : layout === 'free' ? homePositions[slot.slot] ?? tactical ?? { x: 50, y: 50 } : tactical ?? { x: 50, y: 50 }
    const offset = presentation === 'history' ? HISTORY_SLOT_OFFSETS[slot.slot] : undefined
    const point = offset ? { x: clampCoordinate(basePoint.x + (offset.x ?? 0)), y: clampCoordinate(basePoint.y + (offset.y ?? 0)) } : basePoint
    const player = slot.playerId ? byId[slot.playerId] : undefined; if (!player) return draggable ? <EmptyPitchSlotDrop key={slot.slot} slot={slot} point={point} onClick={onEmptySlotClick ? () => onEmptySlotClick(slot) : undefined} /> : onEmptySlotClick ? <EmptyPitchSlot key={slot.slot} slot={slot} point={point} onClick={() => onEmptySlotClick(slot)} /> : null; const stats = statsByPlayer?.[player.id]; const matchPosition = (slot.matchPosition ?? tactical?.matchPosition ?? 'CM') as Position; const displayPosition = slot.displayPosition ?? tactical?.displayPosition ?? matchPosition
    const representativeTeam = teamById[slot.teamId ?? '']
    const badges = (
      <>
        {badgeMode === 'rating' && (
          <Badge
            colorClass={player.id === motmPlayerId ? 'bg-blue-500 text-white' : ratingColor(slot.avgRating)}
            className="absolute -right-3 -top-3 z-30 shadow-lg"
            size="large"
          >
            {slot.matches > 0 ? slot.avgRating.toFixed(slot.matches > 1 ? 2 : 1) : '--'}{player.id === motmPlayerId ? ' ★' : ''}
          </Badge>
        )}
      </>
    )
    const SlotContainer = !draggable && onSlotClick ? 'button' : 'div'
    return (
      <SlotContainer
        {...(SlotContainer === 'button' ? { type: 'button' as const, 'aria-label': playerDisplayName(player), disabled: disabledPlayerIds?.includes(player.id) } : {})}
        key={slot.slot}
        className={`absolute flex w-20 max-w-[23%] -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-transform ${substitutionSelection?.[player.id] || goalSelection?.[player.id] ? 'z-20 scale-110' : ''} ${disabledPlayerIds?.includes(player.id) && !goalSelection?.[player.id] ? 'opacity-40' : (Object.keys(goalSelection ?? {}).length || Object.keys(substitutionSelection ?? {}).length) && !goalSelection?.[player.id] && !substitutionSelection?.[player.id] ? 'opacity-70' : ''}`}
        style={{ left: `${point.x}%`, top: `${point.y}%` }}
        onClick={() => {
          if (!suppressClick.current && !disabledPlayerIds?.includes(player.id)) onSlotClick?.(slot)
        }}
      >
        {draggable ? <PitchSlotDrop slot={slot} draggable={draggable}>
          <PlayerIcon player={player} team={representativeTeam} position={showPositionBadge ? displayPosition : undefined} badges={badges} className="h-10 w-10 text-[11px]" />
        </PitchSlotDrop> : <PlayerIcon player={player} team={representativeTeam} position={showPositionBadge ? displayPosition : undefined} badges={badges} className="h-10 w-10 text-[11px]" />}
        {((stats?.goals ?? 0) > 0 || (stats?.assists ?? 0) > 0 || (showGoalkeeperSaves && matchPosition === 'GK')) && <div className="relative z-10 -mt-1 grid h-3.5 w-16 grid-cols-2 items-center text-[8px] font-bold leading-none text-white">
          <span className="justify-self-start">{(stats?.assists ?? 0) > 0 && <span className="flex items-center gap-0.5 rounded-full bg-black/80 px-1 py-0.5"><AssistIcon />{stats?.assists}</span>}</span>
          <span className="justify-self-end">{(stats?.goals ?? 0) > 0 ? <span className="flex items-center gap-0.5 rounded-full bg-black/80 px-1 py-0.5"><GoalIcon />{stats?.goals}</span> : showGoalkeeperSaves && matchPosition === 'GK' ? <span className="rounded-full bg-black/80 px-1 py-0.5">🧤 {stats?.saves ?? 0}</span> : null}</span>
        </div>}
        <div className="relative z-10 -mt-0.5 h-4 max-w-full truncate rounded-full bg-black/70 px-1.5 py-0.5 text-center text-[9px] font-semibold leading-tight">{playerCompactName(player)}</div>
        {goalSelection?.[player.id] && <span className="pointer-events-none flex items-center gap-1 rounded bg-black/80 px-1 text-[9px] font-bold text-emerald-300">{goalSelection[player.id] === 'scorer' ? <><GoalIcon /> SCORER</> : goalSelection[player.id] === 'assist' ? <><AssistIcon /> ASSIST</> : 'FAULT'}</span>}
        {substitutionSelection?.[player.id] && <span className="rounded bg-black/80 px-1 leading-none"><SubstitutionSelection direction={substitutionSelection[player.id]} /></span>}
        {outMinutesByPlayer?.[player.id] !== undefined && <span className="rounded bg-black/80 px-1 leading-none"><SubstitutionMarker direction="out" minute={outMinutesByPlayer[player.id]} /></span>}
      </SlotContainer>
    )
  })}</div>
  return draggable && !externalDnd ? <DndContext sensors={sensors} collisionDetection={nearest} onDragStart={() => { suppressClick.current = true }} onDragCancel={() => { suppressClick.current = false }} onDragEnd={endDrag}>{content}</DndContext> : content
}

function PitchSlotDrop({ slot, draggable, children }: { slot: Best11Slot; draggable: boolean; children: React.ReactNode }) { const drop = useDroppable({ id: `target:${slot.slot}` }); const drag = useDraggable({ id: `player:${slot.slot}`, disabled: !draggable || !slot.playerId }); return <div ref={drop.setNodeRef} className={drop.isOver ? 'rounded-full ring-2 ring-white/90' : ''}><div ref={draggable ? drag.setNodeRef : undefined} {...(draggable ? drag.listeners : {})} {...(draggable ? drag.attributes : {})} style={{ opacity: drag.isDragging ? 0.45 : 1, touchAction: draggable ? 'none' : undefined }}>{children}</div></div> }

function EmptyPitchSlotDrop({ slot, point, onClick }: { slot: Best11Slot; point: { x: number; y: number }; onClick?: () => void }) {
  const drop = useDroppable({ id: `target:${slot.slot}` })
  if (onClick) return <button ref={drop.setNodeRef} type="button" aria-label={`Empty ${slot.matchPosition ?? slot.position} slot`} onClick={onClick} className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 bg-transparent focus-visible:ring-2 focus-visible:ring-white" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
  return <div ref={drop.setNodeRef} aria-hidden="true" className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
}

function EmptyPitchSlot({ slot, point, onClick }: { slot: Best11Slot; point: { x: number; y: number }; onClick: () => void }) {
  return <button type="button" aria-label={`Empty ${slot.matchPosition ?? slot.position} slot`} onClick={onClick} className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 bg-transparent focus-visible:ring-2 focus-visible:ring-white" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
}
