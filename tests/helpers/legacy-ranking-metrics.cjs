const assert = require('node:assert/strict')

const recordsMetrics = new Set(['goodMatches', 'sotAllowed', 'defenderGaPer90', 'goalkeeperGaPer90'])
const recordsLabels = new Set(['7.2+ Matches', 'SOT Allowed/90', 'Defender GA/90', 'GK GA/90'])

// v2.8.0 moves four metrics to Records, adds Appearances, and changes the order and Save % label.
function assertLegacyRankingMetrics(current, archived) {
  const byValue = metrics => new Map(metrics.map(item => [item.value, item.label]))
  const expected = byValue(archived.filter(item => !recordsMetrics.has(item.value)))
  if (expected.has('savePercentage')) expected.set('savePercentage', 'Save %')
  assert.deepEqual(byValue(current.filter(item => item.value !== 'appearances')), expected)
}

function normalizeRankingTabs(markup, label) {
  return markup.replace(/(<div[^>]+aria-label="([^"]+)"[^>]*>)((?:<button[^>]*>[^<]*<\/button>)+)(<\/div>)/g, (whole, start, group, tabs, end) => {
    if (group !== label) return whole
    const shared = [...tabs.matchAll(/<button[^>]*>([^<]*)<\/button>/g)]
      .filter(([, name]) => name !== 'Appearances' && !recordsLabels.has(name))
      .map(([button]) => button.replace(/(?:Qualifying GK Save %|Save Percentage)(?=<\/button>)/, 'Save %'))
      .sort()
    return `${start}${shared.join('')}${end}`
  })
}

module.exports = { assertLegacyRankingMetrics, normalizeRankingTabs }
