import type { GroupedMatchChangeItem, GroupedMatchChange } from '../engine/matchChanges'

export type ChangePresentation = { id: string; title: string; primary: string; secondary: string[]; category: 'takeover' | 'ranking' | 'milestone' | 'personal-best' | 'rare' | 'event'; fallback: boolean }

function changeCategory(item: GroupedMatchChangeItem): ChangePresentation['category'] {
  if (item.id.startsWith('rare:')) return 'rare'
  if (item.kind === 'ranking') return item.label.includes('takes #1') ? 'takeover' : 'ranking'
  if (item.kind === 'record') return 'personal-best'
  if (item.kind === 'milestone') return 'milestone'
  return 'event'
}

const categoryWeight: Record<ChangePresentation['category'], number> = { rare: 0, takeover: 1, ranking: 2, 'personal-best': 3, milestone: 4, event: 5 }

/** Converts canonical groups into display-only hierarchy without dropping or duplicating them. */
export function presentMatchChanges(changes: GroupedMatchChange[]): ChangePresentation[] {
  return changes.map(change => {
    const ordered = change.items.map(item => ({ label: item.label, category: changeCategory(item) })).sort((left, right) => categoryWeight[left.category] - categoryWeight[right.category])
    const primary = ordered[0] ?? { label: change.detail, category: 'event' as const }
    return { id: change.id, title: change.playerId ? change.title.replace(/ · Changes$/, '') : change.title || 'Match update', primary: primary.label, secondary: ordered.slice(1).map(item => item.label), category: primary.category, fallback: !change.playerId }
  })
}
