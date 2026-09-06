import type { Position } from '../types'

const DEFENDERS: Position[] = ['LB', 'LWB', 'LCB', 'CB', 'RCB', 'RWB', 'RB']
const MIDFIELDERS: Position[] = ['LDM', 'CDM', 'RDM', 'LM', 'LCM', 'CM', 'RCM', 'RM']
const ATTACKERS: Position[] = ['LW', 'LST', 'ST', 'RST', 'SS', 'RW']

/** Calculates the displayed shape from the current tactical slots, never player best positions. */
export function calculateFormation(matchPositions: Position[]): string {
  const defenders = matchPositions.filter((position) => DEFENDERS.includes(position)).length
  const cams = matchPositions.filter((position) => position === 'CAM').length
  const midfielders = matchPositions.filter((position) => MIDFIELDERS.includes(position)).length
  const attackers = matchPositions.filter((position) => ATTACKERS.includes(position)).length
  return cams > 0
    ? `${defenders}-${midfielders}-${cams}-${attackers}`
    : `${defenders}-${midfielders}-${attackers}`
}

const ZONES: { position: Position; x: number; y: number }[] = [
  { position: 'LW', x: 0.17, y: 0.1 },
  { position: 'ST', x: 0.5, y: 0.1 },
  { position: 'RW', x: 0.83, y: 0.1 },
  { position: 'CAM', x: 0.5, y: 0.28 },
  { position: 'LM', x: 0.17, y: 0.45 },
  { position: 'CM', x: 0.5, y: 0.45 },
  { position: 'RM', x: 0.83, y: 0.45 },
  { position: 'CDM', x: 0.5, y: 0.62 },
  { position: 'LB', x: 0.17, y: 0.78 },
  { position: 'CB', x: 0.5, y: 0.78 },
  { position: 'RB', x: 0.83, y: 0.78 },
  { position: 'GK', x: 0.5, y: 0.96 },
]

export function getPositionFromCoordinates(x: number, y: number): Position {
  const normalizedX = Math.max(0, Math.min(1, x))
  const normalizedY = Math.max(0, Math.min(1, y))
  return ZONES.reduce((closest, zone) => {
    const distance = (zone.x - normalizedX) ** 2 + (zone.y - normalizedY) ** 2
    const closestDistance = (closest.x - normalizedX) ** 2 + (closest.y - normalizedY) ** 2
    return distance < closestDistance ? zone : closest
  }).position
}

export const FORMATION_ZONES = ZONES
