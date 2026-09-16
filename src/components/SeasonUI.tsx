import type { RankMovement } from '../engine/seasonAnalytics'

export function RankDelta({ value }: { value: RankMovement }) {
  const label = value === null ? 'No previous ranking' : value > 0 ? `Up ${value} place${value === 1 ? '' : 's'}` : value < 0 ? `Down ${Math.abs(value)} place${value === -1 ? '' : 's'}` : 'No rank change'
  return <span aria-label={label} title={label} className={`inline-flex min-w-5 items-center justify-center text-[9px] font-black ${value === null || value === 0 ? 'text-zinc-600' : value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{value === null || value === 0 ? '—' : value > 0 ? `↑${value}` : `↓${Math.abs(value)}`}</span>
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="mb-2 flex min-h-11 items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{title}</h2>{subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}</div>{action}</div>
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, sticky = false }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; sticky?: boolean }) {
  return <div role="tablist" aria-label={label} className={`${sticky ? 'sticky top-0 z-20 ' : ''}grid gap-1 rounded-xl bg-zinc-900/95 p-1 backdrop-blur`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>{options.map(option => <button key={option.value} type="button" role="tab" aria-selected={value === option.value} onClick={() => onChange(option.value)} className={`min-h-10 rounded-lg px-2 text-xs font-black ${value === option.value ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}>{option.label}</button>)}</div>
}
