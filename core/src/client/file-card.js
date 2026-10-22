// Moon Bot: the file cards a reply carries, and the file facts the workspace panel and
// the preview share. A turn's files arrive as { path, name, size, mime }; `path` is the
// file's path, or one inside its Bot's folder when `botId` goes along. Bytes come over
// the api/bot channel (workspace-download), so the cards work in the web build too.
import { createElement as h, useEffect, useRef } from 'react'
import { t } from './i18n.js'
import { call } from './api.js'
import { fileKind, fileName, formatBytes, mediaKind, typeLabel } from './file-facts.js'

export { fileKind, fileName, formatBytes, isArchive, isText, mediaKind, previewKind, typeLabel } from './file-facts.js'

const SVG = 'http://www.w3.org/2000/svg'


// -------------------------------------------------------------------------
// Bytes

// A turn's file names its path; the workspace endpoints read it, inside its Bot's
// folder when the file is relative to it.
const targetOf = (file, botId) => ({ path: file.path ?? file.abs ?? file.name, ...(botId === undefined || botId === null ? {} : { botId }) })

const blobCache = new Map()
const cacheKey = (file, botId) => `${botId ?? ''}\u0000${file.path ?? file.abs ?? file.name}`

export const toBlob = ({ data, mime }) => {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// The file's bytes as a Blob, once per file: the panel's player and the preview ask again
// and again as they open, close and re-render.
export function fileBlob(file, botId) {
  const key = cacheKey(file, botId)
  const hit = blobCache.get(key)
  if (hit !== undefined) return hit
  const promise = call('workspace-download', targetOf(file, botId)).then(toBlob)
  blobCache.set(key, promise)
  promise.catch(() => blobCache.delete(key))
  return promise
}

export async function downloadFile(file, botId) {
  const saved = await call('workspace-download', targetOf(file, botId))
  saveBlob(toBlob(saved), saved.name ?? fileName(file) ?? 'file')
  return saved
}

// What the host knows about a file: name, size, mime, whether it can be saved.
export async function describeFile(file, botId) {
  return await call('workspace-describe', targetOf(file, botId))
}

// -------------------------------------------------------------------------
// Glyphs

const PAGE = ['M5.5 2.5h6l4 4v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z', 'M11.5 2.5v4h4']
const GLYPHS = {
  file: PAGE,
  text: [...PAGE, 'M7 9.5h6M7 12h6M7 14.5h4'],
  markdown: [...PAGE, 'M7 13.5v-4l1.5 1.5L10 9.5v4', 'M11.5 9.5v4M11.5 11.5h2'],
  code: [...PAGE, 'M8.5 10L7 12l1.5 2M11.5 10L13 12l-1.5 2'],
  image: [...PAGE, 'M6 14l2.2-2.2 1.5 1.5 1.4-1.4L13.5 14', 'M8.25 8.5h.01'],
  audio: [...PAGE, 'M7.5 13.5v-4l4-1v4', 'M7.5 13.5a1.2 1.2 0 1 0 2.4 0M11.5 12.5a1.2 1.2 0 1 0 2.4 0'],
  video: [...PAGE, 'M8.5 9.5l3 2-3 2z'],
  pdf: [...PAGE, 'M7 10h2.5a1 1 0 0 1 0 2H7z', 'M7 14.5V10'],
  sheet: [...PAGE, 'M7 9.5h6M7 12h6M7 14.5h6', 'M10 9.5v5'],
  doc: [...PAGE, 'M7 9.5h6M7 12h6M7 14.5h3'],
  slides: [...PAGE, 'M7 9h6v4H7z', 'M10 13v2'],
  archive: [...PAGE, 'M9 5.5h1M9 8h1M9 10.5h1', 'M8.5 12.5h2v2h-2z'],
}
const DOWNLOAD = ['M10 3.5v9', 'M6.5 9.5L10 13l3.5-3.5', 'M4 16h12']

export function icon(paths, size = 14) {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6')
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) { const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', d); svg.append(path) }
  return svg
}

export const fileGlyph = (kind, size = 14) => icon(GLYPHS[kind] ?? PAGE, size)

// The same glyph where React draws it.
export const FileGlyph = ({ kind, size = 16 }) => h('svg', {
  width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
}, (GLYPHS[kind] ?? PAGE).map(d => h('path', { key: d, d })))

// -------------------------------------------------------------------------
// The cards. A card is a small DOM tree, so the workspace panel (plain DOM) and the
// chat (React) draw the very same one.

const element = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const downloadControl = (file, botId, onError, compact) => {
  const button = element('button', compact ? 'bt-fcard-dl' : 'bt-fcard-download')
  button.type = 'button'
  button.title = t('Download')
  button.setAttribute('aria-label', t('Download'))
  if (compact) button.append(icon(DOWNLOAD))
  else button.append(icon(DOWNLOAD), document.createTextNode(t('Download')))
  button.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation()
    if (button.dataset.busy) return
    button.dataset.busy = ''
    downloadFile(file, botId).catch(error => onError(error)).finally(() => { delete button.dataset.busy })
  })
  return button
}

const MEDIA_NOTE = 'This file type has no preview. Download it to open it on your computer.'
const PREVIEW_KINDS = [
  ['Images', 'png, jpg, gif, webp, svg, bmp'],
  ['PDF', 'pdf'],
  ['Word & PowerPoint', 'docx, doc, pptx, ppt, odt, rtf'],
  ['Spreadsheets', 'xlsx, xls, csv, tsv'],
  ['Markdown', 'md'],
  ['Code & text', 'txt, json, js, ts, py, html, css, yaml, xml, sh, …'],
  ['Audio', 'mp3, wav, ogg, m4a, flac, aac'],
  ['Video', 'mp4, webm, mov, m4v, ogv'],
]

// `variant`: 'message' is the row under a reply (compact, opens the preview);
// 'panel' is the workspace panel's card for a file DSH cannot preview (bigger, plays
// audio and video in place, lists what can be previewed).
export function fileCard({ file, botId, variant = 'message', onOpen }) {
  const name = fileName(file)
  const kind = fileKind(name, file.mime)
  const card = element('div', `bt-fcard bt-fcard-${variant}`)
  card.dataset.kind = kind
  const head = element('div', 'bt-fcard-head')
  const glyph = element('span', 'bt-fcard-glyph')
  glyph.append(fileGlyph(kind, variant === 'panel' ? 26 : 20))
  const text = element('div', 'bt-fcard-text')
  const title = element('div', 'bt-fcard-name', name)
  title.title = String(file.path ?? file.abs ?? name)
  const meta = element('div', 'bt-fcard-meta', [formatBytes(file.size), typeLabel(name, file.mime)].filter(Boolean).join(' · '))
  text.append(title, meta)
  const note = element('p', 'bt-fcard-note')
  note.hidden = true
  const fail = (error) => { note.textContent = error?.message ?? String(error); note.hidden = false }
  let main
  if (variant === 'panel') {
    main = element('div', 'bt-fcard-main')
    main.append(glyph, text)
  } else {
    main = element('button', 'bt-fcard-main')
    main.type = 'button'
    main.setAttribute('aria-label', t('Preview {name}', { name }))
    main.append(glyph, text)
    main.addEventListener('click', () => onOpen?.(file, note))
  }
  head.append(main)
  if (file.downloadable === false) {
    note.textContent = t('Too large to download here')
    note.hidden = false
  } else head.append(downloadControl({ ...file, name }, botId, fail, variant !== 'panel'))
  card.append(head, note)
  if (file.error) fail(file.error)
  if (variant === 'panel') fillPanel(card, { file, botId, name, note, fail })
  return card
}

// The panel's extras: the player, the note for what has no preview, and the type list.
function fillPanel(card, { file, botId, name, note, fail }) {
  const media = mediaKind(name)
  if (media && note.hidden) {
    const player = document.createElement(media)
    player.className = `bt-fcard-${media}`
    player.controls = true
    player.preload = 'metadata'
    player.setAttribute('aria-label', name)
    card.append(player)
    fileBlob(file, botId).then((blob) => {
      const url = URL.createObjectURL(blob)
      player.src = url
      card.dataset.ready = ''
      const gone = new MutationObserver(() => { if (!card.isConnected) { URL.revokeObjectURL(url); gone.disconnect() } })
      gone.observe(document.body, { childList: true, subtree: true })
    }).catch(error => { fail(error); player.remove() })
  }
  if (!media) {
    note.textContent = t(MEDIA_NOTE)
    note.hidden = false
  }
  const kinds = element('details', 'bt-fcard-kinds')
  kinds.append(element('summary', undefined, t('What can be previewed')))
  const list = element('ul')
  for (const [label, exts] of PREVIEW_KINDS) {
    const item = element('li')
    const bold = element('b', undefined, t(label))
    item.append(bold, document.createTextNode(` ${exts}`))
    list.append(item)
  }
  kinds.append(list)
  card.append(kinds)
}

// The chat side of the same card.
export function FileCards({ files = [], botId, variant = 'message', onOpen }) {
  const box = useRef(null)
  useEffect(() => {
    if (!box.current) return
    box.current.replaceChildren(...files.map(file => fileCard({ file, botId, variant, onOpen })))
  }, [files, botId, variant, onOpen])
  return h('div', { className: `bt-fcards bt-fcards-${variant}`, ref: box })
}

export const FILE_CARD_CSS = `
.bt-fcards{display:flex;flex-direction:column;gap:8px;min-width:0;max-width:min(420px,100%);margin-top:2px}
.bt-fcard{display:flex;flex-direction:column;gap:10px;box-sizing:border-box;padding:10px 12px;border-radius:12px;background:var(--bt-card);box-shadow:0 0 0 .5px var(--bt-line-2);color:var(--bt-ink);text-align:left;min-width:0}
.bt-fcard-message{padding:8px 10px}
.bt-fcard-head{display:flex;align-items:center;gap:8px;min-width:0}
.bt-fcard-main{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:2px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:10px}
.bt-fcard-main:hover .bt-fcard-name{text-decoration:underline;text-underline-offset:2px}
.bt-fcard-main:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
.bt-fcard-panel .bt-fcard-main{cursor:default}
.bt-fcard-panel .bt-fcard-main:hover .bt-fcard-name{text-decoration:none}
.bt-fcard-glyph{display:flex;align-items:center;justify-content:center;flex:none;color:var(--bt-accent)}
.bt-fcard-message .bt-fcard-glyph{width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--bt-accent) 11%,transparent)}
.bt-fcard-panel .bt-fcard-glyph{width:46px;height:46px;border-radius:12px;background:color-mix(in srgb,var(--bt-accent) 12%,transparent)}
.bt-fcard-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.bt-fcard-name{font-size:13.5px;line-height:19px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-fcard-meta{font-size:12px;line-height:17px;color:var(--bt-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-fcard-dl{display:flex;align-items:center;justify-content:center;flex:none;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--bt-ink-2);cursor:pointer}
.bt-fcard-dl:hover{background:var(--bt-hover);color:var(--bt-ink)}
.bt-fcard-dl[data-busy]{cursor:progress;animation:bt-fdl-pulse 1s ease-in-out infinite}
.bt-fcard-audio{width:100%}
.bt-fcard-video{width:100%;max-height:50vh;border-radius:10px}
.bt-fcard-note{margin:0;font-size:12.5px;line-height:19px;color:var(--bt-ink-2)}
.bt-fcard-download{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;border:0;border-radius:10px;background:var(--bt-accent);color:var(--bt-accent-ink);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:filter .12s ease}
.bt-fcard-download:hover{filter:brightness(1.08)}
.bt-fcard-download[data-busy]{cursor:progress;animation:bt-fdl-pulse 1s ease-in-out infinite}
.bt-fcard-kinds{font-size:12px;line-height:18px;color:var(--bt-ink-3)}
.bt-fcard-kinds summary{cursor:pointer;color:var(--bt-ink-2)}
.bt-fcard-kinds ul{margin:6px 0 0;padding-left:16px}
.bt-fcard-kinds b{font-weight:500;color:var(--bt-ink-2)}
@keyframes bt-fdl-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.bt-fcard-download,.bt-fcard-dl{transition:none}}
`
