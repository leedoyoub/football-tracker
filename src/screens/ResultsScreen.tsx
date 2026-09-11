import { ResultCard } from '../components/ResultCard'
import { derivedResults } from '../lib/results'
import { isCompletedRecordedMatch } from '../engine/playStyleStats'
import { useStore } from '../store'
import type { View } from '../types'
export function ResultsScreen({ onNavigate, onBack }: { onNavigate: (view: View) => void; onBack: () => void }) { const { matches, teams } = useStore(); const results = derivedResults(matches.filter(isCompletedRecordedMatch), teams).slice(0, 20); return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button><h1 className="mb-1 text-2xl font-semibold">Results</h1><p className="mb-5 text-xs text-zinc-400">Latest 20 completed matches, newest first</p><div className="space-y-2">{results.length ? results.map(result => <ResultCard key={result.match.id} result={result} teams={teams} onClick={() => onNavigate({ name: 'match', id: result.match.id })} />) : <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">No match results yet.</p>}</div></div> }
