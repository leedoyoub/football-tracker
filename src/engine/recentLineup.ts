
import type { Match } from '../types';

export function getMostRecentStartingLineup(matches: Match[], teamId: string): Record<string, string> | null {
  const teamMatches = matches
    .filter((m) => m.teamId === teamId || (!m.teamId && (m.homeTeamId === teamId || m.awayTeamId === teamId)))
    .sort((a, b) => {
      const seasonA = parseInt(a.season.replace('Season ', '')) || 0;
      const seasonB = parseInt(b.season.replace('Season ', '')) || 0;
      return seasonB - seasonA || b.matchDay - a.matchDay;
    });

  for (const match of teamMatches) {
    const starters = match.appearances.filter(a => a.role === 'starter' && a.teamId === teamId);
    if (starters.length === 11) {
      const slotAssignments: Record<string, string> = {};
      starters.forEach(a => {
        if (a.matchPosition) {
          slotAssignments[a.matchPosition] = a.playerId;
        }
      });
      if (Object.keys(slotAssignments).length === 11) {
        return slotAssignments;
      }
    }
  }
  return null;
}
