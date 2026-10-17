require('./register-ts.cjs')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const transformed = new Map()

// Calls real screen functions/engines with a deterministic hook lifecycle.
// This measures CPU work and handler behavior, not browser React commits.
function screenHarness(root, file, name, store, overrides = {}) {
  let cursor = 0
  let stateChanges = 0
  const hooks = []; const effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const memo = (fn, deps) => {
    const i = cursor++; const old = hooks[i]
    if (!old || !same(old.deps, deps)) hooks[i] = { deps, value: fn() }
    return hooks[i].value
  }
  const react = { ...React, useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useRef: value => {
    const i = cursor++; return hooks[i] ??= { current: value }
  }, useState: initial => {
    const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial
    return [hooks[i], next => { const value = typeof next === 'function' ? next(hooks[i]) : next; if (!Object.is(value, hooks[i])) stateChanges++; hooks[i] = value }]
  }, useEffect: fn => { effects.push(fn) }, useLayoutEffect: fn => { effects.push(fn) } }
  const filename = path.join(root, 'src', file)
  // A parent would retain every temporary module (and its fixture Store) in
  // module.children, contaminating repeated cold benchmarks with retained data.
  const compiled = new Module(filename)
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = compiled.require.bind(compiled)
  compiled.require = request => request === 'react' ? react : request === '../store' ? { useStore: () => store } : request in overrides ? overrides[request] : original(request)
  const key = `${filename}:${name}`
  if (!transformed.has(key)) {
    const code = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.DEV', 'false') + `\nexports.__screenUnderTest = ${name};`
    transformed.set(key, ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)
  }
  compiled._compile(transformed.get(key), filename)
  return { render(props) {
    cursor = 0; effects.length = 0
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
    const previous = internals.H
    internals.H = react
    try { return compiled.exports.__screenUnderTest(props) } finally { internals.H = previous }
  }, effects, get stateChanges() { return stateChanges } }
}
function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(item => nodes(item, predicate))
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
}
function sourceModule(root, file, overrides = {}) {
  const filename = path.join(root, 'src', file)
  const compiled = new Module(filename)
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = compiled.require.bind(compiled)
  compiled.require = request => request in overrides ? overrides[request] : original(request)
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
  return compiled.exports
}
module.exports = { screenHarness, nodes, sourceModule }
