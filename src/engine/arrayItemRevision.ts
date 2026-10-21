type Entry = { items: readonly unknown[]; revision: number }
const revisions = new WeakMap<readonly unknown[], Entry>()

/** Legacy callers replace items in place; Store callers replace the array.
 * Compare references only, without serializing or walking Match payloads. */
export function arrayItemRevision<T>(items: readonly T[]): number {
  const previous = revisions.get(items)
  if (previous && previous.items.length === items.length && previous.items.every((item, index) => item === items[index])) return previous.revision
  const revision = (previous?.revision ?? -1) + 1
  revisions.set(items, { items: items.slice(), revision })
  return revision
}
