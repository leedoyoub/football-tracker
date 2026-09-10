/** Comparison-only normalization; returned names always retain original spelling. */
export function normalizePlayerSearch(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

export function playerSearchMatches(query: string, player: { name?: string; firstname?: string; lastname?: string; fullName?: string; displayName?: string }): boolean {
  const needle = normalizePlayerSearch(query)
  if (!needle) return false
  return [player.name, player.firstname, player.lastname, player.fullName, player.displayName, [player.firstname, player.lastname].filter(Boolean).join(' ')].some(value => normalizePlayerSearch(value).includes(needle))
}
