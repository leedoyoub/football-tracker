import type { View } from '../types'

/** Route-scoped scroll policy. Intentional horizontal surfaces keep their own scroll owners. */
export function appContentOverflowClass(view: View): string {
  return view.name === 'new-match'
    // `clip`, unlike `hidden`, does not create a horizontal scroll container.
    // This is deliberately route-scoped: carousel and bracket routes retain
    // their own horizontal scroll owners.
    ? 'w-full min-w-0 max-w-full overflow-x-clip overflow-y-auto overscroll-x-none touch-pan-y'
    : 'overflow-y-auto'
}
