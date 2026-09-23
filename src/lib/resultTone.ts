/** Shared win/loss/neutral palette for compact match results and bracket rows. */
export function resultTone(result: 'W' | 'L' | 'D' | 'N') {
  return result === 'W' ? 'border-emerald-300/50 bg-emerald-500/20' : result === 'L' ? 'border-red-300/50 bg-red-500/20' : 'border-zinc-400/30 bg-zinc-700/50'
}
