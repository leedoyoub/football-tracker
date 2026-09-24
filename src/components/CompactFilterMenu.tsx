import { useEffect, useRef, useState } from 'react'

export type CompactFilterOption<T> = { value: T; label: string; accessibilityLabel?: string }

export function CompactFilterMenu<T>({ value, options, onChange, label, allValue, allLabel, allAccessibilityLabel, menuClassName = '' }: {
  value: T
  options: CompactFilterOption<T>[]
  onChange: (value: T) => void
  label: string
  allValue: T
  allLabel: string
  allAccessibilityLabel: string
  menuClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const selected = options.find(option => Object.is(option.value, value))
  const isAll = Object.is(value, allValue)
  const visibleSelected = isAll ? allLabel : selected?.label ?? allLabel
  const accessibleSelected = isAll ? allAccessibilityLabel : selected?.accessibilityLabel ?? selected?.label ?? allAccessibilityLabel

  useEffect(() => {
    if (!open) return
    const selectedOption = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.current?.querySelector<HTMLElement>('[role="menuitemradio"]')
    selectedOption?.focus()
    const closeOutside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false) }
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [open])

  const moveMenuFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') { setOpen(false); return }
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
    const current = items.indexOf(document.activeElement as HTMLElement)
    if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length
    items[next].focus()
  }

  return <div ref={root} className="relative inline-flex">
    <button ref={trigger} type="button" aria-label={`${label}: ${accessibleSelected}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)} className={`min-h-9 rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${isAll ? 'border-white/10 bg-zinc-900 text-zinc-300' : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'}`}>
      {visibleSelected} <span aria-hidden="true">⌄</span>
    </button>
    {open && <div ref={menu} role="menu" aria-label={`${label} filter`} onKeyDown={moveMenuFocus} className={`absolute right-0 top-full z-30 mt-1 grid min-w-28 gap-1 rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl ${menuClassName}`}>
      {options.map(option => <button key={String(option.value)} type="button" role="menuitemradio" tabIndex={-1} aria-checked={Object.is(option.value, value)} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus() }} className={`min-h-8 rounded-lg px-2 text-left text-[10px] font-bold ${Object.is(option.value, value) ? 'bg-emerald-500 text-black' : 'text-zinc-300 hover:bg-white/10'}`}>{option.label}</button>)}
    </div>}
  </div>
}
