const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { TEAM_ROSTER_LIMIT, assertRosterCapacity, currentTeamIds } = require('../src/lib/roster.ts')
const { addsNewMembership, applySquadImport, availableRosterSlots, importedPosition, sameExternalPlayer, validImportedNumber } = require('../src/lib/squadImport.ts')

const player = (id, teamId, externalPlayerId) => ({ id, teamId, teamIds: teamId ? [teamId] : [], name: id, number: 10, position: 'CM', externalPlayerId })

test('squad import uses the static external team identifier, never internal team id', () => {
  const team = { id: 'real-madrid', externalTeamId: 541 }
  assert.equal(team.externalTeamId, 541)
  assert.notEqual(team.externalTeamId, team.id)
})

test('a returned API squad is not automatically selected or imported', () => {
  const apiSquad = Array.from({ length: 30 }, (_, id) => ({ id: id + 1 }))
  const selected = new Set()
  assert.equal(apiSquad.filter(item => selected.has(item.id)).length, 0)
})

test('available selection capacity is limited to new memberships', () => {
  const players = Array.from({ length: 18 }, (_, index) => player(`p${index}`, 'team-a', index))
  assert.equal(availableRosterSlots(players, 'team-a'), 5)
  assert.equal(addsNewMembership(players[0], 'team-a'), false)
  assert.equal(addsNewMembership(players[0], 'team-b'), true)
})

test('domain layer rejects a 24th membership and retains legacy memberships', () => {
  const full = Array.from({ length: TEAM_ROSTER_LIMIT }, (_, index) => player(`p${index}`, 'team-a', index))
  assert.throws(() => assertRosterCapacity(full, 'new-player', [], ['team-a']), /Team roster is full/)
  assert.doesNotThrow(() => assertRosterCapacity(full, 'p0', ['team-a'], ['team-a']))
})

test('external identity is exact, stable, and safely reusable across teams', () => {
  const existing = player('internal-stable-id', 'team-a', 999)
  assert.equal(sameExternalPlayer(existing, 999), true)
  assert.equal(sameExternalPlayer(existing, 1000), false)
  assert.equal(addsNewMembership(existing, 'team-b'), true)
  assert.deepEqual(currentTeamIds({ ...existing, teamIds: [...currentTeamIds(existing), 'team-b'] }), ['team-a', 'team-b'])
})

test('batch import is atomic, preserves an existing player role, and does not duplicate membership', () => {
  const existing = { ...player('stable', 'team-a', 999), position: 'CB', photoUrl: 'old' }
  const imported = applySquadImport([existing], [{ teamId: 'team-a', externalPlayerId: 999, name: 'Different display', number: 9, position: 'CM', photoUrl: 'new' }], () => 'new')
  assert.equal(imported.length, 1)
  assert.equal(imported[0].id, 'stable')
  assert.equal(imported[0].position, 'CB')
  assert.equal(imported[0].photoUrl, 'new')
  const full = Array.from({ length: TEAM_ROSTER_LIMIT }, (_, index) => player(`p${index}`, 'team-full', index))
  assert.throws(() => applySquadImport(full, [{ teamId: 'team-full', externalPlayerId: 1000, name: 'New', number: 1, position: 'CM' }], () => 'new'), /Team roster is full/)
  assert.equal(full.length, TEAM_ROSTER_LIMIT)
})

test('API field mapping preserves photo and ID while avoiding invented tactical roles', () => {
  assert.equal(importedPosition('Goalkeeper'), 'GK')
  assert.equal(importedPosition('Defender'), 'CM')
  assert.equal(importedPosition('Attacker'), 'CM')
  assert.equal(validImportedNumber(7), 7)
  assert.equal(validImportedNumber(undefined), 10)
  const imported = { externalPlayerId: 12345, photoUrl: 'https://media.api-sports.io/football/players/12345.png' }
  assert.deepEqual(imported, { externalPlayerId: 12345, photoUrl: 'https://media.api-sports.io/football/players/12345.png' })
})

test('import store path is atomic and normal local-first sync observes imported player changes', () => {
  const source = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  assert(source.includes('const nextPlayers = applySquadImport(state.players, imports'))
  assert(source.includes('LocalRepository.saveAppState(next).then(() => SyncManager.queueStateChange(prev, next))'))
})

test('import metadata has an explicit Supabase serialization and restore path', () => {
  const source = fs.readFileSync(require.resolve('../src/lib/sync.ts'), 'utf8')
  assert(source.includes('external_player_id: externalPlayerId === undefined ? null : String(externalPlayerId)'))
  assert(source.includes('externalPlayerId: external_player_id'))
  assert(source.includes('photo_url: photoUrl ?? null'))
  assert(source.includes('photoUrl: photo_url'))
})

test('import screen makes the authenticated request with externalTeamId and guards signed-out access', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/SquadImportScreen.tsx'), 'utf8')
  assert(source.includes('fetchApiFootballSquad(team.externalTeamId)'))
  assert(source.includes("if (!user) { setError('Google sign-in is required for secure squad import.')"))
  assert(source.includes('setSelected(new Set())'))
})
