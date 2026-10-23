// Moon Bot: the empty state for surfaces that draw plain DOM (DSH's workspace file
// panel), where React is not mounted. The React component is in empty-state.js; this
// module imports no framework so the host tests can read it without one.
const SVG_NS = 'http://www.w3.org/2000/svg'
const DOM_GLYPHS = {
  files: ['M4.5 5.5h4l1.5 1.5h5.5v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z', 'M4.5 7h11'],
  search: ['M9 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z', 'M13 13l3.5 3.5'],
}
function glyphNode(kind) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of DOM_GLYPHS[kind] ?? []) { const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', d); svg.append(path) }
  return svg
}

export function emptyStateDom({ title, hint, glyph = 'files', action }) {
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  const root = el('div', 'bt-empty-state')
  const art = el('div', 'bt-empty-art')
  const mark = el('span', 'bt-moon-mark'); mark.style.width = '44px'; mark.style.height = '44px'
  const badge = el('span', 'bt-empty-glyph'); badge.append(glyphNode(glyph))
  art.append(mark, badge)
  root.append(art, el('div', 'bt-empty-title', title))
  if (hint) root.append(el('div', 'bt-empty-hint', hint))
  if (action) {
    const button = el('button', 'bt-empty-action', action.label)
    button.type = 'button'
    button.addEventListener('click', action.onClick)
    root.append(button)
  }
  return root
}
