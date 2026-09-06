import type { Best11Slot, Player, Position, Team } from '../types'
import { TeamIcon, jerseyColor } from './TeamIcon'
import { playerDisplayName } from './ui'
import { useRef } from 'react'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'

export type TacticalSlot = { slot: string; position: Position; matchPosition: Position; x: number; y: number }

const grid: Record<string, TacticalSlot> = {
  LST: { slot: 'LST', position: 'LST', matchPosition: 'LST', x: 35, y: 14 }, ST: { slot: 'ST', position: 'ST', matchPosition: 'ST', x: 50, y: 14 }, RST: { slot: 'RST', position: 'RST', matchPosition: 'RST', x: 65, y: 14 },
  LW: { slot: 'LW', position: 'LW', matchPosition: 'LW', x: 17, y: 25 }, RW: { slot: 'RW', position: 'RW', matchPosition: 'RW', x: 83, y: 25 }, WING_CENTER: { slot: 'WING_CENTER', position: 'SS', matchPosition: 'SS', x: 50, y: 25 },
  LCAM: { slot: 'LCAM', position: 'CAM', matchPosition: 'CAM', x: 25, y: 36 }, CAM: { slot: 'CAM', position: 'CAM', matchPosition: 'CAM', x: 50, y: 36 }, RCAM: { slot: 'RCAM', position: 'CAM', matchPosition: 'CAM', x: 75, y: 36 },
  LM: { slot: 'LM', position: 'LM', matchPosition: 'LM', x: 13, y: 48 }, LCM: { slot: 'LCM', position: 'LCM', matchPosition: 'LCM', x: 35, y: 48 }, CM: { slot: 'CM', position: 'CM', matchPosition: 'CM', x: 50, y: 48 }, RCM: { slot: 'RCM', position: 'RCM', matchPosition: 'RCM', x: 65, y: 48 }, RM: { slot: 'RM', position: 'RM', matchPosition: 'RM', x: 87, y: 48 },
  LDM: { slot: 'LDM', position: 'LDM', matchPosition: 'LDM', x: 34, y: 59 }, CDM: { slot: 'CDM', position: 'CDM', matchPosition: 'CDM', x: 50, y: 59 }, RDM: { slot: 'RDM', position: 'RDM', matchPosition: 'RDM', x: 66, y: 59 },
  LB: { slot: 'LB', position: 'LB', matchPosition: 'LB', x: 13, y: 75 }, LCB: { slot: 'LCB', position: 'LCB', matchPosition: 'LCB', x: 32, y: 75 }, CB: { slot: 'CB', position: 'CB', matchPosition: 'CB', x: 50, y: 75 }, RCB: { slot: 'RCB', position: 'RCB', matchPosition: 'RCB', x: 68, y: 75 }, RB: { slot: 'RB', position: 'RB', matchPosition: 'RB', x: 87, y: 75 },
  GK: { slot: 'GK', position: 'GK', matchPosition: 'GK', x: 50, y: 88 },
}

export const UNIVERSAL_TACTICAL_SLOTS = Object.values(grid)
const formation = (...ids: string[]) => ids.map((id) => grid[id])
export const FORMATION_SLOTS: Record<string, TacticalSlot[]> = {
  '4-3-3': formation('LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW', 'GK'),
  '4-2-3-1': formation('LB', 'LCB', 'RCB', 'RB', 'LDM', 'RDM', 'LW', 'CAM', 'RW', 'ST', 'GK'),
  '4-4-2': formation('LB', 'LCB', 'RCB', 'RB', 'LM', 'LCM', 'RCM', 'RM', 'LST', 'RST', 'GK'),
}

export function getPositionColor(position: Position): string {
  if (['LW', 'LST', 'ST', 'RST', 'SS', 'RW'].includes(position)) return 'bg-red-500 text-white'
  if (['CAM', 'LDM', 'CDM', 'RDM', 'LM', 'LCM', 'CM', 'RCM', 'RM'].includes(position)) return 'bg-emerald-500 text-white'
  return position === 'GK' ? 'bg-yellow-400 text-black' : 'bg-blue-500 text-white'
}

const homePositions: Record<string, { x: number; y: number }> = {
  LW: { x: 20, y: 22 }, ST: { x: 50, y: 22 }, RW: { x: 80, y: 22 }, LCM: { x: 25, y: 46 }, CM: { x: 50, y: 46 }, RCM: { x: 75, y: 46 }, LB: { x: 13, y: 69 }, LCB: { x: 38, y: 69 }, RCB: { x: 62, y: 69 }, RB: { x: 87, y: 69 }, GK: { x: 50, y: 88 },
}
const ratingColor = (rating: number) => rating >= 7.3 ? 'bg-emerald-500 text-white' : rating >= 6 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'

function GoalIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-2.5 w-2.5 fill-none stroke-current stroke-2"><circle cx="12" cy="12" r="9" /><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Zm-6 4 3 1m9-1 3 1m-10 8 1-3m2 3-1-3" /></svg>
}

function AssistIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-2.5 w-2.5 fill-none stroke-current stroke-2"><path d="M4 15.5c2.5-2.8 5.2-4.6 8.1-5.4l3.2.8 3.1 3.1-1.9 2.7-4.1.2-2.2 2.3-4.8-.4L4 15.5Z" /><path d="m12.1 10.1 1.1-3 2.2.5 1.1 3.3M7.4 14.5l1.8 1.1" /></svg>
}

function PlayerMarker({ player, team, badge }: { player: Player; team?: Team; badge: React.ReactNode }) {
  const contents = <><span className="absolute inset-0 overflow-hidden rounded-full">{player.image && <img src={player.image} alt="" className="h-full w-full object-cover" />}</span><span className="relative z-10" style={team ? { color: jerseyColor(team) } : undefined}>{player.number}</span>{badge}</>
  return team
    ? <TeamIcon team={team} className="relative h-10 w-10 text-[11px] font-black shadow-lg">{contents}</TeamIcon>
    : <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-[11px] font-black text-black shadow-lg">{contents}</div>
}

export function Pitch({ slots, players, teams, statsByPlayer, badgeMode = 'rating', motmPlayerId, onSlotClick, layout = 'tactical', draggable = false, externalDnd = false, onSlotDrop }: { slots: Best11Slot[]; players: Player[]; teams?: Team[]; statsByPlayer?: Record<string, { goals: number; assists: number }>; badgeMode?: 'rating' | 'position'; motmPlayerId?: string; onSlotClick?: (slot: Best11Slot) => void; layout?: 'tactical' | 'free'; draggable?: boolean; externalDnd?: boolean; onSlotDrop?: (activeSlot: string, targetSlot: string) => void }) {
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
  const content = <div className="relative mx-auto aspect-[3/4] w-full overflow-hidden rounded-lg border border-emerald-700/50 pitch-grass"><div className="pointer-events-none absolute inset-2 border border-white/40"><div className="absolute left-1/2 top-0 h-14 w-24 -translate-x-1/2 border border-t-0 border-white/40" /><div className="absolute bottom-0 left-1/2 h-14 w-24 -translate-x-1/2 border border-b-0 border-white/40" /><div className="absolute left-0 right-0 top-1/2 border-t border-white/40" /><div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" /></div>{slots.map((slot) => {
    const tactical = grid[slot.slot] ?? grid.CM; const point = layout === 'free' ? homePositions[slot.slot] ?? tactical : tactical; const player = slot.playerId ? byId[slot.playerId] : undefined; if (!player) return draggable ? <EmptyPitchSlotDrop key={slot.slot} slot={slot} point={point} /> : null; const stats = statsByPlayer?.[player.id]; const matchPosition = (slot.matchPosition ?? tactical.matchPosition) as Position
    const representativeTeam = teamById[slot.teamId ?? '']
    const badge = <span className={`absolute -right-4 -top-2 z-20 rounded px-1 py-0.5 text-[8px] font-black shadow ${badgeMode === 'position' ? getPositionColor(matchPosition) : player.id === motmPlayerId ? 'bg-blue-500 text-white' : ratingColor(slot.avgRating)}`}>{badgeMode === 'position' ? matchPosition : `${slot.avgRating.toFixed(1)}${player.id === motmPlayerId ? ' ★' : ''}`}</span>
    return <div key={slot.slot} className="absolute flex w-20 max-w-[23%] -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => { if (!suppressClick.current) onSlotClick?.(slot) }}><PitchSlotDrop slot={slot} draggable={draggable}><PlayerMarker player={player} team={representativeTeam} badge={badge} /></PitchSlotDrop><div className="relative z-10 -mt-1 grid h-3.5 w-16 grid-cols-2 items-center text-[8px] font-bold leading-none text-white"><span className="justify-self-start">{(stats?.assists ?? 0) > 0 && <span className="flex items-center gap-0.5 rounded-full bg-black/80 px-1 py-0.5"><AssistIcon />{stats?.assists}</span>}</span><span className="justify-self-end">{(stats?.goals ?? 0) > 0 && <span className="flex items-center gap-0.5 rounded-full bg-black/80 px-1 py-0.5"><GoalIcon />{stats?.goals}</span>}</span></div><div className="relative z-10 -mt-0.5 h-4 max-w-full truncate rounded-full bg-black/70 px-1.5 py-0.5 text-center text-[9px] font-semibold leading-tight">{playerDisplayName(player)}</div></div>
  })}</div>
  return draggable && !externalDnd ? <DndContext sensors={sensors} collisionDetection={nearest} onDragStart={() => { suppressClick.current = true }} onDragCancel={() => { suppressClick.current = false }} onDragEnd={endDrag}>{content}</DndContext> : content
}

function PitchSlotDrop({ slot, draggable, children }: { slot: Best11Slot; draggable: boolean; children: React.ReactNode }) { const drop = useDroppable({ id: `target:${slot.slot}` }); const drag = useDraggable({ id: `player:${slot.slot}`, disabled: !draggable || !slot.playerId }); return <div ref={drop.setNodeRef} className={drop.isOver ? 'rounded-full ring-2 ring-white/90' : ''}><div ref={draggable ? drag.setNodeRef : undefined} {...(draggable ? drag.listeners : {})} {...(draggable ? drag.attributes : {})} style={{ opacity: drag.isDragging ? 0.45 : 1, touchAction: draggable ? 'none' : undefined }}>{children}</div></div> }

function EmptyPitchSlotDrop({ slot, point }: { slot: Best11Slot; point: { x: number; y: number } }) {
  const drop = useDroppable({ id: `target:${slot.slot}` })
  return <div ref={drop.setNodeRef} aria-hidden="true" className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
}
