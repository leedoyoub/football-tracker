import { useEffect, useRef, useState } from 'react'
import { compactItem, compactPopup, compactTrigger } from './compactMenuStyles'

export function CompactMultiFilterMenu({ value, options, onChange, label, emptyLabel, pluralLabel }: {
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
  label: string
  emptyLabel: string
  pluralLabel: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const selectedLabel = value.length === 0 ? emptyLabel : value.length === 1 ? value[0] : `${value.length} ${pluralLabel}`

  useEffect(() => {
    if (!open) return
    const initial = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')
    initial?.focus()
    const outside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') { setOpen(false); return }
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [])]
    const current = items.indexOf(document.activeElement as HTMLElement)
    if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length
    items[next].focus()
  }
  const toggle = (item: string) => onChange(value.includes(item) ? value.filter(selected => selected !== item) : [...value, item])

  return <div ref={root} className="relative inline-flex">
    <button ref={trigger} type="button" aria-label={`${label}: ${selectedLabel}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)} className={compactTrigger(value.length > 0)}>{selectedLabel} <span aria-hidden="true">⌄</span></button>
    {open && <div ref={menu} role="menu" aria-label={label} onKeyDown={moveFocus} className={`${compactPopup} right-0 max-h-64 min-w-36 overflow-y-auto overscroll-contain`}>
      {options.map(item => <button key={item} type="button" role="menuitemcheckbox" tabIndex={-1} aria-checked={value.includes(item)} onClick={() => toggle(item)} className={compactItem(value.includes(item))}><span aria-hidden="true" className="mr-1 inline-block w-3">{value.includes(item) ? '✓' : ''}</span>{item}</button>)}
    </div>}
  </div>
}
