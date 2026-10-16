require('./register-ts.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const BASE_SHA = '5fca29a69317922206e64329b3e2928fe662c4e0'
function baselineSource() {
  const root = path.resolve(__dirname, '../..')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v2513-baseline-'))
  if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error('Unsafe baseline directory')
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: execFileSync('git', ['archive', BASE_SHA, 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  return { root, directory, BASE_SHA, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) }
}
module.exports = { baselineSource, BASE_SHA }
