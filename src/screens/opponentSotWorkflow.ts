import type { Match } from '../types'

/** UI-only checkpoint state. The flag controls the editor workflow; HT/FT remain
 * the sole canonical values read by the rating and statistics domains. */
export type OpponentSotDraftState = {
  halftimeOpponentSot: string
  fulltimeOpponentSot: string
  fulltimeOpponentSotAutoLinked: boolean
}

const inputValue = (value: number | undefined) => value === undefined ? '' : String(value)

export function initialOpponentSotDraft(source: Pick<Match, 'halftimeOpponentSot' | 'fulltimeOpponentSot' | 'fulltimeOpponentSotAutoLinked'> | undefined, autoLinkWhenUntouched: boolean): OpponentSotDraftState {
  return {
    halftimeOpponentSot: inputValue(source?.halftimeOpponentSot),
    fulltimeOpponentSot: inputValue(source?.fulltimeOpponentSot),
    // Older records/checkpoints predate the workflow flag. Never infer it from
    // equal totals, because equal values can have been entered manually.
    fulltimeOpponentSotAutoLinked: source?.fulltimeOpponentSotAutoLinked ?? autoLinkWhenUntouched,
  }
}

export function updateHalftimeOpponentSot(state: OpponentSotDraftState, halftimeOpponentSot: string): OpponentSotDraftState {
  return state.fulltimeOpponentSotAutoLinked
    ? { ...state, halftimeOpponentSot, fulltimeOpponentSot: halftimeOpponentSot }
    : { ...state, halftimeOpponentSot }
}

export function updateFulltimeOpponentSot(state: OpponentSotDraftState, fulltimeOpponentSot: string): OpponentSotDraftState {
  return { ...state, fulltimeOpponentSot, fulltimeOpponentSotAutoLinked: false }
}
