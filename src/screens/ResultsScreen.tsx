import { useMemo } from 'react'
import { VirtualCardList } from '../components/VirtualCardList'
import type { DerivedResult } from '../lib/results'
import { ResultCard } from '../components/ResultCard'
import { derivedResults, isCompletedRecordedMatch } from '../lib/results'
import { useStore } from '../store'
import type { View } from '../types'
const resultKey = (row: DerivedResult) => row.match.id
export function ResultsScreen({ onNavigate, onBack }: { onNavigate: (view: View) => void; onBack: () => void }) { const { matches, teams } = useStore(); const results = useMemo(() => derivedResults(matches.filter(isCompletedRecordedMatch), teams), [matches, teams]); return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="mb-3 min-h-9 px-1 text-xs font-semibold text-emerald-400">← Back</button><h1 className="mb-1 text-2xl font-semibold">Results</h1><p className="mb-5 text-xs text-zinc-400">Completed matches · newest first</p><div className="space-y-2">{results.length ? <VirtualCardList rows={results} itemKey={resultKey} estimate={80} measurementOwner={matches} renderRow={result => <ResultCard result={result} teams={teams} showCompetition onMatchNavigate={() => onNavigate({ name: 'match', id: result.match.id })} onTeamNavigate={id => onNavigate({ name: 'team', id })} />} /> : <p className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">No match results yet.</p>}</div></div> }
