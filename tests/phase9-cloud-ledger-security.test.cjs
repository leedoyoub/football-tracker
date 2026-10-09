const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261010120000_add_revisioned_cloud_sync.sql'), 'utf8')
const sync = fs.readFileSync(path.join(__dirname, '../src/lib/sync.ts'), 'utf8')

test('cloud ledger grants only SELECT to authenticated and uses private SECURITY DEFINER write helpers', () => {
  assert.match(migration, /revoke all on public\.cloud_sync_state, public\.cloud_sync_entities from anon, authenticated/i)
  assert.match(migration, /grant select on public\.cloud_sync_state, public\.cloud_sync_entities to authenticated/i)
  assert.match(migration, /create or replace function private\.initialize_cloud_sync[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, auth/i)
  assert.match(migration, /create or replace function private\.commit_cloud_sync[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, auth/i)
  assert.match(migration, /revoke all on function private\.initialize_cloud_sync\(jsonb\) from public, anon/i)
  assert.match(migration, /grant execute on function public\.commit_cloud_sync\(bigint, jsonb\) to authenticated/i)
  assert.doesNotMatch(migration, /create policy [^;]+ for (insert|update) to authenticated on public\.cloud_sync_(state|entities)/i)
})

test('sync blocks a legacy queue conflict before cloud write or local replacement', () => {
  assert.match(sync, /if \(merged\.blockedQueueIds\.length\)[\s\S]*?return \{ status: 'pending', message \}/)
  assert.match(sync, /Local data and its sync queue were kept/)
  assert.match(sync, /carriesUnknownLegacyBase[\s\S]*?prior\.baseRevision === undefined/)
})
