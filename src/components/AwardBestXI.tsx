import type { Player, Team } from '../types'
import { Pitch } from './Pitch'
import { awardBestXIProps, type AwardBestXIResult } from './awardBestXIProps'

export type { AwardBestXIResult } from './awardBestXIProps'

export function AwardBestXI({ title, result, players, teams, open = false, onPlayerOpen }: { title: string; result: AwardBestXIResult; players: Player[]; teams: Team[]; open?: boolean; onPlayerOpen: (id: string) => void }) {
  const props = awardBestXIProps(result)
  return <details className="mb-3 rounded-xl bg-zinc-900 p-3" open={open}><summary className="cursor-pointer text-sm font-black">{title}</summary><div className="mt-3"><Pitch {...props} players={players} teams={teams} onSlotClick={slot => slot.playerId && onPlayerOpen(slot.playerId)} /></div></details>
}
