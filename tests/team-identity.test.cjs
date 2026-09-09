const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { STATIC_TEAMS, withStaticTeams } = require('../src/data/teams.ts')
const { selectedPlayerPhoto } = require('../src/lib/playerPhoto.ts')

test('static catalog has the 16 intended API-Football teams in requested order', () => {
  assert.equal(STATIC_TEAMS.length, 16)
  assert.equal(new Set(STATIC_TEAMS.map(team => team.id)).size, 16)
  assert.equal(new Set(STATIC_TEAMS.map(team => team.externalTeamId)).size, 16)
  const bayern = STATIC_TEAMS.findIndex(team => team.id === 'bayern-munich')
  assert.equal(STATIC_TEAMS[bayern + 1].id, 'borussia-dortmund')
  assert.equal(STATIC_TEAMS[bayern + 1].externalTeamId, 165)
  assert.equal(STATIC_TEAMS.at(-1).id, 'inter-miami')
  assert.equal(STATIC_TEAMS.at(-1).externalTeamId, 9568)
  assert(STATIC_TEAMS.every(team => team.abbreviation && team.logo && team.logo.includes(String(team.externalTeamId))))
})

test('catalog reconciliation is additive, preserves existing data, and prevents duplicate real teams', () => {
  const legacy = { id: 'historic-opponent', name: 'Historic', shortName: 'HIS', abbreviation: 'HIS', visualStyle: 'solid', primaryColor: 'black', jerseyNumberColor: 'white' }
  const existingBayern = { ...STATIC_TEAMS.find(team => team.id === 'bayern-munich'), name: 'My Bayern', customFlag: true }
  const existingDortmund = { ...STATIC_TEAMS.find(team => team.id === 'borussia-dortmund'), id: 'my-dortmund', name: 'My Dortmund' }
  const teams = withStaticTeams([legacy, existingBayern, existingDortmund])
  assert.equal(teams[0], legacy)
  assert.equal(teams.find(team => team.id === 'bayern-munich').name, 'My Bayern')
  assert.equal(teams.filter(team => team.externalTeamId === 165).length, 1)
  assert.equal(teams.filter(team => team.externalTeamId === 9568).length, 1)
  assert.equal(withStaticTeams(teams).length, teams.length)
})

test('photo selection is explicit and changes only photoUrl', () => {
  assert.deepEqual(selectedPlayerPhoto({ externalPlayerId: 44, name: 'Same Name', photoUrl: 'https://photo.example/44.jpg' }), { photoUrl: 'https://photo.example/44.jpg' })
  const icon = fs.readFileSync(require.resolve('../src/components/PlayerIcon.tsx'), 'utf8')
  assert(icon.includes('loading="lazy"') && icon.includes('onError') && icon.includes('photoUrl || player?.image'))
  const migration = fs.readFileSync(require.resolve('../supabase/migrations/20260908090000_add_player_photo_fields.sql'), 'utf8')
  assert(migration.includes('add column if not exists external_player_id') && migration.includes('photo_url'))
})

test('all static crest shapes use the shared circular safe-area renderer', () => {
  const icon = fs.readFileSync(require.resolve('../src/components/TeamIcon.tsx'), 'utf8')
  const ids = ['arsenal', 'barcelona', 'atletico-madrid', 'liverpool', 'tottenham-hotspur']
  assert(ids.every(id => STATIC_TEAMS.some(team => team.id === id && team.logo)))
  assert(icon.includes('inset-[15%]'))
  assert(icon.includes('object-contain object-center'))
  assert(icon.includes('max-h-full max-w-full'))
  assert(!icon.includes('p-1 object-contain'))
})
