import { useEffect, useRef, useState } from 'react'
import { compactItem, compactPopup, compactTrigger } from './compactMenuStyles'

export type CompactFilterOption<T> = { value: T; label: string; accessibilityLabel?: string }

export function CompactFilterMenu<T>({ value, options, onChange, label, allValue, allLabel, allAccessibilityLabel, menuClassName = '', popupAlign = 'end' }: {
  value: T
  options: CompactFilterOption<T>[]
  onChange: (value: T) => void
  label: string
  allValue?: T
  allLabel?: string
  allAccessibilityLabel?: string
  menuClassName?: string
  popupAlign?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const selected = options.find(option => Object.is(option.value, value))
  const isAll = allValue !== undefined && Object.is(value, allValue)
  const visibleSelected = isAll ? allLabel ?? label : selected?.label ?? allLabel ?? label
  const accessibleSelected = isAll ? allAccessibilityLabel ?? allLabel ?? label : selected?.accessibilityLabel ?? selected?.label ?? allAccessibilityLabel ?? label

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
    <button ref={trigger} type="button" aria-label={`${label}: ${accessibleSelected}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)} className={compactTrigger(!isAll)}>
      {visibleSelected} <span aria-hidden="true">⌄</span>
    </button>
    {open && <div ref={menu} role="menu" aria-label={`${label} filter`} onKeyDown={moveMenuFocus} className={`${compactPopup} ${popupAlign === 'start' ? 'left-0' : 'right-0'} ${menuClassName}`}>
      {options.map(option => <button key={String(option.value)} type="button" role="menuitemradio" tabIndex={-1} aria-checked={Object.is(option.value, value)} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus() }} className={compactItem(Object.is(option.value, value))}>{option.label}</button>)}
    </div>}
  </div>
}
