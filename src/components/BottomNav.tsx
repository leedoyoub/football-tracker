import type { Tab } from '../types'

const ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'teams', label: 'Teams', icon: '▣' },
  { id: 'players', label: 'Players', icon: '◉' },
]

export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <nav className="absolute bottom-0 w-full border-t border-white/10 bg-zinc-950/95 backdrop-blur-md">
      <div className="grid grid-cols-3 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
        {ITEMS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-medium ${
                active ? 'text-emerald-400' : 'text-zinc-500'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
