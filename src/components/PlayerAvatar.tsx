import { useState } from 'react'

/** Shared non-cropping player portrait circle with the established jersey fallback. */
export function PlayerAvatar({ photoUrl, number, className = 'h-10 w-10 text-[11px]' }: { photoUrl?: string; number?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const showPhoto = Boolean(photoUrl) && !failed
  // The white layer is photo-only. A missing or failed image retains the
  // existing dark number fallback exactly as before.
  return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 ${showPhoto ? 'bg-white' : 'bg-zinc-700 text-white'} ${className}`}>{showPhoto && <span className="pointer-events-none absolute inset-[8%] flex items-center justify-center"><img src={photoUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="block h-full w-full max-h-full max-w-full object-contain object-center" /></span>}{!showPhoto && <span className="relative z-10 font-black" aria-label="Jersey number">{number ?? '—'}</span>}</span>
}
