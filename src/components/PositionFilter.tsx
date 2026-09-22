import { useEffect, useRef, useState } from 'react'
import type { PositionFilterKey } from '../types'

export const POSITION_FILTER_OPTIONS: { value: PositionFilterKey; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'st-ss', label: 'ST/SS' }, { value: 'lw-rw', label: 'LW/RW' },
  { value: 'cam', label: 'CAM' }, { value: 'lm-rm', label: 'LM/RM' }, { value: 'cm', label: 'CM' },
  { value: 'cdm', label: 'CDM' }, { value: 'fb', label: 'FB' }, { value: 'cb', label: 'CB' }, { value: 'gk', label: 'GK' },
]

export function PositionFilter({ value, onChange, label = 'Position' }: { value: PositionFilterKey; onChange: (value: PositionFilterKey) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = POSITION_FILTER_OPTIONS.find(option => option.value === value)?.label ?? 'All'

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false) }
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [open])

  return <div ref={root} className="relative inline-flex">
    <button type="button" aria-label={`${label}: ${selected}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)} className={`min-h-9 rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${value === 'all' ? 'border-white/10 bg-zinc-900 text-zinc-300' : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'}`}>
      {selected} <span aria-hidden="true">⌄</span>
    </button>
    {open && <div role="menu" aria-label={`${label} filter`} className="absolute right-0 top-full z-30 mt-1 grid min-w-28 grid-cols-2 gap-1 rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl">
      {POSITION_FILTER_OPTIONS.map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === value} onClick={() => { onChange(option.value); setOpen(false) }} className={`min-h-8 rounded-lg px-2 text-left text-[10px] font-bold ${option.value === value ? 'bg-emerald-500 text-black' : 'text-zinc-300 hover:bg-white/10'}`}>{option.label}</button>)}
    </div>}
  </div>
}
