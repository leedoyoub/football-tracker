import type { Team, TeamPlayStyle } from '../types'
const team = (id: string, name: string, abbreviation: string, externalTeamId: number, primaryColor: Team['primaryColor']): Team => ({ id, name, shortName: abbreviation, abbreviation, externalTeamId, logo: `https://media.api-sports.io/football/teams/${externalTeamId}.png`, visualStyle: 'solid', primaryColor, jerseyNumberColor: 'white' })
export const STATIC_TEAMS: Team[] = [
  team('real-madrid','Real Madrid','RMA',541,'white'), team('barcelona','Barcelona','BAR',529,'blue'), team('atletico-madrid','Atlético Madrid','ATM',530,'red'),
  team('arsenal','Arsenal','ARS',42,'red'), team('manchester-city','Manchester City','MCI',50,'blue'), team('liverpool','Liverpool','LIV',40,'red'), team('manchester-united','Manchester United','MUN',33,'red'), team('tottenham-hotspur','Tottenham Hotspur','TOT',47,'white'), team('chelsea','Chelsea','CHE',49,'blue'),
  team('bayern-munich','Bayern Munich','BAY',157,'red'), team('borussia-dortmund','Borussia Dortmund','BVB',165,'yellow'), team('ac-milan','AC Milan','MIL',489,'red'), team('inter-milan','Inter Milan','INT',505,'blue'), team('juventus','Juventus','JUV',496,'black'), team('paris-saint-germain','Paris Saint-Germain','PSG',85,'blue'),
  team('inter-miami','Inter Miami CF','MIA',9568,'red'),
]

const CATALOG_PLAY_STYLES: Record<string, TeamPlayStyle> = {
  barcelona: 'possession', arsenal: 'possession', 'manchester-city': 'possession', chelsea: 'possession', 'bayern-munich': 'possession', 'paris-saint-germain': 'possession',
  liverpool: 'short-pass-counter', 'manchester-united': 'short-pass-counter', 'tottenham-hotspur': 'short-pass-counter', 'inter-milan': 'short-pass-counter', 'inter-miami': 'short-pass-counter',
  'real-madrid': 'long-pass-counter', 'atletico-madrid': 'long-pass-counter', 'borussia-dortmund': 'long-pass-counter', 'ac-milan': 'long-pass-counter', juventus: 'long-pass-counter',
}

/**
 * The catalog is authoritative for its 16 real teams, including old saved
 * snapshots whose playStyle field predates a catalog correction. Custom teams
 * continue to use their saved value.
 */
export function teamPlayStyle(team: Team | undefined): TeamPlayStyle | undefined {
  if (!team) return undefined
  const catalog = STATIC_TEAMS.find(item => item.id === team.id || (team.externalTeamId !== undefined && item.externalTeamId === team.externalTeamId))
  return catalog ? CATALOG_PLAY_STYLES[catalog.id] : team.playStyle
}

/**
 * Adds catalog entries without replacing a user's existing teams or their
 * properties. Matching either stable ID or upstream ID prevents real-team
 * duplicates from older local/cloud snapshots.
 */
export function withStaticTeams(existingTeams: Team[] = []): Team[] {
  if (!existingTeams.length) return STATIC_TEAMS
  const teams = [...existingTeams]
  let added = false
  const hasTeam = (candidate: Team) => teams.some(team => team.id === candidate.id || (candidate.externalTeamId !== undefined && team.externalTeamId === candidate.externalTeamId))
  for (const candidate of STATIC_TEAMS) {
    if (hasTeam(candidate)) continue
    const after = candidate.id === 'borussia-dortmund'
      ? teams.findIndex(team => team.id === 'bayern-munich' || team.externalTeamId === 157)
      : -1
    if (after >= 0) teams.splice(after + 1, 0, candidate)
    else teams.push(candidate)
    added = true
  }
  return added ? teams : existingTeams
}

/** Resolves the 16 official catalog identities to their current preserved records. */
export function currentStaticTeams(teams: Team[]): Team[] {
  return STATIC_TEAMS.map(catalog => teams.find(team => team.id === catalog.id || team.externalTeamId === catalog.externalTeamId) ?? catalog)
}
