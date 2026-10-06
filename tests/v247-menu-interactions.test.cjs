const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function mountMenu(filename, props) {
  const hooks = []
  const effects = []
  const listeners = new Map()
  let hookIndex = 0
  let cleanup
  let currentProps = props
  let focusCount = 0
  let focusedItemIndex = -1
  const previousDocument = global.document
  global.document = {
    activeElement: null,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name) },
  }
  const react = {
    useState(initial) {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = initial
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next }]
    },
    useRef(initial) {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index]
    },
    useEffect(effect) { effects.push(effect) },
  }
  const source = fs.readFileSync(filename, 'utf8')
  const code = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const compiled = { exports: {} }
  const localRequire = name => name === 'react' ? react : name === './compactMenuStyles' ? {
    compactTrigger: () => '', compactPopup: '', compactItem: () => '',
  } : name.startsWith('.') ? require(path.resolve(path.dirname(filename), name)) : require(name)
  new Function('require', 'module', 'exports', code)(localRequire, compiled, compiled.exports)
  const component = compiled.exports[path.basename(filename, '.tsx')]
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean)
    if (predicate(node)) return node
    return find(node.props?.children, predicate)
  }
  const render = () => {
    cleanup?.()
    cleanup = undefined
    hookIndex = 0
    effects.length = 0
    const tree = component(currentProps)
    const trigger = find(tree, node => node.type === 'button' && node.props?.['aria-haspopup'] === 'menu')
    const menu = find(tree, node => node.props?.role === 'menu')
    const items = []
    const collect = node => {
      if (Array.isArray(node)) return node.forEach(collect)
      if (!node || typeof node !== 'object') return
      if (/^menuitem/.test(node.props?.role ?? '')) items.push(node)
      collect(node.props?.children)
    }
    collect(tree)
    const domItems = items.map((_, index) => ({ focus() { focusedItemIndex = index; global.document.activeElement = this } }))
    tree.props.ref.current = { contains: target => target === 'inside' }
    trigger.props.ref.current = { focus: () => { focusCount++ } }
    if (menu) menu.props.ref.current = {
      querySelector: selector => selector.includes('aria-checked') ? domItems[items.findIndex(item => item.props['aria-checked'])] : domItems[0],
      querySelectorAll: () => domItems,
    }
    for (const effect of effects) cleanup = effect() ?? cleanup
    return { trigger, menu, items }
  }
  return {
    render,
    update: next => { currentProps = { ...currentProps, ...next } },
    emit: (name, event) => listeners.get(name)?.(event),
    listenerCount: () => listeners.size,
    focusCount: () => focusCount,
    focusedItemIndex: () => focusedItemIndex,
    close: () => { cleanup?.(); global.document = previousDocument },
  }
}

test('season menu supports multiple selections, outside close, and Escape focus restoration', () => {
  const filename = path.resolve(__dirname, '../src/components/CompactMultiFilterMenu.tsx')
  let value = []
  const menu = mountMenu(filename, { value, options: ['2026/27', '2025/26'], label: 'Records seasons', emptyLabel: 'Season', pluralLabel: 'Seasons', onChange: next => { value = next; menu.update({ value }) } })
  try {
    let ui = menu.render()
    ui.trigger.props.onClick()
    ui = menu.render()
    assert.equal(ui.menu.props.role, 'menu')
    assert.match(ui.menu.props.className, /\bright-0\b/)
    assert.equal(ui.items[0].props.role, 'menuitemcheckbox')
    assert.equal(ui.items[0].props['aria-checked'], false)
    assert.equal(menu.focusedItemIndex(), 0)
    ui.menu.props.onKeyDown({ key: 'ArrowDown', preventDefault() {} })
    assert.equal(menu.focusedItemIndex(), 1)
    ui.menu.props.onKeyDown({ key: 'Home', preventDefault() {} })
    assert.equal(menu.focusedItemIndex(), 0)
    ui.items[0].props.onClick()
    ui = menu.render()
    assert.equal(ui.trigger.props['aria-expanded'], true)
    assert.equal(ui.items[0].props['aria-checked'], true)
    ui.items[1].props.onClick()
    ui = menu.render()
    assert.deepEqual(value, ['2026/27', '2025/26'])
    assert.match(ui.trigger.props['aria-label'], /2 Seasons/)
    menu.emit('keydown', { key: 'Escape' })
    ui = menu.render()
    assert.equal(ui.menu, undefined)
    assert.equal(menu.focusCount(), 1)
    ui.trigger.props.onClick()
    ui = menu.render()
    menu.emit('pointerdown', { target: 'outside' })
    assert.equal(menu.render().menu, undefined)
  } finally { menu.close() }
})

test('single-select menu closes on selection and restores trigger focus', () => {
  const filename = path.resolve(__dirname, '../src/components/CompactFilterMenu.tsx')
  let value = 'all'
  const menu = mountMenu(filename, { value, options: [{ value: 'all', label: 'All' }, { value: 'lb-rb', label: 'LB/RB' }], label: 'Position', allValue: 'all', onChange: next => { value = next; menu.update({ value }) } })
  try {
    let ui = menu.render()
    ui.trigger.props.onClick()
    ui = menu.render()
    ui.items[1].props.onClick()
    ui = menu.render()
    assert.equal(value, 'lb-rb')
    assert.equal(ui.menu, undefined)
    assert.equal(menu.focusCount(), 1)
  } finally { menu.close() }
})
