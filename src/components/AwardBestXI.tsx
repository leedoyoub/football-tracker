import type { Player, Team } from '../types'
import { Pitch } from './Pitch'
import { awardBestXIProps, type AwardBestXIResult } from './awardBestXIProps'

export type { AwardBestXIResult } from './awardBestXIProps'

export function AwardBestXI({ title, result, players, teams, onPlayerOpen }: { title: string; result: AwardBestXIResult; players: Player[]; teams: Team[]; onPlayerOpen: (id: string) => void }) {
  const props = awardBestXIProps(result)
  return <section className="mb-3 rounded-xl bg-zinc-900 p-3"><h3 className="text-sm font-black">{title}</h3><div className="mt-3"><Pitch {...props} players={players} teams={teams} onSlotClick={slot => slot.playerId && onPlayerOpen(slot.playerId)} /></div></section>
}
