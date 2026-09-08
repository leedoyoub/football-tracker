import type { Team } from '../types'
const team = (id: string, name: string, abbreviation: string, externalTeamId: number, primaryColor: Team['primaryColor']): Team => ({ id, name, shortName: abbreviation, abbreviation, externalTeamId, logo: `https://media.api-sports.io/football/teams/${externalTeamId}.png`, visualStyle: 'solid', primaryColor, jerseyNumberColor: 'white' })
export const STATIC_TEAMS: Team[] = [
  team('real-madrid','Real Madrid','RMA',541,'white'), team('barcelona','Barcelona','BAR',529,'blue'), team('atletico-madrid','Atlético Madrid','ATM',530,'red'),
  team('arsenal','Arsenal','ARS',42,'red'), team('manchester-city','Manchester City','MCI',50,'blue'), team('liverpool','Liverpool','LIV',40,'red'), team('manchester-united','Manchester United','MUN',33,'red'), team('tottenham-hotspur','Tottenham Hotspur','TOT',47,'white'), team('chelsea','Chelsea','CHE',49,'blue'),
  team('bayern-munich','Bayern Munich','BAY',157,'red'), team('ac-milan','AC Milan','MIL',489,'red'), team('inter-milan','Inter Milan','INT',505,'blue'), team('juventus','Juventus','JUV',496,'black'), team('paris-saint-germain','Paris Saint-Germain','PSG',85,'blue'),
]
export function withStaticTeams(legacyTeams: Team[] = []): Team[] { const byId = new Map(legacyTeams.map(team => [team.id, team])); return STATIC_TEAMS.map(team => ({ ...(byId.get(team.id) ?? {}), ...team })) }
