const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const work = path.join(root, '.superpowers/sdd/v2611')
const base = 'a0c3a6e12db8132cddd4161714e6c6d58368e570'

function baselineRoot() {
  return archiveBaseline(work, base)
}

function archiveBaseline(workspace, ref) {
  const directory = path.join(workspace, 'baseline')
  const stamp = path.join(directory, '.version')
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === ref) return directory
  fs.mkdirSync(directory, { recursive: true })
  const files = ['src', 'public', '.gitignore', 'index.html', 'package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']
  const archive = execFileSync('git', ['archive', ref, ...files], { cwd: root, maxBuffer: 32 * 1024 * 1024 })
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: archive })
  fs.writeFileSync(stamp, ref)
  return directory
}

module.exports = { archiveBaseline, baselineRoot, base, root, work }
