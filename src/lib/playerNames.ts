export type ApiPlayerName = { name: string; firstname?: string; lastname?: string }

const clean = (value?: string) => value?.trim().replace(/\s+/g, ' ') ?? ''
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Keeps provider football names intact unless its abbreviated first initial can
 * be proven from the accompanying structured fields. This intentionally does
 * not attempt culture-specific "last word" parsing.
 */
export function deriveApiPlayerNames(input: ApiPlayerName): { fullName: string; displayName: string } {
  const name = clean(input.name)
  const firstname = clean(input.firstname)
  const lastname = clean(input.lastname)
  const abbreviated = name.match(/^([^\s.])\.\s+(.+)$/u)

  if (abbreviated) {
    const [, initial, remainder] = abbreviated
    const canExpand = Boolean(firstname && lastname && firstname[0]?.toLocaleLowerCase() === initial.toLocaleLowerCase() && remainder.localeCompare(lastname, undefined, { sensitivity: 'accent' }) === 0)
    return { fullName: canExpand ? `${firstname} ${lastname}` : name, displayName: remainder }
  }

  // A surname-style compact name is safe only when structured fields exactly
  // explain the whole natural football name (e.g. Trent Alexander-Arnold).
  const structuredFullName = firstname && lastname ? `${firstname} ${lastname}` : ''
  const matchesStructuredName = Boolean(structuredFullName && new RegExp(`^${escape(structuredFullName)}$`, 'iu').test(name))
  if (matchesStructuredName) return { fullName: name, displayName: lastname }

  // Natural provider names (including Vinícius Júnior) are more useful than a
  // longer legal firstname/lastname construction that may not be a football name.
  return { fullName: name || structuredFullName, displayName: name || structuredFullName }
}
