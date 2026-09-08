const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { test } = require('node:test')

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, filename)
const { deriveApiPlayerNames } = require('../src/lib/playerNames.ts')

test('API initials expand only with matching structured fields and retain a surname-style display name', () => {
  assert.deepEqual(deriveApiPlayerNames({ name: 'K. Mbappé', firstname: 'Kylian', lastname: 'Mbappé' }), { fullName: 'Kylian Mbappé', displayName: 'Mbappé' })
  assert.deepEqual(deriveApiPlayerNames({ name: 'J. Bellingham', firstname: 'Jude', lastname: 'Bellingham' }), { fullName: 'Jude Bellingham', displayName: 'Bellingham' })
})

test('structured natural names can safely use a hyphenated surname, without losing Unicode', () => {
  assert.deepEqual(deriveApiPlayerNames({ name: 'Trent Alexander-Arnold', firstname: 'Trent', lastname: 'Alexander-Arnold' }), { fullName: 'Trent Alexander-Arnold', displayName: 'Alexander-Arnold' })
})

test('natural football names beat longer legal fields and are never reduced by a final-word parser', () => {
  assert.deepEqual(deriveApiPlayerNames({ name: 'Vinícius Júnior', firstname: 'Vinícius José Paixão de Oliveira', lastname: 'Júnior' }), { fullName: 'Vinícius Júnior', displayName: 'Vinícius Júnior' })
  assert.deepEqual(deriveApiPlayerNames({ name: 'Ángel Di María' }), { fullName: 'Ángel Di María', displayName: 'Ángel Di María' })
})
