const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v259-baseline-'))
const temporaryRoot = path.resolve(os.tmpdir()) + path.sep
if (!path.resolve(baseline).startsWith(temporaryRoot)) throw new Error('Unexpected temporary baseline path')
const baseSha = '090d6f07d7d9910b41fd1fbb05382dcf0d884258'
try {
  const archive = execFileSync('git', ['archive', baseSha], { cwd: root, maxBuffer: 32 * 1024 * 1024 })
  execFileSync('tar', ['-xf', '-', '-C', baseline], { input: archive })
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  const lint = cwd => spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd run lint'] : ['run', 'lint'], { cwd, encoding: 'utf8' })
  const beforeLint = lint(baseline); const afterLint = lint(root)
  const warnings = output => output.split(/\r?\n/).filter(line => /: warning /.test(line)).map(line => line.replace(/:\d+:\d+:/, ':')).sort()
  const beforeWarnings = warnings(beforeLint.stdout + beforeLint.stderr)
  const afterWarnings = warnings(afterLint.stdout + afterLint.stderr)
  const newWarnings = afterWarnings.filter(line => !beforeWarnings.includes(line))
  const evidence = { baseSha, beforeExitCode: beforeLint.status, afterExitCode: afterLint.status, beforeWarnings: beforeWarnings.length, afterWarnings: afterWarnings.length, newWarnings }
  fs.writeFileSync(path.join(root, 'docs/performance/v2.5.9-lint.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log('Lint:', JSON.stringify(evidence))
  if (beforeLint.status !== 0 || afterLint.status !== 0 || newWarnings.length) throw new Error('Lint regression')
  const env = { ...process.env, V255_BASELINE_ROOT: baseline, V255_SAMPLES: process.env.V259_SAMPLES || '7', V255_OUTPUT: process.env.V259_OUTPUT || path.join(root, 'docs/performance/v2.5.9-benchmark.json') }
  execFileSync(process.execPath, ['--expose-gc', path.join(root, 'tests/v255-performance.bench.cjs')], { cwd: root, env, stdio: 'inherit' })
} finally {
  fs.rmSync(baseline, { recursive: true, force: true })
}
