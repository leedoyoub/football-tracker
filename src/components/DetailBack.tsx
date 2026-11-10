/** Shares the detail page's native scroll surface with its sticky tabs. */
export function DetailBack({ onBack }: { onBack: () => void }) {
  return <div className="detail-back sticky top-0 z-30 mb-3 flex items-center bg-zinc-950/95 backdrop-blur">
    <button type="button" onClick={onBack} className="min-h-11 min-w-16 rounded-lg px-2 text-left text-xs font-semibold text-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">Back</button>
  </div>
}
