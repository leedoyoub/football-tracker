import { NewMatchScreen } from './NewMatchScreen'
import type { View } from '../types'

export function EditMatchScreen({ matchId, onReplace, onBack, onComplete }: { matchId: string; onReplace: (view: View) => void; onBack: () => void; onComplete: (view: View) => void }) {
  return <NewMatchScreen editingMatchId={matchId} onReplace={onReplace} onBack={onBack} onComplete={onComplete} />
}
