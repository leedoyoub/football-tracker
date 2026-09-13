const assert = require('assert');
const { test } = require('node:test');

// Reducer logic from store.tsx
function sameRawMatch(left, right) {
  return left.id === right.id && left.season === right.season && left.matchDay === right.matchDay;
}

function updateMatchReducer(prevMatches, id, replacement) {
  const previous = prevMatches.find(item => item.id === id);
  if (!previous || sameRawMatch(previous, replacement)) return prevMatches;
  return prevMatches.map((item) => item.id === id ? replacement : item);
}

test('updateMatchReducer updates match and preserves ID', () => {
  const matches = [{ id: '1', season: 'S1', matchDay: 1 }];
  const updated = updateMatchReducer(matches, '1', { id: '1', season: 'S1', matchDay: 2 });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].matchDay, 2);
  assert.equal(updated[0].id, '1');
});

test('updateMatchReducer does not duplicate match', () => {
    const matches = [{ id: '1', season: 'S1', matchDay: 1 }];
    const updated = updateMatchReducer(matches, '2', { id: '2', season: 'S1', matchDay: 2 });
    assert.equal(updated.length, 1);
});
