import { useState } from 'react';
import { LocalRepository } from '../lib/repository';
import type { View } from '../types';
import { useAuth } from '../lib/auth';

export function DataManagementScreen({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [message, setMessage] = useState('');
  const { user, signInWithGoogle, signOut } = useAuth();

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
        await LocalRepository.importData(json);
        setMessage('Import successful. Please refresh.');
      } catch (e) {
        setMessage('Import failed. Invalid file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="px-4 pb-8 pt-6">
      <button type="button" onClick={() => onNavigate({ name: 'home' })} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button>
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
      </div>
    </div>
  );
}
