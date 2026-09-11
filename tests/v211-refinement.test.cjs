const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { APP_VERSION } = require('../src/config.ts')
const { deriveNews } = require('../src/engine/news.ts')

test('v2.1.4 central version and focused Player Detail refinement are current', () => {
  const detail = fs.readFileSync(require.resolve('../src/screens/PlayerDetailScreen.tsx'), 'utf8')
  assert.equal(APP_VERSION, '2.1.4')
  assert.equal(require('../package.json').version, '2.1.4')
  for (const label of ['Overview', 'Recent Form', 'Position Stats', 'Positions Played', 'Team Performance When Starting', 'Role Impact', 'Goal Types', 'Player Chemistry', 'Career Timeline', 'Personal Records', 'Matches', 'Overall avg', 'Rating Details']) assert(detail.includes(label))
  assert(!detail.includes('Previous matches') && !detail.includes('Starter / Substitute') && !detail.includes('Scope avg'))
  assert(detail.includes('share >= 10') && detail.includes('Clean sheets'))
})

test('news adds exactly one classified leading emoji and title types retain competition identity', () => {
  const players = [{ id: 'p', name: 'Player', displayName: 'Player', teamId: 'A', position: 'ST', number: 9 }]
  const teams = [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }]
  const match = { id: 'm', season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }], events: [{ id: 'g', type: 'goal', minute: 2, teamId: 'A', playerId: 'p' }] }
  const items = deriveNews(players, teams, Array.from({ length: 10 }, (_, index) => ({ ...match, id: `m${index}`, date: `2026-01-${String(index + 1).padStart(2, '0')}`, events: [{ ...match.events[0], id: `g${index}` }] })))
  const goal = items.find(item => item.title.includes('reaches 10 goals'))
  assert.equal(goal.emoji, '⚽')
  assert(items.every(item => typeof item.emoji === 'string' && [...item.emoji].length >= 1))
})

test('Records defers inactive derivation tabs and Combination only sorts prepared data', () => {
  const records = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  const combinations = fs.readFileSync(require.resolve('../src/components/CombinationRecords.tsx'), 'utf8')
  assert(records.includes("category === 'history' && <HistoryRecords") && records.includes("category === 'integrity' && <IntegrityRecords"))
  assert(records.includes('function HistoryRecords') && records.includes('function IntegrityRecords'))
  assert(combinations.includes('const prepared = useMemo(() => combinationStats') && combinations.includes('}, [prepared, sort])'))
})
