const React = require('react')

// Inspect every logical card, including rows outside the current DOM window.
// Preserve the pre-windowing tree shape for existing content/handler assertions.
function expandCardLists(tree) {
  if (Array.isArray(tree)) return tree.map(expandCardLists)
  if (!React.isValidElement(tree)) return tree
  if (tree.type?.name === 'VirtualCardList') return React.createElement(React.Fragment, {}, tree.props.rows.map((row, index) =>
    React.cloneElement(expandCardLists(tree.props.renderRow(row, index)), { key: tree.props.itemKey(row) })))
  return tree.props.children === undefined ? tree : React.cloneElement(tree, {}, expandCardLists(tree.props.children))
}
module.exports = { expandCardLists }
