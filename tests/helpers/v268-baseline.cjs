require('./register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process')
const BASE_SHA = '82c2c8a9e1975797b55397eac4389d2d1a8a6cc7'
const root = path.resolve(__dirname, '../..')
const directory = path.join(root, '.superpowers/sdd/v268/baseline-source')

/** Independent complete release source; its imports never resolve current src. */
function baselineRoot() {
  const stamp = path.join(directory, '.baseline-sha')
  const modules = path.join(directory, 'node_modules')
  const ready = () => fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === BASE_SHA && fs.existsSync(modules)
  if (ready()) return directory
  fs.mkdirSync(directory, { recursive: true })
  const lock = path.join(directory, '.extracting')
  const deadline = Date.now() + 30000
  while (true) {
    try { fs.mkdirSync(lock); break } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (ready()) return directory
      if (Date.now() >= deadline) throw Error('Timed out waiting for independent v268 baseline extraction')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  try {
    if (ready()) return directory
    execFileSync('tar', ['-xf', '-', '-C', directory], { input: execFileSync('git', ['archive', BASE_SHA, 'src'], { cwd: root, maxBuffer: 32 * 1024 * 1024 }) })
    if (!fs.existsSync(modules)) fs.symlinkSync(path.join(root, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir')
    fs.writeFileSync(stamp, BASE_SHA + '\n')
  } finally { fs.rmdirSync(lock) }
  return directory
}
module.exports = { baselineRoot, BASE_SHA }
