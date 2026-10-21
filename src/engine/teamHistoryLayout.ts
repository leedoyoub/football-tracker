import type { Best11Slot } from '../types'

type Group = 'GK' | 'DEF' | 'MID' | 'FW'
const baseY: Record<Group, number> = { GK: 89, DEF: 69, MID: 46, FW: 22 }
const spacing: Record<number, number[]> = { 1: [50], 2: [35, 65], 3: [17.5, 50, 82.5], 4: [12.25, 37.42, 62.58, 87.75] }

/** Team-only coordinates; official award and saved match layouts keep their existing geometry. */
export function teamHistoryLayout(slots: Best11Slot[], statsByPlayer: Record<string, { goals: number; assists: number }> = {}): Best11Slot[] {
  const groups = { GK: [], DEF: [], MID: [], FW: [] } as Record<Group, number[]>
  slots.forEach((slot, index) => {
    const group = slot.displayPosition as Group
    if (groups[group]) groups[group].push(index)
  })
  const points = new Map<number, { x: number; y: number }>()
  const physicalRows = (count: number) => count === 5 ? 2 : Math.ceil(count / 4)
  const rowCounts = { FW: physicalRows(groups.FW.length), MID: physicalRows(groups.MID.length), DEF: physicalRows(groups.DEF.length) }
  let totalRows = rowCounts.FW + rowCounts.MID + rowCounts.DEF
  // Oversized cumulative counters can need more than one card's width. Use
  // otherwise spare rows first, without changing the pitch, text or icon sizes.
  // Four outfield rows plus GK is the 264px fixed-pitch vertical capacity.
  for (const group of ['DEF', 'MID', 'FW'] as const) {
    const wide = groups[group].some(index => {
      const stats = statsByPlayer[slots[index].playerId ?? '']
      return stats && stats.goals > 0 && stats.assists > 0 && String(stats.goals).length + String(stats.assists).length >= 6
    })
    const proposed = Math.ceil(groups[group].length / 3)
    if (wide && proposed > rowCounts[group] && totalRows + proposed - rowCounts[group] <= 4) {
      totalRows += proposed - rowCounts[group]; rowCounts[group] = proposed
    }
  }
  const expanded = totalRows > 3 || ['FW', 'MID', 'DEF'].some(group => groups[group as Group].length >= 5)
  if (expanded) {
    // The fixed 3:4 pitch has 350px inside its border at 264px width. Team
    // cards with stats need 64px plus 4px for the rating/crest protrusion.
    // Five physical rows fit with 68.25px between centers (10.5%..88.5%).
    const lines = (['FW', 'MID', 'DEF'] as const).flatMap(group => {
      const indices = groups[group]
      if (indices.length === 5) return [
        { group, indices: indices.filter((_, index) => index % 2 === 0), xs: [13, 50, 87] },
        { group, indices: indices.filter((_, index) => index % 2 === 1), xs: [34, 66] },
      ]
      const rowCount = rowCounts[group]
      const rows = Array.from({ length: rowCount }, (_, row) => {
        const size = Math.floor(indices.length / rowCount) + (row < indices.length % rowCount ? 1 : 0)
        return { group, points: spacing[size].map(x => ({ x, row, index: 0 })) }
      })
      // Assign in horizontal order, so side-role ordering still places the
      // first/last selection on the outer edges even across several rows.
      rows.flatMap(row => row.points).sort((a, b) => a.x - b.x || a.row - b.row).forEach((point, index) => { point.index = indices[index] })
      return rows.map(row => ({ group, indices: row.points.map(point => point.index), xs: row.points.map(point => point.x) }))
    })
    lines.forEach(({ indices, xs }, row) => {
      const y = 10.5 + row * 78 / lines.length
      indices.forEach((index, column) => points.set(index, { x: xs[column], y }))
    })
  } else {
    for (const group of ['FW', 'MID', 'DEF'] as const) {
      const indices = groups[group]
      const xs = spacing[indices.length]
      indices.forEach((index, column) => points.set(index, { x: xs[column], y: baseY[group] }))
    }
  }
  groups.GK.forEach(index => points.set(index, { x: 50, y: expanded ? 88.5 : baseY.GK }))
  return slots.map((slot, index) => ({ ...slot, ...points.get(index) }))
}
