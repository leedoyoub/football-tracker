import { useEffect, useRef, useState } from 'react'
import type { CompetitionType } from '../types'

export type CompetitionScope = CompetitionType | 'all'
const labels: Record<CompetitionScope, string> = { all: 'All Competitions', league: 'League', cup: 'Cup', champions: 'Champions' }

export function CompetitionScopeSelector({ value, onChange, className = '' }: { value: CompetitionScope; onChange: (value: CompetitionScope) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return <div ref={root} className={`relative inline-block ${className}`}><button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 text-xs font-bold text-zinc-100">{labels[value]} <span aria-hidden className="text-zinc-400">⌄</span></button>{open && <div role="listbox" aria-label="Competition scope" className="absolute left-0 z-30 mt-1 min-w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl">{(Object.keys(labels) as CompetitionScope[]).map(option => <button key={option} type="button" role="option" aria-selected={value === option} onClick={() => { onChange(option); setOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${value === option ? 'bg-emerald-500 text-black font-bold' : 'text-zinc-200'}`}><span>{labels[option]}</span><span aria-hidden>{value === option ? '✓' : ''}</span></button>)}</div>}</div>
}
