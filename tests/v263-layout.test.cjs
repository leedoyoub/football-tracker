require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Pitch } = require('../src/components/Pitch.tsx')
const { AwardBestXI } = require('../src/components/AwardBestXI.tsx')
const loadLayout = () => {
  assert.ok(fs.existsSync('src/engine/teamHistoryLayout.ts'), 'team-only explicit coordinate layout is available')
  return require('../src/engine/teamHistoryLayout.ts').teamHistoryLayout
}
const slotsFor = (def, mid, fw) => [['GK', 1], ['DEF', def], ['MID', mid], ['FW', fw]].flatMap(([group, count]) => Array.from({ length: count }, (_, index) => ({ slot: `${group}-${index + 1}`, displayPosition: group, position: { GK: 'GK', DEF: 'CB', MID: 'CM', FW: 'ST' }[group], playerId: `${group}-${index + 1}`, teamId: 'T', matches: 4, avgRating: 7.1 })))
const row = (slots, group) => slots.filter(slot => slot.displayPosition === group)

test('team history layouts preserve existing one-to-four spacing and result metadata', () => {
  const layout = loadLayout()
  for (const [def, mid, fw] of [[4, 3, 3], [4, 4, 2], [3, 4, 3], [3, 3, 4]]) {
    const input = slotsFor(def, mid, fw), before = JSON.stringify(input), output = layout(input)
    assert.equal(JSON.stringify(input), before, 'saved/cached selection is not mutated')
    assert.deepEqual(output.map(({ x: _x, y: _y, ...slot }) => slot), input)
    assert.deepEqual(row(output, 'GK').map(s => [s.x, s.y]), [[50, 88]])
    const spacing = count => ({ 1: [50], 2: [35, 65], 3: [20, 50, 80], 4: [13, 38, 62, 87] })[count]
    for (const [group, count, y] of [['DEF', def, 69], ['MID', mid, 46], ['FW', fw, 22]]) {
      assert.deepEqual(row(output, group).map(s => s.x), group === 'MID' && count === 3 ? [25, 50, 75] : spacing(count))
      assert.ok(row(output, group).every(s => s.y === y))
    }
  }
})

test('3-5-2 and 4-5-1 use upper odd/lower even zigzags with vacant slots retaining geometry', () => {
  const layout = loadLayout()
  for (const shape of [[3, 5, 2], [4, 5, 1]]) {
    const input = slotsFor(...shape); input[5].playerId = null
    const output = layout(input), midfield = row(output, 'MID')
    assert.deepEqual(midfield.map(s => s.x), [13, 34, 50, 66, 87])
    assert.ok(midfield[0].y < midfield[1].y && midfield[2].y < midfield[3].y && midfield[4].y < midfield[3].y)
    assert.equal(new Set(midfield.filter((_, i) => i % 2 === 0).map(s => s.y)).size, 1)
    assert.equal(output[5].playerId, null)
    assert.equal(new Set(output.map(s => `${s.x}:${s.y}`)).size, 11)
    assert.ok(Math.max(...row(output, 'FW').map(s => s.y)) < Math.min(...midfield.map(s => s.y)))
    assert.ok(Math.max(...midfield.map(s => s.y)) < Math.min(...row(output, 'DEF').map(s => s.y)))
  }
})

test('five-plus team pitches leave full card and badge bounds clear at 264px mobile width', () => {
  const layout = loadLayout(), width = 264, height = width * 5 / 3
  for (const shape of [[3, 5, 2], [4, 5, 1], [5, 4, 1], [1, 1, 8], [0, 9, 1], [0, 10, 0]]) {
    const slots = layout(slotsFor(...shape))
    // Conservative shared Pitch card envelope:40px avatar,18px badge at-12px,
    // goals/assists row and16px name. Check whole cards, not just center points.
    // Names/stats are capped to the shared23% card width; top-right badge
    // extends32px from the center and the team crest extends24px to the left.
    const leftExtent = Math.max(24, width * .23 / 2)
    const bounds = slots.map(slot => ({ left: slot.x * width / 100 - leftExtent, right: slot.x * width / 100 + 32, top: slot.y * height / 100 - 44, bottom: slot.y * height / 100 + 32 }))
    for (const box of bounds) assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height)
    for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j]
      assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `cards ${slots[i].slot}/${slots[j].slot} do not overlap in ${shape}`)
    }
    const html = renderToStaticMarkup(React.createElement(Pitch, { slots, players: [], presentation: 'team-history', statsByPlayer: Object.fromEntries(slots.map(slot => [slot.playerId, { goals: 2, assists: 2 }])) }))
    assert.match(html, /aspect-\[3\/5\]/)
    assert.match(html, /w-16 max-w-full grid-cols-2/)
  }
  const normal = renderToStaticMarkup(React.createElement(Pitch, { slots: layout(slotsFor(4, 3, 3)), players: [], presentation: 'team-history' }))
  assert.match(normal, /aspect-\[3\/4\]/)
  const official = renderToStaticMarkup(React.createElement(Pitch, { slots: slotsFor(3, 5, 2), players: [] }))
  assert.match(official, /aspect-\[3\/4\]/)
})

test('six-to-eight player groups use separated rows within mobile pitch bounds', () => {
  const layout = loadLayout()
  for (const group of ['DEF', 'MID', 'FW']) for (const count of [6, 7, 8]) {
    const counts = { DEF: 1, MID: 1, FW: 1 }; counts[group] = count; counts[group === 'DEF' ? 'MID' : 'DEF'] += 8 - count
    const output = layout(slotsFor(counts.DEF, counts.MID, counts.FW)), crowded = row(output, group)
    assert.equal(output.length, 11)
    assert.equal(new Set(crowded.map(s => s.y)).size, 2)
    assert.ok(output.every(s => s.x >= 13 && s.x <= 87 && s.y >= 14 && s.y <= 88))
    const lines = [...new Set(output.map(s => s.y))].sort((a, b) => a - b)
    assert.ok(lines.every((y, i) => !i || y - lines[i - 1] >= 17), 'rows leave room for icons, ratings and names')
    for (const [upper, lower] of [['FW', 'MID'], ['MID', 'DEF'], ['DEF', 'GK']]) assert.ok(Math.max(...row(output, upper).map(s => s.y)) < Math.min(...row(output, lower).map(s => s.y)))
  }
})

test('team vacancies are passive opt-in placeholders and default award pitches are unchanged', () => {
  const slots = [{ ...slotsFor(4, 3, 3)[0], playerId: null, x: 50, y: 88 }]
  const normal = renderToStaticMarkup(React.createElement(Pitch, { slots, players: [] }))
  const team = renderToStaticMarkup(React.createElement(Pitch, { slots, players: [], showEmptySlots: true }))
  assert.doesNotMatch(normal, /Vacant GK slot/)
  assert.match(team, /Vacant GK slot/)
  assert.doesNotMatch(team, /<button/)
  const award = renderToStaticMarkup(React.createElement(AwardBestXI, { title: 'Team', result: { bestXI: slots, statsByPlayer: {} }, players: [], teams: [], onPlayerOpen: () => {}, showEmptySlots: true }))
  assert.match(award, /Vacant GK slot/)
  const opened = []
  const element = AwardBestXI({ title: 'Team', result: { bestXI: slots, statsByPlayer: {} }, players: [], teams: [], onPlayerOpen: id => opened.push(id), presentation: 'team-history' })
  const pitch = element.props.children[1].props.children
  pitch.props.onSlotClick({ playerId: 'past-player' })
  pitch.props.onSlotClick({ playerId: null })
  assert.deepEqual(opened, ['past-player'])
  assert.equal(pitch.props.presentation, 'team-history')
})
