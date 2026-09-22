import { NewMatchScreen } from './NewMatchScreen'
import type { View } from '../types'

export function EditMatchScreen({ matchId, onReplace, onBack }: { matchId: string; onReplace: (view: View) => void; onBack: () => void }) {
  return <NewMatchScreen editingMatchId={matchId} onReplace={onReplace} onBack={onBack} />
}
