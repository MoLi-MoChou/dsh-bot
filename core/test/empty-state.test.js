import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

// jsdom comes from the harness, as the other client tests take it.
const PLUGIN = dirname(dirname(fileURLToPath(import.meta.url)))
const readFileFromRepo = path => readFileSync(join(PLUGIN, path), 'utf8')
const { JSDOM } = createRequire(join(process.env.DSH_HARNESS ?? join(PLUGIN, '..', 'deepseek-harness'), 'package.json'))('jsdom')

const { outputFiles } = await build({
  stdin: {
    contents: "export { EmptyState, EMPTY_STATE_CSS } from './src/client/empty-state.js'\nexport { emptyStateDom } from './src/client/empty-state-dom.js'\nexport { installFilesPanel } from './src/client/files-panel.js'",
    resolveDir: PLUGIN,
  },
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { window } = dom
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
  Fragment: Symbol('Fragment'),
}
const module = { exports: {} }
runInNewContext(outputFiles[0].text, {
  module, exports: module.exports,
  require: name => (name === 'react' ? react : {}),
  document: window.document, window, console,
  setTimeout, clearTimeout, requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: id => clearTimeout(id),
  MutationObserver: window.MutationObserver, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  atob: window.atob, Blob: window.Blob, navigator: window.navigator,
})
const { EmptyState, installFilesPanel, EMPTY_STATE_CSS } = module.exports

test('the empty state draws a mark, a title, one line of guidance and one action', () => {
  let clicked = 0
  const view = EmptyState({ title: 'No files here yet', hint: 'Ask a Bot to write one.', action: { label: 'New task', onClick: () => { clicked += 1 } } })
  assert.equal(view.props.className, 'bt-empty-state')
  const classes = view.children.map(child => child.props.className)
  assert.deepEqual(classes, ['bt-empty-art', 'bt-empty-title', 'bt-empty-hint', 'bt-empty-action'])
  assert.equal(view.children[1].children[0], 'No files here yet')
  view.children[3].props.onClick()
  assert.equal(clicked, 1)
  // Ink on the accent comes from the theme token, defined with the other base colours.
  assert.match(EMPTY_STATE_CSS, /color:var\(--bt-accent-ink\)/)
  assert.doesNotMatch(EMPTY_STATE_CSS, /#fff/)
  const styles = readFileFromRepo('src/client/styles.js')
  assert.match(styles, /--bt-accent-ink:#fff/)
})

test('a corner radius from the new sheet stays on the allowed steps', () => {  const radii = [...EMPTY_STATE_CSS.matchAll(/border-radius:([^;}\n]+)/g)].map(match => match[1].trim())
  for (const radius of radii) assert.match(radius, /^(999px|50%|4px|6px|8px|10px|12px|16px)$/)
})

test('the workspace tree says so when a folder is empty, and takes it back when it is not', async () => {
  const { document } = window
  document.body.innerHTML = `
    <div data-files-root="/data/work" data-files-state="tree">
      <div class="header"></div>
    </div>`
  const stop = installFilesPanel({ call: async () => ({}) })
  const root = document.querySelector('[data-files-root]')
  const shown = root.querySelector(':scope > .bt-files-empty')
  assert.ok(shown, 'an empty tree carries the empty state')
  assert.equal(shown.querySelector('.bt-empty-title').textContent, 'No files here yet')
  // A file arrives: the tree shows it instead.
  const row = document.createElement('li')
  row.setAttribute('data-files-entry', 'file')
  row.setAttribute('data-files-path', '/data/work/a.txt')
  root.append(row)
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(root.querySelector(':scope > .bt-files-empty'), null)
  stop()
})

test('a chat with no folder gets its own line', () => {
  const { document } = window
  document.body.innerHTML = `<div data-files-root="" data-files-state="no-workspace"></div>`
  const stop = installFilesPanel({ call: async () => ({}) })
  const root = document.querySelector('[data-files-root]')
  assert.equal(root.querySelector('.bt-empty-title').textContent, 'This chat has no folder')
  stop()
})
