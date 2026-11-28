export function longestMatchStreaks<T extends { match: { id: string } }>(rows: readonly T[], passes: (row: T) => boolean) {
  let start = 0
  let length = 0
  let starts: number[] = []
  for (const [index, row] of rows.entries()) {
    if (!passes(row)) {
      start = index + 1
      continue
    }
    const size = index + 1 - start
    if (size > length) {
      length = size
      starts = [start]
    } else if (size === length) starts.push(start)
  }
  return { length, matchIds: starts.map(start => rows.slice(start, start + length).map(row => row.match.id)) }
}
