import { NewMatchScreen } from './NewMatchScreen'
import type { View } from '../types'

export function EditMatchScreen({ matchId, onNavigate }: { matchId: string; onNavigate: (view: View) => void }) {
  return <NewMatchScreen editingMatchId={matchId} onNavigate={onNavigate} />
}
