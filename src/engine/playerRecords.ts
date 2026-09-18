export type PlayerRecordGroup = {
  id: string
  title: string
  rows: { id: string; name: string; numeric: number; value: string; detail: string; rank: number }[]
}

type RatingRecordRow = { id: string; name: string; metrics: { eightRatings: number; nineRatings: number; tenRatings: number }; detail?: string }

function rank(rows: { id: string; name: string; numeric: number; value: string; detail: string }[]) {
  let prior: number | undefined
  let priorRank = 0
  return rows.slice().sort((a, b) => b.numeric - a.numeric || a.name.localeCompare(b.name)).map((row, index) => {
    const next = prior === row.numeric ? priorRank : index + 1
    prior = row.numeric
    priorRank = next
    return { ...row, rank: next }
  })
}

/** Shared Player Records groups; exact 10.0 remains a strict raw-rating count. */
export function playerRecordGroups(rows: RatingRecordRow[]): PlayerRecordGroup[] {
  const detail = (row: RatingRecordRow) => row.detail ?? '0 apps'
  const group = (id: string, title: string, metric: (row: RatingRecordRow) => number, recordDetail?: string): PlayerRecordGroup => ({ id, title, rows: rank(rows.map(row => ({ id: row.id, name: row.name, numeric: metric(row), value: String(metric(row)), detail: recordDetail ?? detail(row) }))) })
  return [
    group('eight', 'Most 8.0+ Ratings', row => row.metrics.eightRatings),
    group('nine', 'Most 9.0+ Ratings', row => row.metrics.nineRatings),
    group('ten', 'Most 10.0 Ratings', row => row.metrics.tenRatings, 'final canonical 10.0 ratings'),
  ]
}
