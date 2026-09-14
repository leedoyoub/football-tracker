import type { Position } from '../types.ts'

export type TacticalSlotDefinition = {
  id: string
  ratingPosition: Position
  displayPosition: string
  x: number
  y: number
}

/** The only tactical-slot catalogue. Rating semantics and UI labels are derived
 * from this catalogue; neither is allowed to become a slot key. */
const slots: Array<[string, Position, string, number, number]> = [
  ['LST', 'LST', 'LST', 35, 14], ['ST', 'ST', 'ST', 50, 14], ['RST', 'RST', 'RST', 65, 14],
  ['LW', 'LW', 'LW', 17, 25], ['WING_CENTER', 'SS', 'SS', 50, 25], ['RW', 'RW', 'RW', 83, 25],
  ['LCAM', 'CAM', 'LAM', 30, 36], ['CAM', 'CAM', 'CAM', 50, 36], ['RCAM', 'CAM', 'RAM', 70, 36],
  ['LM', 'LM', 'LM', 13, 48], ['LCM', 'LCM', 'LCM', 35, 48], ['CM', 'CM', 'CM', 50, 48], ['RCM', 'RCM', 'RCM', 65, 48], ['RM', 'RM', 'RM', 87, 48],
  ['LDM', 'LDM', 'LDM', 34, 59], ['CDM', 'CDM', 'CDM', 50, 59], ['RDM', 'RDM', 'RDM', 66, 59],
  ['LB', 'LB', 'LB', 13, 75], ['LCB', 'LCB', 'LCB', 32, 75], ['CB', 'CB', 'CB', 50, 75], ['RCB', 'RCB', 'RCB', 68, 75], ['RB', 'RB', 'RB', 87, 75],
  ['GK', 'GK', 'GK', 50, 88],
]

export const TACTICAL_SLOT_DEFINITIONS: TacticalSlotDefinition[] = slots.map(([id, ratingPosition, displayPosition, x, y]) => ({ id, ratingPosition, displayPosition, x, y }))

export const tacticalSlotById = Object.fromEntries(TACTICAL_SLOT_DEFINITIONS.map(slot => [slot.id, slot])) as Record<string, TacticalSlotDefinition>
export const ratingPositionForSlot = (slotId: string): Position | undefined => tacticalSlotById[slotId]?.ratingPosition
export const displayPositionForSlot = (slotId: string): string | undefined => tacticalSlotById[slotId]?.displayPosition

const namedFormations: Record<string, string[]> = {
  '4-3-3': ['LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW', 'GK'],
  '4-2-1-3': ['LB', 'LCB', 'RCB', 'RB', 'LDM', 'RDM', 'CAM', 'LW', 'ST', 'RW', 'GK'],
  '4-2-3-1': ['LB', 'LCB', 'RCB', 'RB', 'LDM', 'RDM', 'LCAM', 'CAM', 'RCAM', 'ST', 'GK'],
  '4-4-2': ['LB', 'LCB', 'RCB', 'RB', 'LM', 'LCM', 'RCM', 'RM', 'LST', 'RST', 'GK'],
  '3-4-1-2': ['LCB', 'CB', 'RCB', 'LM', 'LCM', 'RCM', 'RM', 'CAM', 'LST', 'RST', 'GK'],
  '3-5-2': ['LCB', 'CB', 'RCB', 'LM', 'LCM', 'CM', 'RCM', 'RM', 'LST', 'RST', 'GK'],
}
export function tacticalSlotsForFormation(name: string | undefined): string[] | undefined { return name ? namedFormations[name] : undefined }
