// Isolated Chromium + CDP for synthetic full-app checks. Never attaches to a user profile.
const fs = require('node:fs'), path = require('node:path')
const http = require('node:http'), { spawn, execFileSync } = require('node:child_process')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const browserPath = () => process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(fs.existsSync)

function removeProfile(directory, allowedRoot) {
  const resolved = fs.realpathSync.native(directory), allowed = fs.realpathSync.native(allowedRoot) + path.sep
  if (!resolved.startsWith(allowed) || !path.basename(resolved).startsWith('run-')) throw Error('Unsafe browser temporary directory')
  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error
    // Native PowerShell handles Windows profile attributes/Unicode paths. All
    // resolution, containment checks and deletion stay within the same shell.
    const script = `$ErrorActionPreference='Stop'
$profileAllowedPrefix=(Resolve-Path -LiteralPath $env:FOOTBALL_V267_PROFILE_ROOT).ProviderPath.TrimEnd('\\')+'\\'
$profileAbsolutePath=[IO.Path]::GetFullPath($env:FOOTBALL_V267_PROFILE)
if (!$profileAbsolutePath.StartsWith($profileAllowedPrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($profileAbsolutePath) -notmatch '^run-[A-Za-z0-9]+$') { throw 'Unsafe profile cleanup path' }
for ($profileAttempt=0; $profileAttempt -lt 20; $profileAttempt++) {
  if (!(Test-Path -LiteralPath $profileAbsolutePath)) { break }
  try {
    $profileResolved=(Resolve-Path -LiteralPath $profileAbsolutePath).ProviderPath
    if (!$profileResolved.StartsWith($profileAllowedPrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Profile escaped its allowed root' }
    Remove-Item -LiteralPath $profileResolved -Recurse -Force -ErrorAction Stop
    break
  } catch { if ($profileAttempt -eq 19) { throw }; Start-Sleep -Milliseconds 200 }
}`
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, FOOTBALL_V267_PROFILE: directory, FOOTBALL_V267_PROFILE_ROOT: allowedRoot }, windowsHide: true, stdio: 'pipe', timeout: 15000 })
  }
}

/** Reproduce the reference assets from Git when the ignored local copy is absent. */
function ensureBaselineBuild(directory = '.superpowers/sdd/v267/baseline-dist') {
  const root = path.resolve(__dirname, '../..'), destination = path.resolve(root, directory)
  if (fs.existsSync(path.join(destination, 'index.html'))) return destination
  const workspace = path.join(root, '.superpowers/sdd/v267')
  fs.mkdirSync(workspace, { recursive: true })
  const checkout = fs.mkdtempSync(path.join(workspace, 'baseline-build-'))
  const files = ['src', 'public', 'index.html', 'package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']
  execFileSync('tar', ['-xf', '-', '-C', checkout], { input: execFileSync('git', ['archive', 'fc6eab2f6ebd672058692b5f037808d2ffa26a03', ...files], { cwd: root, maxBuffer: 32 * 1024 * 1024 }) })
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(checkout, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: checkout, env: { ...process.env, VITE_ENABLE_CLOUD_SYNC: 'false' }, stdio: 'pipe' })
  fs.cpSync(path.join(checkout, 'dist'), destination, { recursive: true })
  return destination
}

async function serveBuild(directory) {
  const root = path.resolve(directory)
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const relative = decodeURIComponent(url.pathname).replace(/^\/football-tracker\/?/, '') || 'index.html'
    const file = path.resolve(root, relative)
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return }
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream')
    response.setHeader('Cache-Control', 'no-store')
    response.end(fs.readFileSync(file))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/football-tracker/`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}

async function launchBrowser() {
  const executable = browserPath()
  if (!executable) throw Error('A local Chromium browser is required')
  const profileRoot = path.resolve(__dirname, '../../.superpowers/sdd/v267/browser-profiles')
  fs.mkdirSync(profileRoot, { recursive: true })
  const temporary = fs.mkdtempSync(path.join(profileRoot, 'run-'))
  const child = spawn(executable, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${temporary}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = '', serial = 0, socket
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000) })
  const pending = new Map(), exceptions = []
  try {
    const portFile = path.join(temporary, 'DevToolsActivePort')
    let address
    for (let i = 0; i < 200 && child.exitCode === null; i++) {
      try { const lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (lines.length >= 2) { address = lines; break } } catch (error) { if (!['ENOENT', 'EBUSY'].includes(error.code)) throw error }
      await delay(25)
    }
    if (!address) throw Error(`Chromium did not start: ${stderr}`)
    const [port, endpoint] = address
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`)
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data)
      if (data.id) {
        const request = pending.get(data.id)
        if (!request) return
        pending.delete(data.id)
        if (data.error) request.reject(Error(JSON.stringify(data.error)))
        else request.resolve(data.result)
      }
      if (data.method === 'Runtime.exceptionThrown') exceptions.push({ sessionId: data.sessionId, details: data.params.exceptionDetails })
    })
    socket.addEventListener('close', () => { for (const request of pending.values()) request.reject(Error('Chromium connection closed')); pending.clear() })
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++serial
      pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
    return {
      executable, exceptions,
      async page(seedScript = '', width = 390) {
        const { browserContextId } = await send('Target.createBrowserContext')
        const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId })
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
        const command = (method, params = {}) => send(method, params, sessionId)
        await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable'); await command('Performance.enable')
        await command('Network.setBypassServiceWorker', { bypass: true })
        await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
        await command('Emulation.setFocusEmulationEnabled', { enabled: true })
        if (seedScript) await command('Page.addScriptToEvaluateOnNewDocument', { source: seedScript })
        const evaluate = async expression => {
          const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
          if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
          return result.result.value
        }
        return {
          sessionId, command, evaluate,
          navigate: url => command('Page.navigate', { url }),
          async waitFor(expression, timeout = 30000) {
            const start = Date.now()
            while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(30) }
            throw Error(`Timed out waiting for ${expression}: ${(await evaluate('document.body.innerText')).slice(0, 1200)}`)
          },
          async screenshot(file) { const result = await command('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(result.data, 'base64')) },
          close: () => send('Target.disposeBrowserContext', { browserContextId }),
        }
      },
      async close() {
        try { await send('Browser.close') } catch {}
        socket.close()
        for (let i = 0; i < 100 && child.exitCode === null; i++) await delay(25)
        if (child.exitCode === null) child.kill()
        await delay(100)
        removeProfile(temporary, profileRoot)
      },
    }
  } catch (error) { socket?.close(); child.kill(); throw error }
}

function seedApplication(state, view = { name: 'home' }, screenState) {
  const route = JSON.stringify({ version: 2, view, screenState })
  return `if (location.protocol === 'http:') { localStorage.setItem('football-tracker-v1', ${JSON.stringify(JSON.stringify(state))}); localStorage.setItem('football-tracker-local-mode', 'true'); localStorage.setItem('football-tracker-last-route', ${JSON.stringify(route)}); }
    window.__v267SeedEnd = performance.now(); window.__v267FirstScreen = null;
    new MutationObserver(() => { if (window.__v267FirstScreen === null && document.querySelector('.app-content h1')) requestAnimationFrame(() => { if (window.__v267FirstScreen === null) window.__v267FirstScreen = performance.now(); }); }).observe(document, { childList: true, subtree: true });`
}

module.exports = { launchBrowser, serveBuild, seedApplication, delay, ensureBaselineBuild, removeProfile }
