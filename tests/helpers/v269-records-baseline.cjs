require('./register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process')
const BASE_SHA = '6be9bf45d08983cb6f37003f7c9685981abda3c7'
const root = path.resolve(__dirname, '../..')
const directory = path.join(root, '.superpowers/sdd/v269/records-baseline-source')

function baselineRoot() {
  const stamp = path.join(directory, '.baseline-sha'), modules = path.join(directory, 'node_modules')
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === BASE_SHA && fs.existsSync(modules)) return directory
  fs.mkdirSync(directory, { recursive: true })
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: execFileSync('git', ['archive', BASE_SHA, 'src'], { cwd: root, maxBuffer: 32 * 1024 * 1024 }) })
  if (!fs.existsSync(modules)) fs.symlinkSync(path.join(root, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir')
  fs.writeFileSync(stamp, BASE_SHA + '\n')
  return directory
}
module.exports = { baselineRoot, BASE_SHA }
