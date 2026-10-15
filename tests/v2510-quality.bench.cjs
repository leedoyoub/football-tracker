// Independent release quality/bundle comparison; never reads browser data.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { execFileSync, spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v2510-quality-'))
if (!path.resolve(baseline).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected baseline root')
const baseSha = '964922fe647b136096bd5646bd9462ce665c06a9'
function run(cwd, task, side) {
  const result = spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', `npm.cmd run ${task}`] : ['run', task], { cwd, encoding: 'utf8' })
  const output = result.stdout + result.stderr
  fs.writeFileSync(path.join(root, `v2510-${side}-${task}.log`), output)
  if (result.status !== 0) throw new Error(`${side} ${task} failed (${result.status}); see log`)
  return output
}
function bundle(cwd) {
  const assets = path.join(cwd, 'dist/assets')
  const file = fs.readdirSync(assets).filter(name => /^index-.*\.js$/.test(name))[0]
  const bytes = fs.readFileSync(path.join(assets, file))
  return { file, bytes: bytes.length, gzipBytes: zlib.gzipSync(bytes).length }
}
try {
  execFileSync('tar', ['-xf', '-', '-C', baseline], { input: execFileSync('git', ['archive', baseSha], { cwd: root, maxBuffer: 32 * 1024 * 1024 }) })
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  // Keep both builds' environment identical. Values are never printed or saved
  // in the comparison report and this temporary checkout is removed below.
  for (const name of ['.env.local', '.env.production.local']) if (fs.existsSync(path.join(root, name))) fs.copyFileSync(path.join(root, name), path.join(baseline, name))
  const warnings = output => output.split(/\r?\n/).filter(line => /: warning /.test(line)).map(line => line.replace(/:\d+:\d+:/, ':')).sort()
  const beforeWarnings = warnings(run(baseline, 'lint', 'baseline'))
  const afterWarnings = warnings(run(root, 'lint', 'release'))
  run(baseline, 'build', 'baseline')
  run(root, 'build', 'release')
  const evidence = { baseSha, node: process.version, before: bundle(baseline), after: bundle(root), lint: { beforeWarnings: beforeWarnings.length, afterWarnings: afterWarnings.length, newWarnings: afterWarnings.filter(w => !beforeWarnings.includes(w)) } }
  fs.writeFileSync(path.join(root, 'docs/performance/v2.5.10-quality.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence, null, 2))
  if (evidence.lint.newWarnings.length) throw new Error('New lint warnings')
} finally { fs.rmSync(baseline, { recursive: true, force: true }) }
