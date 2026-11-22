require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { launchBrowser, serveBuild, delay } = require('./helpers/v267-browser.cjs')
const { profilingPlugin, draftFixture, instrumentationSeed } = require('./v268-profiler.browser.cjs')
const { baselineRoot, base, root, work } = require('./helpers/v2611-baseline.cjs')
const samples = Number(process.env.V2611_EDITOR_SAMPLES || 7)
const sides = (process.env.V2611_EDITOR_SIDES || 'before,after').split(',')
const output = process.env.V2611_EDITOR_OUTPUT || path.join(work, 'editor.json')
const prefix = '(window as any).__v268Profile'

function editorInstrumentation() {
  const files = {
    'Pitch.tsx': ['Pitch'],
    'PlayerIcon.tsx': ['PlayerIcon'],
    'PlayerAvatar.tsx': ['PlayerAvatar'],
    'MinuteInput.tsx': ['MinuteInput'],
    'editorRestore.ts': ['restoreDraft'],
    'tacticalHistory.ts': ['previewGoalEvent', 'tacticalAssignmentsAtMoment'],
    'timeline.ts': ['orderedEventList'],
    'NewMatchScreen.tsx': ['MatchEditor', 'LiveMatchStep', 'RosterPlayerGroup'],
  }
  return {
    name: 'football-editor-call-counts',
    enforce: 'pre',
    load(id) {
      // Limit Tailwind discovery to each build's source directory so the
      // nested baseline cannot pick up classes from other worktree artifacts.
      if (/[\\/]src[\\/]index\.css$/.test(id)) {
        return fs.readFileSync(id, 'utf8').replace('@import "tailwindcss";', '@import "tailwindcss" source("./");')
      }
    },
    transform(code, id) {
      const filename = id.split(/[\\/]/).at(-1)
      if (filename === 'developmentMeasurement.ts') return `
        export function measureInDevelopment<T>(label: string, callback: () => T): T {
          const measured = (window as any).__v268Profile?.timings
          if (!measured) return callback()
          const at = performance.now()
          try { return callback() } finally { measured.push({label, at, duration: performance.now() - at}) }
        }`
      const names = files[filename]
      if (!names) return
      for (const name of names) {
        const start = code.indexOf('function ' + name + '(')
        assert(start >= 0, name)
        const signatureEnd = /\) *(?:: [^\r\n]*)? \{(?:\r?\n| )/.exec(code.slice(start))
        assert(signatureEnd, name)
        const position = start + signatureEnd.index + signatureEnd[0].length
        code = code.slice(0, position) + `  if (typeof window !== 'undefined' && ${prefix}?.counts) ${prefix}.counts.${name} = (${prefix}.counts.${name} || 0) + 1;\n` + code.slice(position)
      }
      return code
    },
  }
}

async function build(side) {
  const source = side === 'before' ? baselineRoot() : root
  const outDir = path.join(work, side + '-dist')
  const vite = await import('vite')
  process.chdir(source)
  try {
    await vite.build({
      root: source,
      configFile: path.join(source, 'vite.config.ts'),
      mode: 'production',
      plugins: [profilingPlugin(), editorInstrumentation()],
      resolve: { alias: [{ find: /^react-dom\/client$/, replacement: require.resolve('react-dom/profiling') }] },
      define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""', 'import.meta.env.VITE_ENABLE_CLOUD_SYNC': '"false"' },
      build: { outDir, emptyOutDir: true },
    })
  } finally { process.chdir(root) }
  return serveBuild(outDir)
}

const button = label => `[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)})`
const select = css => `document.querySelector(${JSON.stringify(css)})`
const field = label => select(`input[aria-label="${label}"]`)
const click = el => `(${el}).click()`
const editTarget = kind => `[...document.querySelectorAll('button')].find(el=>/^\\d+' ${kind}/.test(el.textContent))`

async function action(page, expression, verify = 'true') {
  return page.evaluate(`(() => {
    const m = window.__v268Profile ??= { commits: [], storage: [] };
    const start = performance.now(), commits = m.commits.length, storage = m.storage.length;
    m.counts = {};
    ${expression};
    const handler = performance.now() - start;
    return new Promise((resolve, reject) => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!(${verify})) return reject(new Error('Action failed: ' + document.body.innerText.slice(0,400)));
      const renders = m.commits.slice(commits);
      resolve({
        handler, frames: performance.now() - start, counts: m.counts, start, storage,
        render: renders.reduce((total, c) => total + c.actualDuration, 0),
        commits: renders.length,
        commitAt: renders.map(c => c.commitTime - start),
      });
    })));
  })()`)
}

function type(label, value) {
  return `const input = ${field(label)};
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input',{bubbles:true}));`
}

async function measure(browser, server, fixture, width, side) {
  const seed = instrumentationSeed(fixture) + '\nwindow.__v268Profile.timings = [];'
  const page = await browser.page(seed, width)
  const sot = 'button[aria-label="Opponent SOT"]'
  try {
    await page.command('Network.setBlockedURLs', { urls: ['https://*'] })
    await page.navigate(server.url)
    await page.waitFor(`!!${select(sot)}`)
    await delay(650)
    const rows = {}
    for (const [kind, label] of [['Goal', 'Goal Time'], ['Conceded', 'Conceded Goal Time'], ['Substitution', 'Substitution Time']]) {
      await action(page, click(editTarget(kind)), `!!${button('EDIT')}`)
      rows[kind] = await action(page, click(button('EDIT')), `!!${field(label)}`)
      await action(page, click(button('CANCEL')), `!${field(label)}`)
    }
    await action(page, click(select(sot)), `!!${field('Full Match SOT')}`)
    const value = fixture.state.draftMatch.fulltimeOpponentSot + 2
    const full = field('Full Match SOT')
    rows.fulltime = await action(page, `${full}.focus(); ${type('Full Match SOT', value)}`, `${full}.value === '${value}' && document.activeElement === ${full}`)
    const increment = select('button[aria-label="Full Match SOT increase"]')
    const decrement = select('button[aria-label="Full Match SOT decrease"]')
    rows.steps = await action(page, `${click(increment)};${click(increment)};${click(decrement)}`)
    rows.steps.value = Number(await page.evaluate(`${full}.value`))
    if (side === 'after') assert.equal(rows.steps.value, value + 1)
    const stepped = rows.steps.value
    const half = fixture.state.draftMatch.halftimeOpponentSot + 1
    rows.half = await action(page, type('1H SOT', half), `${field('1H SOT')}.value === '${half}' && ${full}.value === '${stepped}'`)
    await page.waitFor(`window.__v268Profile.mirrors.some(row => row.fulltimeOpponentSot === ${stepped} && row.halftimeOpponentSot === ${half})`)
    rows.autosave = await page.evaluate(`(() => {
      const m = window.__v268Profile, start = ${rows.half.start};
      const writes = m.storage.slice(${rows.half.storage}).filter(e => e.key === 'football-tracker-v1');
      const last = writes.at(-1);
      const mirror = m.mirrors.find(e => e.startedAt >= start && e.fulltimeOpponentSot === ${stepped} && e.halftimeOpponentSot === ${half});
      return { writes: writes.length, verified: last?.verifiedAt - start,
        burstMs: start - ${rows.fulltime.start},
        writeRead: last?.verifiedAt - last?.startedAt, mirror: mirror?.completedAt - start,
        phases: m.timings.filter(e => e.at >= start),
        tasks: m.longTasks.filter(e => e.startedAt >= ${rows.Goal.start}) };
    })()`)
    assert(rows.autosave.writes >= 1 && Number.isFinite(rows.autosave.verified))
    const saved = await page.evaluate("JSON.parse(localStorage.getItem('football-tracker-v1')).draftMatch")
    assert.equal(saved.fulltimeOpponentSot, stepped)
    assert.equal(saved.halftimeOpponentSot, half)
    assert.deepEqual(saved.events, fixture.state.draftMatch.events)
    await action(page, click(button('DONE')))
    await action(page, click(button('END MATCH')), `!${button('SAVE & FINISH MATCH')}.disabled`)
    rows.finish = await action(page, click(button('SAVE & FINISH MATCH')))
    const primary = "JSON.parse(localStorage.getItem('football-tracker-v1'))"
    await page.waitFor(`${primary}.matches.some(match => match.id === ${JSON.stringify(saved.id)}) && !${primary}.draftMatch`)
    rows.finish.phases = await page.evaluate(`window.__v268Profile.timings.filter(e => e.at >= ${rows.finish.start})`)
    return rows
  } finally { await page.close() }
}

async function main() {
  fs.mkdirSync(work, { recursive: true })
  const servers = {}, collected = {}
  let browser
  try {
    for (const side of sides) {
      servers[side] = await build(side)
      collected[side] = []
    }
    browser = await launchBrowser()
    for (let index = 0; index < samples; index++) {
      const fixture = draftFixture(2, index)
      if (index % 2) {
        const draft = fixture.state.draftMatch, goal = draft.events.find(event => event.type === 'goal' && event.playerId)
        draft.events.push(...Array.from({ length: 90 }, (_, i) => ({ ...goal, id: 'dense-goal-' + i, sequence: 10 + i })))
        const midfielder = draft.appearances.find(appearance => appearance.position === 'CAM')
        midfielder.positionHistory = [
          ...Array.from({ length: 30 }, (_, i) => ({ minute: 21 + i, position: i % 2 ? 'CAM' : 'CM', tacticalSlotId: i % 2 ? 'CAM' : 'CM', sequence: 120 + i })),
          ...midfielder.positionHistory,
        ]
      }
      for (const side of index % 2 ? sides.slice().reverse() : sides) {
        collected[side].push(await measure(browser, servers[side], fixture, [390, 320, 1280][index % 3], side))
        console.log(`${side} editor sample ${index + 1}/${samples}`)
      }
    }
    assert.deepEqual(browser.exceptions, [])
    fs.writeFileSync(output, JSON.stringify({ base, matches: 1152, samples, collected }, null, 2) + '\n')
  } finally {
    try { if (browser) await browser.close() } finally { await Promise.all(Object.values(servers).map(server => server.close())) }
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { build, action, button, click, editTarget, field, select, type, base, work }
