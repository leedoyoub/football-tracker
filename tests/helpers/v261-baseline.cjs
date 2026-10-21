require('./register-ts.cjs')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process')
function releaseBaseline() {
  const root = path.resolve(__dirname, '../..'), temporaryRoot = path.resolve(os.tmpdir())
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'football-v261-baseline-'))
  const verify = () => { if (!path.resolve(directory).startsWith(temporaryRoot + path.sep)) throw Error('Unsafe baseline directory') }
  verify()
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: execFileSync('git', ['archive', '7003d86', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  return { directory, cleanup() { verify(); fs.rmSync(directory, { recursive: true, force: true }) } }
}
module.exports = { releaseBaseline }
