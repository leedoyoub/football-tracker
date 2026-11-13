/** The Back button scrolls away with the detail content. */
export function DetailBack({ onBack }: { onBack: () => void }) {
  return <div className="detail-back mb-3 flex items-center">
    <button type="button" onClick={onBack} className="min-h-11 min-w-16 rounded-lg px-2 text-left text-xs font-semibold text-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">Back</button>
  </div>
}
