export function drawRandomTeam<T>(teams: readonly T[]): T {
  if (!teams.length) throw new Error('No teams available.')
  return teams[Math.floor(Math.random() * teams.length)]!
}
