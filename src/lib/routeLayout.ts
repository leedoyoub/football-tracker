import type { View } from '../types'

/** Route-scoped scroll policy. Intentional horizontal surfaces keep their own scroll owners. */
export function appContentOverflowClass(view: View): string {
  return view.name === 'new-match'
    ? 'min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-x-none touch-pan-y'
    : 'overflow-y-auto'
}
