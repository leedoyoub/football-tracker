import type { CompetitionType, RankSort, ScreenStateByView } from '../types'

type State = ScreenStateByView['competition']
export const CUP_TABLE_STAGES = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'final', 'finalReplay'] as const
export const CHAMPIONS_MATCH_ROUNDS = ['roundOf16', 'quarterFinal', 'semiFinal', 'final', 'finalReplay'] as const

export function defaultCompetitionScreenState(competitionType: CompetitionType = 'league', rankingMetric: RankSort = 'rating'): State {
  return {
    name: 'competition', competitionType, leagueMenu: 'players', cupMenu: 'table', championsMenu: 'bracket',
    leagueTableMode: 'overall', cupTableStage: null,
    matchFilters: { league: { teamId: null, period: null }, cup: { teamId: null, period: null }, champions: { teamId: null, period: null } },
    rankingMetric, bestXiMode: 'period', monthlyAwardBlock: null, cupAwardStage: null, championsAwardRound: null,
    historyMatchday: null, historyComparedTeamIds: [], historyFocusedTeamId: null, historyPlotScrollLeft: null,
  }
}

export function competitionMenu(state: State) {
  return state.competitionType === 'league' ? state.leagueMenu : state.competitionType === 'cup' ? state.cupMenu : state.championsMenu
}

export function validMatchPeriod(type: CompetitionType, value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (type === 'league') return /^(?:[1-9]|[12]\d|30)$/.test(value)
  return (type === 'cup' ? CUP_TABLE_STAGES : CHAMPIONS_MATCH_ROUNDS).some(period => period === value)
}

/** Normalize device-only state, including pre-v2.5.6 Form and preview routes. */
export function normalizeCompetitionScreenState(saved: Record<string, unknown>, base: State, teamIds: string[]): State {
  const legacyLeague = saved.tab === 'form' ? 'table' : saved.tab
  const leagueMenu = ['players', 'table', 'history', 'matches'].includes(String(saved.leagueMenu ?? legacyLeague)) ? (saved.leagueMenu ?? legacyLeague) as State['leagueMenu'] : base.leagueMenu
  const filters = saved.matchFilters && typeof saved.matchFilters === 'object' ? saved.matchFilters as Record<string, unknown> : {}
  const matchFilters = { ...base.matchFilters }
  for (const type of ['league', 'cup', 'champions'] as const) {
    const raw = filters[type] && typeof filters[type] === 'object' ? filters[type] as Record<string, unknown> : {}
    matchFilters[type] = { teamId: typeof raw.teamId === 'string' && teamIds.includes(raw.teamId) ? raw.teamId : null, period: validMatchPeriod(type, raw.period) ? raw.period : null }
  }
  return {
    ...base, leagueMenu,
    cupMenu: ['players', 'table', 'matches'].includes(String(saved.cupMenu)) ? saved.cupMenu as State['cupMenu'] : base.cupMenu,
    championsMenu: ['players', 'bracket', 'matches'].includes(String(saved.championsMenu)) ? saved.championsMenu as State['championsMenu'] : base.championsMenu,
    leagueTableMode: saved.leagueTableMode === 'form' || saved.leagueMenu === undefined && saved.tab === 'form' ? 'form' : 'overall',
    cupTableStage: saved.cupTableStage === 'total' || CUP_TABLE_STAGES.some(stage => stage === saved.cupTableStage) ? saved.cupTableStage as State['cupTableStage'] : null,
    matchFilters,
    historyFocusedTeamId: typeof saved.historyFocusedTeamId === 'string' && (base.historyComparedTeamIds.length ? base.historyComparedTeamIds : teamIds).includes(saved.historyFocusedTeamId) ? saved.historyFocusedTeamId : null,
    historyPlotScrollLeft: typeof saved.historyPlotScrollLeft === 'number' && Number.isFinite(saved.historyPlotScrollLeft) && saved.historyPlotScrollLeft >= 0 ? saved.historyPlotScrollLeft : null,
  }
}

export function resetCompetitionSeasonState(state: State): State {
  const defaults = defaultCompetitionScreenState(state.competitionType, state.rankingMetric)
  return { ...state, cupTableStage: null, matchFilters: defaults.matchFilters, monthlyAwardBlock: null, cupAwardStage: null, championsAwardRound: null, historyMatchday: null, historyComparedTeamIds: [], historyFocusedTeamId: null, historyPlotScrollLeft: null }
}
