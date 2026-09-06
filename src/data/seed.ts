import type { Appearance, Match, MatchEvent, Player, Position, Team } from '../types'

const SEASON = 'Season 1'

export const seedTeams: Team[] = [
  { id: 'northside', name: 'Northside FC', shortName: 'NSH', color: '#2563eb' },
  { id: 'harbor', name: 'Harbor United', shortName: 'HBR', color: '#dc2626' },
]

function p(
  id: string,
  teamId: string,
  name: string,
  position: Position,
  number: number,
): Player {
  return { id, teamId, name, fullName: name, displayName: name, position, number }
}

export const seedPlayers: Player[] = [
  p('n1', 'northside', 'Noah Hale', 'GK', 1),
  p('n2', 'northside', 'Kai Benton', 'RB', 2),
  p('n3', 'northside', 'Mateo Cruz', 'CB', 3),
  p('n4', 'northside', 'Owen Silva', 'CB', 4),
  p('n5', 'northside', 'Leo Cole', 'LB', 5),
  p('n6', 'northside', 'Rico Voss', 'CDM', 6),
  p('n7', 'northside', 'Jun Park', 'CM', 8),
  p('n8', 'northside', 'Ellis Holm', 'CM', 14),
  p('n9', 'northside', 'Marco Vega', 'ST', 9),
  p('n10', 'northside', 'Arlo Reiss', 'CAM', 10),
  p('n11', 'northside', 'Amin Farouk', 'LW', 11),
  p('n12', 'northside', 'Jin Cho', 'RW', 7),
  p('n13', 'northside', 'Sam Quinn', 'GK', 13),
  p('n14', 'northside', 'Theo Marsh', 'CB', 15),
  p('n15', 'northside', 'Nico Brandt', 'CM', 16),
  p('n16', 'northside', 'Ilya Petrov', 'ST', 18),
  p('h1', 'harbor', 'Erik Lund', 'GK', 1),
  p('h2', 'harbor', 'Dario Nunez', 'RB', 22),
  p('h3', 'harbor', 'Ben Shaw', 'CB', 5),
  p('h4', 'harbor', 'Yuri Petrov', 'CB', 4),
  p('h5', 'harbor', 'Callum Reed', 'LB', 3),
  p('h6', 'harbor', 'Omar Diallo', 'CDM', 6),
  p('h7', 'harbor', 'Felix Ortega', 'CM', 8),
  p('h8', 'harbor', 'Sean Blake', 'CM', 17),
  p('h9', 'harbor', 'Luca Moretti', 'ST', 9),
  p('h10', 'harbor', 'Kian Walsh', 'CAM', 10),
  p('h11', 'harbor', 'Ravi Seth', 'LW', 11),
  p('h12', 'harbor', 'Tomas Alvarez', 'RW', 7),
  p('h13', 'harbor', 'Paul Kim', 'GK', 12),
  p('h14', 'harbor', 'Hugo Berg', 'CB', 15),
  p('h15', 'harbor', 'Miles Chen', 'CM', 16),
  p('h16', 'harbor', 'Andre Costa', 'ST', 19),
]

function xi(
  teamId: string,
  ids: string[],
  positions: Position[],
  bench: { id: string; position: Position }[] = [],
): Appearance[] {
  const starters: Appearance[] = ids.map((playerId, i) => ({
    playerId,
    teamId,
    position: positions[i],
    role: 'starter',
  }))
  const extras: Appearance[] = bench.map((row) => ({
    playerId: row.id,
    teamId,
    position: row.position,
    role: 'bench',
  }))
  return [...starters, ...extras]
}

const N_SHAPE: Position[] = ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CM', 'RW', 'CAM', 'LW']
const H_SHAPE: Position[] = ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'ST', 'LW']

function goal(
  id: string,
  minute: number,
  teamId: string,
  playerId: string,
  extra?: { assistPlayerId?: string; wondergoal?: boolean; ownGoal?: boolean },
): MatchEvent {
  return { id, type: 'goal', minute, teamId, playerId, ...extra }
}

function save(id: string, minute: number, teamId: string, playerId: string): MatchEvent {
  return { id, type: 'save', minute, teamId, playerId }
}

function sub(
  id: string,
  minute: number,
  teamId: string,
  playerOutId: string,
  playerInId: string,
  position: Position,
): MatchEvent {
  return { id, type: 'sub', minute, teamId, playerOutId, playerInId, position }
}

const nStart = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n12', 'n10', 'n11']
const hStart = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h10', 'h12', 'h9', 'h11']

export const seedMatches: Match[] = [
  {
    id: 'm1',
    season: SEASON,
    matchDay: 1,
    date: '2025-08-16',
    homeTeamId: 'northside',
    awayTeamId: 'harbor',
    duration: 90,
    appearances: [
      ...xi('northside', nStart, N_SHAPE, [
        { id: 'n9', position: 'ST' },
        { id: 'n15', position: 'CM' },
      ]),
      ...xi('harbor', hStart, H_SHAPE, [
        { id: 'h16', position: 'ST' },
        { id: 'h8', position: 'CM' },
      ]),
    ],
    events: [
      save('m1s1', 8, 'northside', 'n1'),
      save('m1s2', 14, 'harbor', 'h1'),
      goal('m1g1', 22, 'northside', 'n10', { assistPlayerId: 'n12' }),
      save('m1s3', 31, 'northside', 'n1'),
      goal('m1g2', 41, 'harbor', 'h9', { assistPlayerId: 'h10' }),
      sub('m1u1', 62, 'northside', 'n8', 'n9', 'ST'),
      sub('m1u2', 70, 'harbor', 'h11', 'h16', 'ST'),
      goal('m1g3', 78, 'northside', 'n9', { assistPlayerId: 'n11', wondergoal: true }),
      save('m1s4', 84, 'northside', 'n1'),
    ],
  },
  {
    id: 'm2',
    season: SEASON,
    matchDay: 2,
    date: '2025-08-23',
    homeTeamId: 'harbor',
    awayTeamId: 'northside',
    duration: 90,
    appearances: [
      ...xi('harbor', hStart, H_SHAPE, [{ id: 'h8', position: 'CM' }]),
      ...xi('northside', nStart, N_SHAPE, [{ id: 'n14', position: 'CB' }]),
    ],
    events: [
      save('m2s1', 6, 'harbor', 'h1'),
      save('m2s2', 18, 'northside', 'n1'),
      save('m2s3', 33, 'harbor', 'h1'),
      save('m2s4', 55, 'northside', 'n1'),
      save('m2s5', 71, 'harbor', 'h1'),
      save('m2s6', 88, 'northside', 'n1'),
    ],
  },
  {
    id: 'm3',
    season: SEASON,
    matchDay: 3,
    date: '2025-08-30',
    homeTeamId: 'northside',
    awayTeamId: 'harbor',
    duration: 90,
    appearances: [
      ...xi('northside', nStart, N_SHAPE, [
        { id: 'n9', position: 'ST' },
        { id: 'n15', position: 'CM' },
      ]),
      ...xi('harbor', hStart, H_SHAPE, [{ id: 'h8', position: 'CM' }]),
    ],
    events: [
      save('m3s1', 11, 'harbor', 'h1'),
      goal('m3g1', 19, 'northside', 'n12', { assistPlayerId: 'n10' }),
      goal('m3g2', 36, 'northside', 'n11', { assistPlayerId: 'n5' }),
      sub('m3u1', 58, 'harbor', 'h7', 'h8', 'CM'),
      goal('m3g3', 67, 'northside', 'n7', { assistPlayerId: 'n10', wondergoal: true }),
      save('m3s2', 80, 'northside', 'n1'),
    ],
  },
  {
    id: 'm4',
    season: SEASON,
    matchDay: 4,
    date: '2025-09-06',
    homeTeamId: 'harbor',
    awayTeamId: 'northside',
    duration: 90,
    appearances: [
      ...xi('harbor', hStart, H_SHAPE, [
        { id: 'h8', position: 'CM' },
        { id: 'h16', position: 'ST' },
      ]),
      ...xi('northside', nStart, N_SHAPE, [{ id: 'n9', position: 'ST' }]),
    ],
    events: [
      goal('m4g1', 9, 'harbor', 'h12', { assistPlayerId: 'h2' }),
      save('m4s1', 16, 'northside', 'n1'),
      goal('m4g2', 28, 'northside', 'n11', { assistPlayerId: 'n10' }),
      goal('m4g3', 44, 'harbor', 'h9', { assistPlayerId: 'h12' }),
      sub('m4u1', 60, 'northside', 'n12', 'n9', 'ST'),
      goal('m4g4', 73, 'northside', 'n9', { assistPlayerId: 'n7' }),
      save('m4s2', 81, 'harbor', 'h1'),
      save('m4s3', 86, 'northside', 'n1'),
    ],
  },
  {
    id: 'm5',
    season: SEASON,
    matchDay: 5,
    date: '2025-09-13',
    homeTeamId: 'northside',
    awayTeamId: 'harbor',
    duration: 90,
    appearances: [
      ...xi('northside', nStart, N_SHAPE, [{ id: 'n16', position: 'ST' }]),
      ...xi('harbor', hStart, H_SHAPE, [{ id: 'h14', position: 'CB' }]),
    ],
    events: [
      save('m5s1', 7, 'northside', 'n1'),
      save('m5s2', 21, 'harbor', 'h1'),
      goal('m5g1', 54, 'northside', 'n6', { assistPlayerId: 'n7' }),
      save('m5s3', 63, 'northside', 'n1'),
      save('m5s4', 77, 'northside', 'n1'),
      sub('m5u1', 79, 'harbor', 'h4', 'h14', 'CB'),
      goal('m5og', 83, 'harbor', 'h14', { ownGoal: true }),
    ],
  },
  {
    id: 'm6',
    season: SEASON,
    matchDay: 6,
    date: '2025-09-20',
    homeTeamId: 'harbor',
    awayTeamId: 'northside',
    duration: 90,
    appearances: [
      ...xi('harbor', hStart, H_SHAPE, [{ id: 'h8', position: 'CM' }]),
      ...xi('northside', nStart, N_SHAPE, [
        { id: 'n15', position: 'CM' },
        { id: 'n9', position: 'ST' },
      ]),
    ],
    events: [
      save('m6s1', 4, 'northside', 'n1'),
      goal('m6g1', 12, 'harbor', 'h10', { assistPlayerId: 'h11', wondergoal: true }),
      goal('m6g2', 29, 'harbor', 'h9', { assistPlayerId: 'h10' }),
      save('m6s2', 40, 'harbor', 'h1'),
      sub('m6u1', 55, 'northside', 'n8', 'n15', 'CM'),
      goal('m6g3', 61, 'northside', 'n12', { assistPlayerId: 'n15' }),
      goal('m6g4', 74, 'harbor', 'h7', { assistPlayerId: 'h9' }),
      save('m6s3', 82, 'northside', 'n1'),
    ],
  },
]
