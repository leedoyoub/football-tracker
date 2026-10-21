require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Pitch } = require('../src/components/Pitch.tsx')
const { teamHistoryLayout } = require('../src/engine/teamHistoryLayout.ts')
const slotsFor = (def, mid, fw) => [['GK', 1], ['DEF', def], ['MID', mid], ['FW', fw]].flatMap(([group, count]) => Array.from({ length: count }, (_, index) => ({ slot: `${group}-${index + 1}`, displayPosition: group, position: { GK: 'GK', DEF: 'CB', MID: 'CM', FW: 'ST' }[group], playerId: `${group}-${index + 1}`, teamId: 'T', matches: 4, avgRating: 10 })))
const shapes = [[4, 3, 3], [4, 4, 2], [3, 5, 2], [4, 5, 1], [5, 4, 1], [5, 3, 2], [3, 4, 3], [1, 1, 8], [0, 9, 1], [0, 10, 0], [2, 6, 2], [1, 7, 2], [5, 5, 0]]

test('every team shape uses fixed3:4 and a team-only rating offset without resizing contents', () => {
  for (const shape of shapes) {
    const html = renderToStaticMarkup(React.createElement(Pitch, { slots: teamHistoryLayout(slotsFor(...shape)), players: [], presentation: 'team-history', motmPlayerId: 'MID-1' }))
    assert.match(html, /aspect-\[3\/4\]/)
    assert.doesNotMatch(html, /aspect-\[3\/5\]/)
    assert.match(html, /h-10 w-10 text-\[11px\]/)
    assert.match(html, /h-\[18px\].*?absolute -right-3 -top-1/)
    assert.match(html, /10\.00 ★/)
  }
  const official = renderToStaticMarkup(React.createElement(Pitch, { slots: slotsFor(3, 5, 2), players: [], presentation: 'history' }))
  assert.match(official, /absolute -right-3 -top-3/)
  assert.doesNotMatch(official, /absolute -right-3 -top-1/)
})

test('team cards including click targets and protruding badges fit the350px inner pitch height', () => {
  for (const width of [264, 320, 375, 390]) for (const shape of shapes) {
    const innerWidth = width - 2, innerHeight = width * 4 / 3 - 2
    const cardWidth = Math.min(80, innerWidth * .23)
    const boxes = teamHistoryLayout(slotsFor(...shape)).map(slot => ({ slot: slot.slot, left: slot.x * innerWidth / 100 - cardWidth / 2, right: slot.x * innerWidth / 100 + Math.max(cardWidth / 2, 32), top: slot.y * innerHeight / 100 - 36, bottom: slot.y * innerHeight / 100 + 32 }))
    for (const box of boxes) assert.ok(box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight, `${shape}@${width} ${box.slot} within border`)
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${shape}@${width} ${a.slot}/${b.slot} separate card/badge/click bounds`)
    }
  }
})

test('six-plus group ordering leaves the first and last selected sides at the outer edges', () => {
  for (const group of ['DEF', 'MID', 'FW']) for (let count = 6; count <= 10; count++) {
    const counts = { DEF: 0, MID: 0, FW: 0 }; counts[group] = count; counts[group === 'DEF' ? 'MID' : 'DEF'] = 10 - count
    const input = slotsFor(counts.DEF, counts.MID, counts.FW), before = JSON.stringify(input), result = teamHistoryLayout(input)
    assert.equal(JSON.stringify(input), before)
    assert.deepEqual(result.map(({ x: _x, y: _y, ...slot }) => slot), input)
    const line = result.filter(slot => slot.displayPosition === group)
    assert.equal(line[0].x, Math.min(...line.map(slot => slot.x)))
    assert.equal(line.at(-1).x, Math.max(...line.map(slot => slot.x)))
    assert.ok(line.every((slot, index) => !index || slot.x >= line[index - 1].x))
  }
})

test('team GA rows retain intrinsic pill width and anchor outside labels inside the pitch', () => {
  const slots = teamHistoryLayout(slotsFor(4, 3, 3))
  const html = renderToStaticMarkup(React.createElement(Pitch, { slots, players: [], presentation: 'team-history', statsByPlayer: Object.fromEntries(slots.map(slot => [slot.playerId, { goals: 9999, assists: 9999 }])) }))
  assert.match(html, /width:max-content;min-width:min\(4rem, 100%\);grid-template-columns:auto auto;align-self:flex-start/)
  assert.match(html, /width:max-content;min-width:min\(4rem, 100%\);grid-template-columns:auto auto;align-self:flex-end/)
  assert.equal((html.match(/>9999<\/span>/g) ?? []).length, 22)
})

test('large counters use spare physical rows before reporting fixed-pitch limits', () => {
  for (const shape of [[4,3,3],[3,4,3],[0,10,0]]) {
    const input=slotsFor(...shape), stats=Object.fromEntries(input.map(slot=>[slot.playerId,{goals:9999,assists:9999}]))
    const output=teamHistoryLayout(input,stats)
    const outfield=output.filter(slot=>slot.displayPosition!=='GK')
    assert.equal(new Set(outfield.map(slot=>slot.y)).size,4)
    const counts=new Map();for(const slot of outfield)counts.set(slot.y,(counts.get(slot.y)??0)+1)
    assert.ok([...counts.values()].every(count=>count<=3),'available fifth row avoids four-wide large statistics')
    assert.deepEqual(output.map(({x:_x,y:_y,...slot})=>slot),input)
    for(const group of ['DEF','MID','FW']) {
      const line=output.filter(slot=>slot.displayPosition===group)
      if(line.length>=4){assert.equal(line[0].x,Math.min(...line.map(slot=>slot.x)));assert.equal(line.at(-1).x,Math.max(...line.map(slot=>slot.x)))}
    }
  }
})
