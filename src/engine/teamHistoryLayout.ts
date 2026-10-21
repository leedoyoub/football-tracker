import type { Best11Slot } from '../types'

type Group = 'GK' | 'DEF' | 'MID' | 'FW'
const baseY: Record<Group, number> = { GK: 88, DEF: 69, MID: 46, FW: 22 }
const spacing: Record<number, number[]> = { 1: [50], 2: [35, 65], 3: [20, 50, 80], 4: [13, 38, 62, 87] }

/** Team-only coordinates; official award and saved match layouts keep their existing geometry. */
export function teamHistoryLayout(slots: Best11Slot[]): Best11Slot[] {
  const groups = { GK: [], DEF: [], MID: [], FW: [] } as Record<Group, number[]>
  slots.forEach((slot, index) => {
    const group = slot.displayPosition as Group
    if (groups[group]) groups[group].push(index)
  })
  const points = new Map<number, { x: number; y: number }>()
  const expanded = ['FW', 'MID', 'DEF'].some(group => groups[group as Group].length >= 5)
  if (expanded) {
    // Give crowded lines full vertical card clearance. Five keeps its specified
    // odd/even zigzag; larger groups use at most four cards in each physical row.
    const lines = (['FW', 'MID', 'DEF'] as const).flatMap(group => {
      const indices = groups[group]
      if (indices.length === 5) return [
        { group, indices: indices.filter((_, index) => index % 2 === 0), xs: [13, 50, 87] },
        { group, indices: indices.filter((_, index) => index % 2 === 1), xs: [34, 66] },
      ]
      const rowCount = Math.ceil(indices.length / 4)
      let offset = 0
      return Array.from({ length: rowCount }, (_, row) => {
        const size = Math.ceil((indices.length - offset) / (rowCount - row))
        const line = indices.slice(offset, offset + size); offset += size
        return { group, indices: line, xs: group === 'MID' && size === 3 ? [25, 50, 75] : spacing[size] }
      })
    })
    lines.forEach(({ group, indices, xs }, row) => {
      const y = lines.length > 1 ? 14 + row * 56 / (lines.length - 1) : baseY[group]
      indices.forEach((index, column) => points.set(index, { x: xs[column], y }))
    })
  } else {
    for (const group of ['FW', 'MID', 'DEF'] as const) {
      const indices = groups[group]
      const xs = group === 'MID' && indices.length === 3 ? [25, 50, 75] : spacing[indices.length]
      indices.forEach((index, column) => points.set(index, { x: xs[column], y: baseY[group] }))
    }
  }
  groups.GK.forEach(index => points.set(index, { x: 50, y: baseY.GK }))
  return slots.map((slot, index) => ({ ...slot, ...points.get(index) }))
}
