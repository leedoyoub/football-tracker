export type HorizontalTabContainer = { scrollLeft: number; clientWidth: number }
export type HorizontalTab = { offsetLeft: number; offsetWidth: number }

export function ensureHorizontalTabVisible(container: HorizontalTabContainer, selected: HorizontalTab) {
  const visibleLeft = container.scrollLeft
  const visibleRight = visibleLeft + container.clientWidth
  const selectedLeft = selected.offsetLeft
  const selectedRight = selectedLeft + selected.offsetWidth
  if (selectedLeft < visibleLeft) container.scrollLeft = Math.max(0, selectedLeft)
  else if (selectedRight > visibleRight) container.scrollLeft = Math.max(0, selectedRight - container.clientWidth)
}
