import { useEffect, useRef } from 'react'

export function MinuteInput({
  value,
  onChange,
  onConfirm,
  onCommit,
  label,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  onConfirm?: () => void
  onCommit?: () => void
  label: string
  autoFocus?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) input.current?.focus()
  }, [autoFocus])
  return (
    <label className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500">
      {label}
      <input
        ref={input}
        aria-label={label}
        type="text"
        inputMode="numeric"
        pattern="[0-9]{1,2}"
        maxLength={2}
        value={value}
        onChange={(event) => {
          if (/^\d{0,2}$/.test(event.target.value)) onChange(event.target.value)
        }}
        onBlur={() => onCommit?.()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onConfirm?.()
        }}
        onFocus={(event) => event.currentTarget.scrollIntoView?.({ block: 'nearest' })}
        className="ml-auto w-16 rounded-xl bg-black px-3 py-2 text-base text-white"
      />
    </label>
  )
}
