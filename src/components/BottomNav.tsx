import type { Tab } from '../types'

const ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'teams', label: 'Teams', icon: '◈' },
  { id: 'news', label: 'News', icon: '◉' },
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'records', label: 'Records', icon: '▤' },
  { id: 'players', label: 'Players', icon: '●' },
]

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return <nav className="app-bottom-nav absolute bottom-0 z-30 w-full border-t border-white/10 bg-zinc-950/95 backdrop-blur-md"><div className="grid h-full grid-cols-5 px-2 pb-[var(--nav-safe-bottom)] pt-2">{ITEMS.map(item => <button key={item.id} type="button" onClick={() => onChange(item.id)} className={`flex flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-medium ${tab === item.id ? 'text-emerald-400' : 'text-zinc-500'}`}><span className="text-lg leading-none">{item.icon}</span>{item.label}</button>)}</div></nav>
}
