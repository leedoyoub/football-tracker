import type { Team } from '../types'

const crest = (letters: string, fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${fill}"/><circle cx="32" cy="32" r="24" fill="#111"/><text x="32" y="38" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700" fill="white">${letters}</text></svg>`)}`

/**
 * Canonical, code-defined teams. Keep IDs stable forever: matches and player
 * history reference these IDs rather than a display name or external service.
 */
export const STATIC_TEAMS: Team[] = [
  { id: 'northside', name: 'Northside FC', shortName: 'NSH', abbreviation: 'NSH', logo: crest('NSH', '#2563eb'), visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white' },
  { id: 'harbor', name: 'Harbor United', shortName: 'HBR', abbreviation: 'HBR', logo: crest('HBR', '#dc2626'), visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white' },
]

/** Preserves imported/old IDs so historical matches never lose their team. */
export function withStaticTeams(legacyTeams: Team[] = []): Team[] {
  const staticById = new Map(STATIC_TEAMS.map(team => [team.id, team]))
  const legacyOnly = legacyTeams.filter(team => !staticById.has(team.id))
  return [...STATIC_TEAMS.map(team => ({ ...(legacyTeams.find(old => old.id === team.id) ?? {}), ...team })), ...legacyOnly]
}
