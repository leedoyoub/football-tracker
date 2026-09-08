const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { STATIC_TEAMS, withStaticTeams } = require('../src/data/teams.ts')
const { selectedPlayerPhoto } = require('../src/lib/playerPhoto.ts')

test('static catalog has exactly the intended API-Football mapped teams', () => {
  assert.equal(STATIC_TEAMS.length, 14)
  assert.deepEqual(STATIC_TEAMS.map(team => team.name), ['Real Madrid', 'Barcelona', 'Atlético Madrid', 'Arsenal', 'Manchester City', 'Liverpool', 'Manchester United', 'Tottenham Hotspur', 'Chelsea', 'Bayern Munich', 'AC Milan', 'Inter Milan', 'Juventus', 'Paris Saint-Germain'])
  assert.equal(new Set(STATIC_TEAMS.map(team => team.id)).size, 14)
  assert.equal(new Set(STATIC_TEAMS.map(team => team.externalTeamId)).size, 14)
  assert(STATIC_TEAMS.every(team => team.abbreviation && team.logo && team.logo.includes(String(team.externalTeamId))))
  const legacy = { id: 'historic-opponent', name: 'Historic', shortName: 'HIS', abbreviation: 'HIS', visualStyle: 'solid', primaryColor: 'black', jerseyNumberColor: 'white' }
  const teams = withStaticTeams([legacy])
  assert.equal(teams.length, 14)
  assert(!teams.some(team => team.id === legacy.id))
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
