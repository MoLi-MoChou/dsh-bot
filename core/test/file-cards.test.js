import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

// jsdom comes from the harness, as the other client tests take it.
const PLUGIN = dirname(dirname(fileURLToPath(import.meta.url)))
const { JSDOM } = createRequire(join(process.env.DSH_HARNESS ?? join(PLUGIN, '..', 'deepseek-harness'), 'package.json'))('jsdom')

// The cards are plain DOM (the workspace panel and the chat share one builder), so this
// runs the real module in a jsdom document; only react and the host channel are stubs.
const { outputFiles } = await build({
  stdin: {
    contents: "export { fileCard, FILE_CARD_CSS, fileKind, previewKind, formatBytes, typeLabel } from './src/client/file-card.js'\nexport { turnFilesOf, itemFilesOf } from './src/client/turn-files.js'",
    resolveDir: PLUGIN,
  },
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { window } = dom
const saved = []
window.HTMLAnchorElement.prototype.click = function click() { saved.push({ href: this.href, download: this.download }) }
const downloads = []
const downloadsAnswer = { name: 'diagram.png', mime: 'image/png', size: 3, data: 'AAA=' }
const fetch = async (route, init) => {
  const { endpoint, payload } = JSON.parse(init.body)
  downloads.push({ endpoint, payload })
  if (endpoint === 'workspace-download') return { ok: true, json: async () => ({ ok: true, value: downloadsAnswer }) }
  if (endpoint === 'workspace-describe') return { ok: true, json: async () => ({ ok: true, value: { ...downloadsAnswer, downloadable: true } }) }
  return { ok: true, json: async () => ({ ok: true, value: null }) }
}
const url = { createObjectURL: () => 'blob:moon', revokeObjectURL: () => {} }
const react = { createElement: () => null, useEffect: () => {}, useRef: () => ({ current: null }) }
const module = { exports: {} }
runInNewContext(outputFiles[0].text, {
  module, exports: module.exports,
  require: name => (name === 'react' ? react : {}),
  document: window.document, window, fetch, URL: url, atob: window.atob, Blob: window.Blob,
  MutationObserver: window.MutationObserver, console,
  // saveBlob holds its blob URL for a minute; a test does not wait that long.
  setTimeout: (fn, ms) => (ms >= 60_000 ? { unref: () => {} } : setTimeout(fn, ms)), clearTimeout,
  navigator: window.navigator, localStorage: { getItem: () => null, setItem: () => {} },
})
const { fileCard, fileKind, previewKind, formatBytes, typeLabel, turnFilesOf, itemFilesOf } = module.exports

// A value built in the test file's own realm, to compare with what the module returns.
const plain = value => JSON.parse(JSON.stringify(value))

const png = { path: '/data/work/diagram.png', name: 'diagram.png', size: 1536, mime: 'image/png' }
const sheet = { path: '/data/work/q3.xlsx', name: 'q3.xlsx', size: 18_432, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }

test('a file reads as the card the workspace panel and the chat share', () => {
  const card = fileCard({ file: png })
  assert.equal(card.className, 'bt-fcard bt-fcard-message')
  assert.equal(card.dataset.kind, 'image')
  assert.equal(card.querySelector('.bt-fcard-name').textContent, 'diagram.png')
  assert.equal(card.querySelector('.bt-fcard-meta').textContent, '1.5 KB · PNG image')
  assert.equal(card.querySelector('.bt-fcard-main').getAttribute('aria-label'), 'Preview diagram.png')
  assert.ok(card.querySelector('.bt-fcard-dl'), 'a message card downloads with its icon button')
})

test('an Office file is carded and says a download opens it', () => {
  const card = fileCard({ file: sheet, variant: 'panel' })
  assert.equal(card.dataset.kind, 'sheet')
  assert.equal(card.querySelector('.bt-fcard-meta').textContent, '18 KB · XLSX file')
  assert.match(card.querySelector('.bt-fcard-note').textContent, /no preview/)
  assert.ok(card.querySelector('.bt-fcard-download'), 'the panel card carries a Download button')
  assert.ok(card.querySelector('.bt-fcard-kinds'), 'and lists what can be previewed')
})

test('the download goes through the api/bot channel and saves the file under its own name', async () => {
  const card = fileCard({ file: png })
  await card.querySelector('.bt-fcard-dl').click()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(downloads.at(-1), { endpoint: 'workspace-download', payload: { path: '/data/work/diagram.png' } })
  assert.deepEqual(saved.at(-1), { href: 'blob:moon', download: 'diagram.png' })
})

test('a file too large to download has no download button', () => {
  const card = fileCard({ file: { ...sheet, downloadable: false } })
  assert.equal(card.querySelector('.bt-fcard-dl'), null)
  assert.match(card.querySelector('.bt-fcard-note').textContent, /too large/i)
})

test('types come from the name and the MIME type, and only some open here', () => {
  assert.equal(fileKind('a.png', ''), 'image')
  assert.equal(fileKind('a.pdf', 'application/pdf'), 'pdf')
  assert.equal(fileKind('a.xlsx', ''), 'sheet')
  assert.equal(fileKind('a.mp3', 'audio/mpeg'), 'audio')
  assert.equal(fileKind('a.zip', 'application/zip'), 'archive')
  assert.equal(fileKind('a.md', ''), 'markdown')
  assert.equal(fileKind('a', ''), 'file')
  assert.equal(previewKind('a.md', ''), 'markdown')
  assert.equal(previewKind('a.csv', 'text/csv'), 'text')
  assert.equal(previewKind('a.docx', ''), 'none')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(20 * 1024 * 1024), '20 MB')
  assert.equal(typeLabel('a.zip', 'application/zip'), 'ZIP archive')
})

test('a turn\'s files are read from the team state, absolute against their folder', () => {
  const roster = { turnFiles: { s1: { folder: '/data/work', turns: { 12: [{ path: 'reports/q3.xlsx', name: 'q3.xlsx', size: 1, mime: 'application/octet-stream' }] } } } }
  assert.deepEqual(plain(turnFilesOf(roster, 's1', 12)), [{ path: '/data/work/reports/q3.xlsx', name: 'q3.xlsx', size: 1, mime: 'application/octet-stream' }])
  // A turn that wrote nothing has no cards.
  assert.equal(turnFilesOf(roster, 's1', 13).length, 0)
  assert.equal(turnFilesOf(roster, 'other', 12).length, 0)
  // A history page entry names its own folder.
  assert.deepEqual(plain(itemFilesOf({ files: [{ path: 'a.png', name: 'a.png' }], filesFolder: '/data/work' })), [{ path: '/data/work/a.png', name: 'a.png' }])
  assert.equal(itemFilesOf({ text: 'hi' }).length, 0)
})
