export type CompetitionScrollContainer = { scrollTop: number }

/** Competition tabs keep the current route, so reset the App-owned scroll surface directly. */
export function resetCompetitionTypeScroll(container: CompetitionScrollContainer | null) {
  if (container) container.scrollTop = 0
}
