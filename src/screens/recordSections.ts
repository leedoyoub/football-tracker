import { AWARD_RECORD_METRICS } from '../engine/awardRecords'
import { defensivePairRecordIds, partnershipRecordIds } from '../engine/combinationLeaderboards'
import { TEAM_SEASON_RECORD_IDS } from './recordsLeaderboards'

export const archiveMenus = [
  { id: 'hall', title: 'Hall of Fame', detail: 'Career scores, All-time Best XI and legendary records' },
  { id: 'player', title: 'Players', detail: 'Individual performances, streaks and awards' },
  { id: 'team', title: 'Teams', detail: 'Results, trophies and historic matches' },
  { id: 'combination', title: 'Combinations', detail: 'Partnerships, units and shared appearances' },
  { id: 'history', title: 'History', detail: 'Season archives and official awards' },
  { id: 'analytics', title: 'Analytics', detail: 'Recent form and match performance' },
] as const

export const playerRecordSections = [
  { id: 'career', title: 'Career', records: ['appearances', 'minutes', 'starts', 'goals', 'assists', 'ga', 'mom', 'career-rating', 'mom-rate'] },
  { id: 'performance', title: 'Performance', records: ['ten', 'nine', 'eight', 'good'] },
  { id: 'match', title: 'Single Match', records: ['highest-goals', 'highest-assists', 'highest-ga', 'highest-rating', 'highest-saves'] },
  { id: 'streaks', title: 'Streaks', records: ['scoring-streak', 'ga-streak', 'good-streak', 'mom-streak', 'clean-sheet-streak'] },
  { id: 'scoring', title: 'Scoring', records: ['matches-scored-in', 'matches-ga', 'braces', 'hat-tricks', 'four-goals', 'three-assists', 'four-ga', 'game-winning-goals', 'comeback-goals', 'equalizers', 'opening-goals', 'stoppage-time-goals', 'substitute-goals'] },
  { id: 'defense', title: 'Defense', records: ['lowest-sot-90', 'lowest-defender-ga-90', 'lowest-gk-ga-90', 'clean-sheets', 'saves'] },
  { id: 'season', title: 'Season', records: ['season-goals', 'season-assists', 'season-ga', 'season-mom', 'season-rating', 'season-appearances', 'season-minutes', 'season-clean-sheets', 'season-saves'] },
  { id: 'awards', title: 'Awards', records: ['awards-season-mvp', ...AWARD_RECORD_METRICS.filter(metric => metric.id !== 'season-mvp').map(metric => `awards-${metric.id}`)] },
]

export const teamRecordSections = [
  { id: 'career', title: 'Career', records: ['played', 'wins', 'draws', 'losses'] },
  { id: 'trophies', title: 'Trophies', records: [
    'history-titles', 'history-league-titles', 'history-cup-titles', 'history-champions-titles',
    'history-runner-ups', 'history-league-runner-ups', 'history-cup-runner-ups', 'history-champions-runner-ups',
    'history-finals', 'history-cup-finals', 'history-champions-finals', 'team-awards-individual',
    ...AWARD_RECORD_METRICS.filter(metric => !['individual', 'total', 'championships', 'runner-ups', 'mvps', 'xi', 'scorers', 'assisters'].includes(metric.id)).map(metric => `team-awards:${metric.id}`),
  ] },
  { id: 'dominance', title: 'Dominance', records: ['win-rate', 'ppg', 'goal-difference', 'goal-difference-per-match', 'comeback-wins'] },
  { id: 'attack', title: 'Attack', records: ['team-goals', 'gf-rate', 'opening-goals'] },
  { id: 'defense', title: 'Defense', records: ['clean', 'clean-rate', 'ga-rate', 'opponent-sot-rate', 'saves', 'conceded'] },
  { id: 'streaks', title: 'Streaks', records: ['win-streak', 'unbeaten-streak', 'scoring-streak', 'clean-streak', 'losing-streak', 'winless-streak'] },
  { id: 'matches', title: 'Historic Matches', records: ['biggest-win', 'high-score', 'high-conceded', 'biggest-defeat', 'biggest-comeback'] },
  { id: 'season', title: 'Best Seasons', records: TEAM_SEASON_RECORD_IDS },
]

export const combinationRecordSections = [
  { id: 'partnerships', title: 'Partnerships', records: partnershipRecordIds },
  { id: 'together', title: 'Together' },
  { id: 'units', title: 'Best Units' },
  { id: 'defensive', title: 'Defensive Pairs', records: defensivePairRecordIds },
  { id: 'find', title: 'Find Partner' },
] as const
