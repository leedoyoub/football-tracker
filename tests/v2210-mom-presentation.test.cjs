const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { Badge, SubstitutePlayerCard } = require('../src/components/ui.tsx')
const { getMatchManOfTheMatch } = require('../src/engine/rating.ts')

function findElement(node, type) {
  if (Array.isArray(node)) return node.map(item => findElement(item, type)).find(Boolean)
  if (!node || typeof node !== 'object') return undefined
  if (node.type === type) return node
  return findElement(node.props?.children, type)
}

function substituteBadge({ rating, isMotm = false } = {}) {
  const player = { id: 'sub', name: 'Substitute', displayName: 'Substitute', teamId: 'A', position: 'ST', number: 14 }
  return findElement(SubstitutePlayerCard({ player, rating, isMotm, onClick: () => {} }), Badge)
}

test('v2.2.10 substitute MOM gets the blue star rating badge while a high-rated non-MOM substitute remains normal', () => {
  const motm = substituteBadge({ rating: 8.4, isMotm: true })
  const normal = substituteBadge({ rating: 8.4 })
  assert.equal(motm.props.colorClass, 'bg-blue-500 text-white')
  assert.equal(motm.props.children, '8.4 ★')
  assert.match(normal.props.colorClass, /emerald/)
  assert.equal(normal.props.children, '8.4')
})

test('v2.2.10 unused bench players remain unrated and cannot receive MOM presentation', () => {
  const unused = substituteBadge({ isMotm: true })
  assert.equal(unused.props.colorClass, 'bg-zinc-700 text-zinc-300')
  assert.equal(unused.props.children, '-')
})

test('v2.2.10 Match Detail uses the canonical substitute MOM for Pitch, Bench, Ratings, and Match Facts', () => {
  const starter = { id: 'starter', name: 'Starter', displayName: 'Starter', teamId: 'A', position: 'CM', number: 8 }
  const substitute = { id: 'sub', name: 'Substitute', displayName: 'Substitute', teamId: 'A', position: 'ST', number: 14 }
  const match = {
    id: 'substitute-mom', season: 'S1', matchDay: 1, date: '2026-09-20', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B',
    appearances: [
      { playerId: starter.id, teamId: 'A', position: 'CM', matchPosition: 'CM', role: 'starter' },
      { playerId: substitute.id, teamId: 'A', position: 'ST', matchPosition: 'ST', role: 'bench' },
    ],
    events: [
      { id: 'sub-on', type: 'sub', minute: 10, teamId: 'A', playerOutId: starter.id, playerInId: substitute.id, position: 'ST' },
      ...Array.from({ length: 5 }, (_, index) => ({ id: `goal-${index}`, type: 'goal', minute: index + 20, teamId: 'A', playerId: substitute.id })),
    ],
  }
  assert.equal(getMatchManOfTheMatch(match, [starter, substitute]), substitute.id)

  const detail = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  const pitch = fs.readFileSync(require.resolve('../src/components/Pitch.tsx'), 'utf8')
  assert.match(detail, /const momId = getMatchManOfTheMatch\(match, players\)/)
  assert.match(detail, /motmPlayerId=\{momId\}/)
  assert.match(detail, /isMotm=\{id === momId\}/)
  assert.match(detail, /appearance\.playerId === momId/)
  assert.match(detail, /momId \? byId\[momId\]/)
  assert.match(pitch, /player\.id === motmPlayerId \? 'bg-blue-500 text-white'/)
  assert.match(pitch, /player\.id === motmPlayerId \? ' ★' : ''/)
})
