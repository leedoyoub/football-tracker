import { useEffect, useRef, useState } from 'react'
import type { CompactFilterOption } from './CompactFilterMenu'
import { compactItem, compactPopup, compactTrigger } from './compactMenuStyles'

type OptionMenuProps<T extends string> = {
  values: readonly T[]; options: CompactFilterOption<T>[]; onChange: (values: T[]) => void
  label: string; title: string; allLabel: string; menuClassName?: string
}
type LegacyMenuProps = { value: string[]; options: string[]; onChange: (value: string[]) => void; label: string; emptyLabel: string; pluralLabel: string }

/** Preserve the existing season menu API and share its checkbox behavior. */
export function CompactMultiFilterMenu(props: LegacyMenuProps): React.ReactNode
export function CompactMultiFilterMenu<T extends string>(props: OptionMenuProps<T>): React.ReactNode
export function CompactMultiFilterMenu<T extends string>(props: LegacyMenuProps | OptionMenuProps<T>) {
  const legacy = 'value' in props
  const values: readonly string[] = legacy ? props.value : props.values
  const options: CompactFilterOption<string>[] = legacy ? props.options.map(value => ({ value, label: value })) : props.options
  const label = props.label
  const onChange = (values: string[]) => (props.onChange as (values: string[]) => void)(values)
  const title = legacy ? props.emptyLabel : props.title
  const allLabel = legacy ? props.emptyLabel : props.allLabel
  const menuClassName = legacy ? 'max-h-64 min-w-36 overflow-y-auto overscroll-contain' : props.menuClassName ?? ''
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const selected = options.filter(option => values.includes(option.value))
  const text = selected.length === 1 ? selected[0].label : selected.length ? legacy ? `${selected.length} ${props.pluralLabel}` : `${title} (${selected.length})` : title
  const accessible = legacy ? text : selected.length ? selected.map(option => option.accessibilityLabel ?? option.label).join(', ') : allLabel
  useEffect(() => {
    if (!open) return
    const option = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')
    option?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') { setOpen(false); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [])]
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next].focus()
  }
  return <div ref={root} className="relative inline-flex min-w-0">
    <button ref={trigger} type="button" aria-label={`${label}: ${accessible}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} className={compactTrigger(Boolean(selected.length))}>{text} <span aria-hidden="true">⌄</span></button>
    {open && <div ref={menu} role="menu" aria-label={legacy ? label : `${label} filter`} onKeyDown={moveFocus} className={`${compactPopup} right-0 ${menuClassName}`}>
      {!legacy && <button type="button" role="menuitemcheckbox" tabIndex={-1} aria-checked={!selected.length} onClick={() => onChange([])} className={compactItem(!selected.length)}>{allLabel}</button>}
      {options.map(option => <button key={option.value} type="button" role="menuitemcheckbox" tabIndex={-1} aria-checked={values.includes(option.value)} onClick={() => onChange(values.includes(option.value) ? values.filter(value => value !== option.value) : [...values, option.value])} className={compactItem(values.includes(option.value))}>{option.label}</button>)}
    </div>}
  </div>
}
