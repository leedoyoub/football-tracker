import { useMemo, useState } from 'react';
import { LocalRepository } from '../lib/repository';
import { useAuth } from '../lib/auth';
import { useStore } from '../store';
import { auditDataIntegrity } from '../engine/integrity'
import type { ScreenStateByView, View } from '../types'
import { EMPTY_COMPETITION_STATES } from './recordsLeaderboards'

type ScreenState = ScreenStateByView['data-management']
export function DataManagementScreen({ onBack, onNavigate, screenState, onStateChange }: { onBack: () => void; onNavigate: (view: View) => void; screenState: ScreenState; onStateChange: (state: ScreenState) => void }) {
  const [message, setMessage] = useState('');
  const showIntegrity = screenState.showIntegrity ?? false
  const { user, signInWithGoogle, signOut } = useAuth();
  const { importAppState } = useStore()

  const handleExport = async () => {
    try {
      const data = await LocalRepository.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `football-tracker-backup-${new Date().toISOString()}.json`;
      a.click();
      setMessage('Export successful');
    } catch (e) {
      setMessage('Export failed');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        await importAppState(json);
        setMessage('Import successful.');
      } catch (e) {
        setMessage('Import failed. Invalid file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="px-4 pb-8 pt-6">
      <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button>
      <h1 className="mb-4 text-2xl font-semibold">Data Management</h1>
      <div className="space-y-4">
        {user ? (
          <div className="rounded-xl bg-zinc-900 p-4 text-sm">
            <p className="mb-2 text-zinc-400">Signed in as: {user.email}</p>
            <button type="button" onClick={signOut} className="w-full rounded-xl bg-red-900 py-2 font-bold">Sign out</button>
          </div>
        ) : (
          <button type="button" onClick={signInWithGoogle} className="w-full rounded-xl bg-white p-4 text-sm font-bold text-black">Sign in with Google</button>
        )}
        <button type="button" onClick={handleExport} className="w-full rounded-xl bg-zinc-900 p-4 text-sm font-bold">Export Data</button>
        <label className="block w-full rounded-xl bg-zinc-900 p-4 text-center text-sm font-bold cursor-pointer">
          Import Data
          <input type="file" accept=".json" onChange={handleImport} className="hidden" />
        </label>
        {message && <p className="text-center text-xs text-zinc-400">{message}</p>}
        <section className="rounded-xl bg-zinc-900 p-3">
          <button type="button" aria-expanded={showIntegrity} onClick={() => onStateChange({ ...screenState, showIntegrity: !showIntegrity })} className="flex min-h-10 w-full items-center justify-between text-left text-sm font-semibold">
            Data Integrity <span aria-hidden="true" className="text-emerald-300">{showIntegrity ? '−' : '+'}</span>
          </button>
          {showIntegrity && <IntegrityResults onNavigate={onNavigate} />}
        </section>
      </div>
    </div>
  );
}

function IntegrityResults({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { matches, players, teams, competitionStates = EMPTY_COMPETITION_STATES } = useStore()
  const audit = useMemo(() => auditDataIntegrity(matches, players, teams, competitionStates), [matches, players, teams, competitionStates])
  return <div className="text-xs">
    <p className="text-zinc-400">{audit.issues.length ? `${audit.errors} errors · ${audit.warnings} warnings` : 'No issues found.'}</p>
    <ul className="mt-2 space-y-2">{audit.issues.map((issue, index) => <li key={`${issue.matchId ?? 'global'}-${index}`} className="rounded-lg bg-black/25 p-2">
      <div className="flex items-center justify-between gap-2">
        <b className={issue.severity === 'error' ? 'text-rose-300' : issue.severity === 'warning' ? 'text-amber-300' : 'text-sky-300'}>{issue.severity.toUpperCase()}</b>
        {issue.matchId && <button type="button" onClick={() => onNavigate({ name: 'match', id: issue.matchId! })} className="min-h-9 text-emerald-300">Open match</button>}
      </div>
      <p className="text-zinc-300">{issue.message}</p>
    </li>)}</ul>
  </div>
}
