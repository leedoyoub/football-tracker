export const REGISTRATION_POSITIONS = [
  'ST', 'SS', 'LW', 'RW', 'CAM', 'LM', 'RM', 'CM', 'CDM', 'LB', 'RB', 'CB', 'GK'
] as const

export type RegistrationPosition = (typeof REGISTRATION_POSITIONS)[number]

export const POSITION_GROUPS = {
  ATTACKERS: ['ST', 'SS', 'LW', 'RW'] as const,
  MIDFIELDERS: ['CAM', 'LM', 'RM', 'CM', 'CDM'] as const,
  DEFENDERS: ['LB', 'RB', 'CB'] as const,
  GOALKEEPERS: ['GK'] as const,
} as const

// Keep existing POSITIONS for compatibility with legacy data
export const POSITIONS = [
  'GK', 'CB', 'LCB', 'RCB', 'LB', 'LWB', 'RB', 'RWB', 'LDM', 'CDM', 'RDM', 'LCM', 'CM', 'RCM', 'CAM', 'LM', 'RM', 'LW', 'LST', 'RW', 'RST', 'SS', 'ST',
] as const

export type Position = (typeof POSITIONS)[number]

export type Tab = 'teams' | 'news' | 'home' | 'records' | 'players'

export interface Team {
  id: string
  name: string
  shortName: string
  abbreviation: string
  /** Static catalog logo; legacy color fields remain for persisted historical records. */
  logo?: string
  externalTeamId?: number
  visualStyle: 'solid' | 'striped'
  primaryColor: TeamColor
  secondaryColor?: TeamColor | null
  jerseyNumberColor: TeamColor
}

export type TeamColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'black' | 'white'
export const TEAM_COLORS: TeamColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'purple', 'black', 'white']

export interface FormationSlot {
  id: string
  matchPosition: Position
  playerId: string | null
  x: number
  y: number
}

export interface Player {
  id: string
  teamId: string
  /** Current assignments; teamId remains the legacy primary assignment. */
  teamIds?: string[]
  name: string
  /** Legal/complete name retained for profiles and future use. */
  fullName?: string
  /** Name used throughout normal match and team UI. */
  displayName?: string
  position: Position
  number: number
  rating?: number
  /** Optional external reference. player.id remains the permanent app identity. */
  externalPlayerId?: string | number
  /** Remote photo URL selected from a future provider; safe to omit offline. */
  photoUrl?: string
  /** Legacy local image field retained for backwards compatibility. */
  image?: string
}

export interface PositionChange {
  minute: number
  position: Position
}

export interface Appearance {
  playerId: string
  teamId: string
  position: Position
  matchPosition?: string
  positionHistory?: PositionChange[]
  role: 'starter' | 'bench'
}

export type MatchEvent =
  | {
      id: string
      type: 'goal'
      minute: number
      teamId: string
      playerId?: string
      assistPlayerId?: string
      goalType?: 'normal' | 'wonder' | 'assist-led'
      concededGoalCausePlayerId?: string
      /** Legacy event field; interpreted as a wonder goal when goalType is absent. */
      wondergoal?: boolean
      ownGoal?: boolean
    }
  | {
      id: string
      type: 'save'
      minute?: number
      teamId: string
      playerId: string
      count?: number
    }
  | {
      id: string
      type: 'sub'
      minute: number
      teamId: string
      playerOutId: string
      playerInId: string
      position: Position
    }

export interface Match {
  id: string
  season: string
  matchDay: number
  date: string
  formation?: string
  homeAway?: 'home' | 'away'
  homeTeamId: string
  awayTeamId: string
  /** The registered team whose roster and season this match belongs to. */
  teamId?: string
  /** A lightweight, match-only opponent. It is never a registered Team. */
  opponentName?: string
  /** Saved once when the match is committed; enables durable MOM statistics. */
  manOfMatchPlayerId?: string
  duration: number
  appearances: Appearance[]
  events: MatchEvent[]
}

export interface AppState {
  teams: Team[]
  players: Player[]
  matches: Match[]
  draftMatch?: Match
}

export type View =
  | { name: 'home' }
  | { name: 'news'; kind?: 'player' | 'match' | 'team' }
  | { name: 'records' }
  | { name: 'rankings'; sort: RankSort }
  | { name: 'standings' }
  | { name: 'season-recap'; season: string }
  | { name: 'chemistry' }
  | { name: 'comparison' }
  | { name: 'teams' }
  | { name: 'team'; id: string }
  | { name: 'import-squad'; teamId: string }
  | { name: 'players' }
  | { name: 'player'; id: string }
  | { name: 'match'; id: string }
  | { name: 'edit-match'; id: string }
  | { name: 'new-match'; teamId?: string }
  | { name: 'new-team' }
  | { name: 'edit-team'; id: string }
  | { name: 'new-player'; teamId?: string }
  | { name: 'edit-player'; id: string }
  | { name: 'data-management' }

export type RankSort = 'rating' | 'goals' | 'assists' | 'minutes'

export interface Best11Slot {
  slot: string
  position: Position
  matchPosition?: string
  playerId: string | null
  teamId?: string
  avgRating: number
  matches: number
}

export interface RatingBreakdown {
  playerId: string
  matchId: string
  played: boolean
  starter: boolean
  enter: number
  exit: number
  minutes: number
  position: Position
  base: number
  result: number
  goals: number
  assists: number
  teamGoals: number
  conceded: number
  cleanSheet: number
  noConceded: number
  noPoint: number
  ownGoals: number
  concededCause: number
  saves: number
  raw: number
  rating: number
}

export interface PlayerSeasonStats {
  playerId: string
  teamId: string
  season: string
  matches: number
  starts: number
  subs: number
  minutes: number
  goals: number
  assists: number
  avgRating: number
  mom: number
  saves: number
  wins: number
  draws: number
  losses: number
  recentForm: ('W' | 'D' | 'L')[]
  ratings: RatingBreakdown[]
}

export interface TeamSeasonStats {
  teamId: string
  season: string
  matches: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  cleanSheets: number
  recentForm: ('W' | 'D' | 'L')[]
}

export interface PartnershipStats {
  playerAId: string
  playerBId: string
  matchesTogether: number
  winsTogether: number
  goalsTogether: number
  assistsAtoB: number
  assistsBtoA: number
}
