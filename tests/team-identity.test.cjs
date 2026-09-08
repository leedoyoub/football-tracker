const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { STATIC_TEAMS, withStaticTeams } = require('../src/data/teams.ts')
const { selectedPlayerPhoto } = require('../src/lib/playerPhoto.ts')

test('static teams keep canonical IDs and preserve legacy historical teams', () => {
  assert.deepEqual(STATIC_TEAMS.map(team => team.id), ['northside', 'harbor'])
  const legacy = { id: 'historic-opponent', name: 'Historic', shortName: 'HIS', abbreviation: 'HIS', visualStyle: 'solid', primaryColor: 'black', jerseyNumberColor: 'white' }
  const teams = withStaticTeams([legacy])
  assert(teams.some(team => team.id === 'northside'))
  assert(teams.some(team => team.id === legacy.id))
})

test('photo selection is explicit and never replaces player.id', () => {
  assert.deepEqual(selectedPlayerPhoto({ externalPlayerId: 44, name: 'Same Name', photoUrl: 'https://photo.example/44.jpg' }), { externalPlayerId: 44, photoUrl: 'https://photo.example/44.jpg' })
  const icon = fs.readFileSync(require.resolve('../src/components/PlayerIcon.tsx'), 'utf8')
  assert(icon.includes('loading="lazy"') && icon.includes('onError') && icon.includes('photoUrl || player?.image'))
  const migration = fs.readFileSync(require.resolve('../supabase/migrations/20260908090000_add_player_photo_fields.sql'), 'utf8')
  assert(migration.includes('add column if not exists external_player_id') && migration.includes('photo_url'))
})
