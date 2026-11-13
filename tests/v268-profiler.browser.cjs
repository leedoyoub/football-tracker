// Opt-in React profiling builds. These measurements are intentionally separate
// from regular production builds and production screen/paint benchmarks.
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { launchBrowser, serveBuild, seedApplication, delay } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { BASE_SHA } = require('./helpers/v268-baseline.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { restoreDraft } = require('../src/lib/editorRestore.ts')

const root = path.resolve(__dirname, '..')
const workspace = path.join(root, '.superpowers/sdd/v268')
const samples = Number(process.env.V268_SAMPLES || 7)
// The full 6-season JSON exceeds native Chromium localStorage capacity. Keep
// actual storage/autosave profiling within capacity; CPU benches retain both.
const scales = (process.env.V268_SCALES || '2').split(',').map(Number)
const output = process.env.V268_OUTPUT || 'docs/performance/v2.6.8-profiler.json'
const stateKey = 'football-tracker-v1', routeKey = 'football-tracker-last-route'
const sotButton = 'button[aria-label="Opponent SOT"]'
const minuteInput = 'input[aria-label="Conceded Goal Time"]'
const sotInput = 'input[aria-label="1H SOT"]'
const summary = values => {
  const sorted = values.slice().sort((a, b) => a - b)
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], samples: values }
}

function profilingPlugin() {
  const transformed = { main: false, app: false }
  return {
    name: 'football-v268-test-only-react-profiler', enforce: 'pre',
    transform(code, id) {
      const filename = id.split('?')[0].replaceAll('\\', '/')
      if (filename.endsWith('/src/main.tsx')) {
        assert.equal((code.match(/<App\s*\/>/g) || []).length, 1, 'Exactly one App mount must be instrumented')
        transformed.main = true
        return { code: `import { Profiler as V268Profiler } from 'react'\n` + code.replace(/<App\s*\/>/, `<V268Profiler id="App" onRender={(id, phase, actualDuration, baseDuration, startTime, commitTime) => { const m = (window as any).__v268Profile; if (m) m.commits.push({ id, phase, actualDuration, baseDuration, startTime, commitTime, recordedAt: performance.now() }); }}><App /></V268Profiler>`), map: null }
      }
      if (filename.endsWith('/src/App.tsx')) {
        assert.equal((code.match(/export default function App\(\)\s*\{/g) || []).length, 1, 'Exactly one App function must be counted')
        transformed.app = true
        return { code: code.replace(/export default function App\(\)\s*\{/, '$&\n  if ((window as any).__v268Profile) (window as any).__v268Profile.appRenders++;'), map: null }
      }
    },
    generateBundle() { assert(transformed.main && transformed.app, 'Both profiling transforms must run') },
  }
}

function archivedBuildRoot() {
  const destination = path.join(workspace, 'profile-before')
  fs.mkdirSync(destination, { recursive: true })
  const files = ['src', 'public', 'index.html', 'package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']
  execFileSync('tar', ['-xf', '-', '-C', destination], { input: execFileSync('git', ['archive', BASE_SHA, ...files], { cwd: root, maxBuffer: 32 * 1024 * 1024 }) })
  const modules = path.join(destination, 'node_modules')
  if (!fs.existsSync(modules)) fs.symlinkSync(path.join(root, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir')
  return destination
}

async function profilingBuilds() {
  // Verify the installed version rather than assuming the profiling entry has
  // the react-dom/client API. The exact alias leaves react-dom itself alone.
  const profilingEntry = require.resolve('react-dom/profiling')
  const profiling = require(profilingEntry)
  assert.equal(typeof profiling.createRoot, 'function')
  assert.equal(typeof profiling.hydrateRoot, 'function')
  const { build } = await import('vite')
  const sources = { before: archivedBuildRoot(), after: root }, builds = {}
  for (const side of ['before', 'after']) {
    const outDir = side === 'before' ? path.join(sources.before, 'dist') : path.join(workspace, 'profile-after/dist')
    assert(outDir.startsWith(workspace + path.sep), 'Profiling output must stay in ignored task artifacts')
    const originalDirectory = process.cwd()
    process.chdir(sources[side])
    try { await build({
      root: sources[side], configFile: path.join(sources[side], 'vite.config.ts'), mode: 'production',
      plugins: [profilingPlugin()],
      resolve: { alias: [{ find: /^react-dom\/client$/, replacement: profilingEntry }] },
      define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""', 'import.meta.env.VITE_ENABLE_CLOUD_SYNC': '"false"' },
      build: { outDir, emptyOutDir: true },
    }) } finally { process.chdir(originalDirectory) }
    builds[side] = outDir
  }
  return { builds, profilingEntry, reactVersion: require('react/package.json').version }
}

function draftFixture(count, sample) {
  const state = performanceFixture(count)
  const draft = structuredClone(state.matches.find(match => match.teamId === state.teams[0].id && match.competitionType === 'league'))
  draft.id = `profiler-draft:${count}:${sample}`
  state.draftMatch = draft
  assert(!state.matches.some(match => match.id === draft.id))
  assert(restoreDraft(draft, state.players, true), 'Synthetic draft must restore a real saved lineup and live events')
  const view = { name: 'new-match', teamId: draft.teamId, season: draft.season, competitionType: 'league', resumeDraft: true }
  return { state, view, screenState: defaultScreenState(view), targetHalf: draft.halftimeOpponentSot + 1 }
}

function instrumentationSeed(fixture) {
  return seedApplication(fixture.state, fixture.view, fixture.screenState) + `
  (() => {
    const m = window.__v268Profile = { appRenders: 0, commits: [], storage: [], mirrors: [], longTasks: [], actions: {} };
    const set = Storage.prototype.setItem, get = Storage.prototype.getItem;
    let primaryPayload, primaryEntry;
    Storage.prototype.setItem = function(key, value) {
      const startedAt = performance.now(); const result = set.call(this, key, value);
      if (this === localStorage) {
        const entry = { key: String(key), bytes: String(value).length * 2, startedAt, finishedAt: performance.now() };
        m.storage.push(entry);
        if (key === ${JSON.stringify(stateKey)}) { primaryPayload = value; primaryEntry = entry; }
      }
      return result;
    };
    Storage.prototype.getItem = function(key) {
      const value = get.call(this, key);
      if (this === localStorage && key === ${JSON.stringify(stateKey)} && primaryEntry && primaryEntry.verifiedAt === undefined && value === primaryPayload) primaryEntry.verifiedAt = performance.now();
      return value;
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      const startedAt = performance.now();
      const request = put.apply(this, arguments);
      if (this.transaction.db.name === 'FootballTrackerDB' && this.name === 'data' && key === ${JSON.stringify(stateKey)}) {
        const draft = value?.draftMatch;
        const entry = { startedAt, draftId: draft?.id, halftimeOpponentSot: draft?.halftimeOpponentSot, fulltimeOpponentSot: draft?.fulltimeOpponentSot, eventCount: draft?.events?.length };
        this.transaction.addEventListener('complete', () => { entry.completedAt = performance.now(); m.mirrors.push(entry); }, { once: true });
      }
      return request;
    };
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver(list => m.longTasks.push(...list.getEntries().map(entry => ({ startedAt: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
    }
    m.begin = label => m.actions[label] = { startedAt: performance.now(), appRenders: m.appRenders, commits: m.commits.length, storage: m.storage.length, mirrors: m.mirrors.length };
    m.snapshot = action => {
      const commits = m.commits.slice(action.commits), storage = m.storage.slice(action.storage);
      return { appRenderCount: m.appRenders - action.appRenders, commitCount: commits.length, actualDurationMs: commits.reduce((sum, entry) => sum + entry.actualDuration, 0), maxCommitActualDurationMs: Math.max(0, ...commits.map(entry => entry.actualDuration)), commits, routeWrites: storage.filter(entry => entry.key === ${JSON.stringify(routeKey)}).length, footballStateWrites: storage.filter(entry => entry.key === ${JSON.stringify(stateKey)}).length, storage, longTasks: m.longTasks.filter(entry => entry.startedAt >= action.startedAt) };
    };
  })();`
}

async function clickNamed(page, label) {
  await page.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw Error('Missing button ' + ${JSON.stringify(label)}); button.click(); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`)
}

async function inputAction(page, label, field, value) {
  return page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(`input[aria-label="${field}"]`)});
    if (!el || el.disabled) throw Error('Missing enabled input ' + ${JSON.stringify(field)});
    const m = window.__v268Profile, action = m.begin(${JSON.stringify(label)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise((resolve, reject) => requestAnimationFrame(() => requestAnimationFrame(() => {
      action.twoFramesAt = performance.now(); action.twoFrames = m.snapshot(action);
      if (document.querySelector(${JSON.stringify(`input[aria-label="${field}"]`)})?.value !== ${JSON.stringify(String(value))}) return reject(Error('Input was not accepted'));
      resolve({ inputToTwoFramesMs: action.twoFramesAt - action.startedAt, twoFrames: action.twoFrames });
    })));
  })()`)
}

async function measureEditor(browser, server, fixture) {
  const page = await browser.page(instrumentationSeed(fixture), 390)
  try {
    // Builds also replace cloud env configuration. Blocking remote HTTPS adds
    // a second boundary against accidental auth/cloud calls in this test run.
    await page.command('Network.setBlockedURLs', { urls: ['https://*'] })
    await page.navigate(server.url)
    await page.waitFor(`!!document.querySelector(${JSON.stringify(sotButton)})`, 90000)
    await page.waitFor('window.__v268Profile.commits.length > 0', 90000)
    await page.waitFor(`(() => { const m = window.__v268Profile; const last = Math.max(0, ...m.commits.map(entry => entry.recordedAt), ...m.storage.map(entry => entry.finishedAt), ...m.mirrors.map(entry => entry.completedAt)); return performance.now() - last > 650; })()`, 90000)
    assert(await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(stateKey)})).draftMatch.id === ${JSON.stringify(fixture.state.draftMatch.id)}`), 'Resume must retain the separate draft ID')

    await clickNamed(page, 'CONCEDED')
    await page.waitFor(`!!document.querySelector(${JSON.stringify(minuteInput)})`)
    const minute = await inputAction(page, 'minute', 'Conceded Goal Time', '45')
    await delay(550)
    minute.settled = await page.evaluate('window.__v268Profile.snapshot(window.__v268Profile.actions.minute)')
    assert.equal(minute.settled.footballStateWrites, 0, 'Uncommitted minute text must not change the saved draft')
    await clickNamed(page, 'CANCEL')
    await page.evaluate(`document.querySelector(${JSON.stringify(sotButton)}).click()`)
    await page.waitFor(`!!document.querySelector(${JSON.stringify(sotInput)})`)
    const draftInput = await inputAction(page, 'draft', '1H SOT', fixture.targetHalf)
    await page.waitFor(`(() => { const m = window.__v268Profile, a = m.actions.draft; return m.storage.slice(a.storage).some(entry => entry.key === ${JSON.stringify(stateKey)} && entry.verifiedAt !== undefined) && m.mirrors.slice(a.mirrors).some(entry => entry.draftId === ${JSON.stringify(fixture.state.draftMatch.id)} && entry.halftimeOpponentSot === ${fixture.targetHalf}); })()`, 90000)
    Object.assign(draftInput, await page.evaluate(`(() => {
      const m = window.__v268Profile, a = m.actions.draft;
      const primary = m.storage.slice(a.storage).find(entry => entry.key === ${JSON.stringify(stateKey)} && entry.verifiedAt !== undefined);
      const mirror = m.mirrors.slice(a.mirrors).find(entry => entry.draftId === ${JSON.stringify(fixture.state.draftMatch.id)} && entry.halftimeOpponentSot === ${fixture.targetHalf});
      return { primaryVerifiedMs: primary.verifiedAt - a.startedAt, indexedDBMirrorMs: mirror.completedAt - a.startedAt, throughAutosave: m.snapshot(a), mirror };
    })()`))
    const saved = await page.evaluate(`(() => { const state = JSON.parse(localStorage.getItem(${JSON.stringify(stateKey)})); return { draftId: state.draftMatch.id, halftimeOpponentSot: state.draftMatch.halftimeOpponentSot, matches: state.matches.length }; })()`)
    assert.equal(saved.draftId, fixture.state.draftMatch.id)
    assert.equal(saved.halftimeOpponentSot, fixture.targetHalf)
    assert.equal(saved.matches, fixture.state.matches.length)
    assert(draftInput.throughAutosave.commitCount > 0, 'The profiling build must observe the real editor/Store commits')
    return { minute, draftInput, saved }
  } finally { await page.close() }
}

function summarize(rows) {
  const values = select => summary(rows.map(select))
  return {
    minuteInputToTwoFramesMs: values(row => row.minute.inputToTwoFramesMs),
    minuteAppRenders: values(row => row.minute.twoFrames.appRenderCount),
    minuteCommits: values(row => row.minute.twoFrames.commitCount),
    minuteActualDurationMs: values(row => row.minute.twoFrames.actualDurationMs),
    draftInputToTwoFramesMs: values(row => row.draftInput.inputToTwoFramesMs),
    draftAppRendersByTwoFrames: values(row => row.draftInput.twoFrames.appRenderCount),
    draftCommitsByTwoFrames: values(row => row.draftInput.twoFrames.commitCount),
    draftActualDurationByTwoFramesMs: values(row => row.draftInput.twoFrames.actualDurationMs),
    draftAppRendersThroughAutosave: values(row => row.draftInput.throughAutosave.appRenderCount),
    draftCommitsThroughAutosave: values(row => row.draftInput.throughAutosave.commitCount),
    draftActualDurationThroughAutosaveMs: values(row => row.draftInput.throughAutosave.actualDurationMs),
    lastRouteWrites: values(row => row.draftInput.throughAutosave.routeWrites),
    footballStateWrites: values(row => row.draftInput.throughAutosave.footballStateWrites),
    primaryVerifiedMs: values(row => row.draftInput.primaryVerifiedMs),
    indexedDBMirrorMs: values(row => row.draftInput.indexedDBMirrorMs),
    samples: rows,
  }
}

async function main() {
  assert(Number.isInteger(samples) && samples > 0)
  assert(scales.every(count => Number.isInteger(count) && count > 0))
  const profiled = await profilingBuilds()
  const servers = { before: await serveBuild(profiled.builds.before), after: await serveBuild(profiled.builds.after) }
  let browser
  const report = { baseSha: BASE_SHA, node: process.version, cpu: os.cpus()[0].model, samples, reactVersion: profiled.reactVersion, profilingEntry: profiled.profilingEntry, buildKind: 'React production profiling renderer; test-only main/App transforms', method: 'Separate profiling builds, never regular production timing. Isolated Chromium/CDP browser contexts, synthetic localStorage/IndexedDB, cloud env disabled and HTTPS blocked. Alternating baseline/current side order each sample; same deterministic 2/6-season saved history and a uniquely identified resumed draft. Startup/setup excluded. React Profiler wraps App below StoreProvider, so durations include the App subtree, while the App entry counter counts App invocations including any uncommitted render attempts. Minute text is local editor input; 1H SOT publishes a draft Store update. Input dispatch to two requestAnimationFrames, primary setItem/read-back and IndexedDB mirror transaction completion are distinct measurements. Autosave retains the existing 450ms debounce. Long-task entries are observed only for interaction windows. Synthetic DOM input dispatch excludes physical keyboard latency. No real user profile, real DB or physical Safari/PWA.', scales: {} }
  try {
    browser = await launchBrowser()
    report.method = report.method.replace('2/6-season saved history', 'selected-scale saved history')
    report.excludedBrowserFixture = { seasons: 6, matches: 3456, reason: 'Unchanged 13.35 MB JSON exceeds native Chromium localStorage; actual QuotaExceededError and previous-value preservation recorded separately. No quota override or fake primary storage.' }
    report.browser = path.basename(browser.executable)
    for (const count of scales) {
      const collected = { before: [], after: [] }
      for (let sample = 0; sample < samples; sample++) {
        const fixture = draftFixture(count, sample)
        for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) collected[side].push(await measureEditor(browser, servers[side], fixture))
        console.log(`${count} seasons React Profiler: sample ${sample + 1}/${samples}`)
      }
      report.scales[count] = { matches: performanceFixture(count).matches.length, before: summarize(collected.before), after: summarize(collected.after) }
      fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    }
    report.errors = browser.exceptions
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    assert.equal(browser.exceptions.length, 0, JSON.stringify(browser.exceptions))
    console.log(JSON.stringify({ output, scales, samples, profiling: true }))
  } finally {
    try { if (browser) await browser.close() } finally { await Promise.all(Object.values(servers).map(server => server.close())) }
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { profilingPlugin, draftFixture, instrumentationSeed }
