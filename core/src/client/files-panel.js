// Moon Bot: Download in DSH's workspace file panel, and a card for what it cannot
// preview. DSH's panel previews images, PDF, Word/PowerPoint, Excel/CSV, Markdown and
// code/text, but cannot save a file, and shows a bare "Preview is not available" for
// everything else. This adds, without patching DSH (only its stable data-* hooks):
// - a Download button on every row of the tree (a folder downloads as a .zip);
// - a Download button in every preview's toolbar;
// - in place of the bare notice, a card with the file's icon, name, size and type and
//   a Download button; audio and video play right in it.
// Bytes come over the api/bot channel, so it works in the web build behind its password.
import { t } from './i18n.js'

export const PREVIEW_KINDS = [
  ['Images', 'png, jpg, gif, webp, svg, bmp'],
  ['PDF', 'pdf'],
  ['Word & PowerPoint', 'docx, doc, pptx, ppt, odt, rtf'],
  ['Spreadsheets', 'xlsx, xls, csv, tsv'],
  ['Markdown', 'md'],
  ['Code & text', 'txt, json, js, ts, py, html, css, yaml, xml, sh, …'],
  ['Audio', 'mp3, wav, ogg, m4a, flac, aac'],
  ['Video', 'mp4, webm, mov, m4v, ogv'],
]
const AUDIO = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac)$/i
const VIDEO = /\.(mp4|m4v|webm|mov|ogv)$/i
export const mediaKind = name => (AUDIO.test(name) ? 'audio' : VIDEO.test(name) ? 'video' : null)

export function formatBytes(size) {
  if (!Number.isFinite(size)) return ''
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

// A readable type: "MP3 audio", "ZIP archive", "BIN file".
export function typeLabel(name, mime = '') {
  const ext = (/\.([^./]+)$/.exec(name)?.[1] ?? '').toUpperCase()
  const kind = mime.startsWith('audio/') ? t('audio') : mime.startsWith('video/') ? t('video') : mime.startsWith('image/') ? t('image')
    : /zip|tar|gzip|7z|rar/.test(mime) ? t('archive') : t('file')
  return ext ? `${ext} ${kind}` : kind
}

const SVG = 'http://www.w3.org/2000/svg'
function icon(paths, size = 14) {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6')
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) { const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', d); svg.append(path) }
  return svg
}
const DOWNLOAD = ['M10 3.5v9', 'M6.5 9.5L10 13l3.5-3.5', 'M4 16h12']
const FILE = ['M5.5 2.5h6l4 4v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z', 'M11.5 2.5v4h4']
const ARCHIVE = [...FILE, 'M9 5.5h1M9 8h1M9 10.5h1', 'M8.5 12.5h2v2h-2z']

const toBlob = ({ data, mime }) => {
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

export function installFilesPanel({ call, notify = message => console.warn(message) }) {
  if (typeof MutationObserver === 'undefined') return () => {}
  const download = async (path, button) => {
    if (button?.dataset.busy) return
    if (button) button.dataset.busy = ''
    try {
      const file = await call('workspace-download', { path })
      saveBlob(toBlob(file), file.name)
    } catch (error) {
      notify(error?.message ?? String(error))
    } finally {
      if (button) delete button.dataset.busy
    }
  }
  const downloadButton = (path, label, className) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.title = label
    button.setAttribute('aria-label', label)
    button.append(icon(DOWNLOAD))
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); void download(path, button) })
    return button
  }

  // The fallback card, filled in once the host describes the file.
  async function fillCard(card, path) {
    let info
    try { info = await call('workspace-describe', { path }) } catch (error) { info = { name: path.split(/[\\/]/).pop(), error: error?.message } }
    card.replaceChildren()
    const media = mediaKind(info.name ?? '')
    const head = document.createElement('div'); head.className = 'bt-fcard-head'
    const glyph = document.createElement('span'); glyph.className = 'bt-fcard-icon'
    glyph.append(icon(/zip|tar|gzip|7z|rar/.test(info.mime ?? '') ? ARCHIVE : FILE, 26))
    const text = document.createElement('div'); text.className = 'bt-fcard-text'
    const name = document.createElement('div'); name.className = 'bt-fcard-name'; name.textContent = info.name ?? ''
    const meta = document.createElement('div'); meta.className = 'bt-fcard-meta'
    meta.textContent = [formatBytes(info.size), typeLabel(info.name ?? '', info.mime)].filter(Boolean).join(' · ')
    text.append(name, meta); head.append(glyph, text); card.append(head)
    if (media && info.downloadable && !info.error) {
      const player = document.createElement(media)
      player.className = `bt-fcard-${media}`; player.controls = true; player.preload = 'metadata'
      card.append(player)
      call('workspace-download', { path }).then((file) => {
        const url = URL.createObjectURL(toBlob(file))
        player.src = url
        card.dataset.ready = ''
        const gone = new MutationObserver(() => { if (!card.isConnected) { URL.revokeObjectURL(url); gone.disconnect() } })
        gone.observe(document.body, { childList: true, subtree: true })
      }).catch(() => player.remove())
    }
    const note = document.createElement('p'); note.className = 'bt-fcard-note'
    note.textContent = info.error ?? (media ? '' : t('This file type has no preview. Download it to open it on your computer.'))
    if (note.textContent) card.append(note)
    if (!info.error && info.downloadable !== false) {
      const button = downloadButton(path, t('Download'), 'bt-fcard-download')
      button.append(document.createTextNode(t('Download')))
      card.append(button)
    }
    const kinds = document.createElement('details'); kinds.className = 'bt-fcard-kinds'
    kinds.addEventListener('keydown', (event) => { if (event.key === 'Escape' && kinds.open) { event.preventDefault(); event.stopPropagation(); kinds.open = false; summary.focus() } })
    const summary = document.createElement('summary'); summary.textContent = t('What can be previewed')
    const list = document.createElement('ul')
    for (const [kind, exts] of PREVIEW_KINDS) { const item = document.createElement('li'); const b = document.createElement('b'); b.textContent = t(kind); item.append(b, document.createTextNode(` ${exts}`)); list.append(item) }
    kinds.append(summary, list); card.append(kinds)
  }

  const sweep = () => {
    for (const item of document.querySelectorAll('li[data-files-entry][data-files-path]')) {
      if (item.querySelector(':scope > .bt-frow-dl')) continue
      const folder = item.dataset.filesEntry === 'directory'
      const button = downloadButton(item.dataset.filesPath, folder ? t('Download as .zip') : t('Download'), 'bt-frow-dl')
      item.append(button)
    }
    for (const preview of document.querySelectorAll('[data-textpreview-state]')) {
      const path = preview.querySelector('[data-textpreview-path]')?.getAttribute('title')
      if (!path) continue
      const actions = preview.querySelector('[data-slot="sidebar.right.tab.document.actions"]')
      if (actions && actions.dataset.btPath !== path) {
        actions.querySelector(':scope > .bt-fpreview-dl')?.remove()
        actions.prepend(downloadButton(path, t('Download'), 'bt-fpreview-dl'))
        actions.dataset.btPath = path
      }
      const empty = preview.querySelector('[data-textpreview-unsupported]')
      if (empty && empty.dataset.btPath !== path) {
        empty.dataset.btPath = path
        empty.querySelector(':scope > .bt-fcard')?.remove()
        const card = document.createElement('div'); card.className = 'bt-fcard'
        empty.append(card)
        void fillCard(card, path)
      }
    }
  }
  let frame = 0
  const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; sweep() }) })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'data-textpreview-state'] })
  sweep()
  return () => { cancelAnimationFrame(frame); observer.disconnect() }
}

export const FILES_PANEL_CSS = `
li[data-files-entry]{position:relative}
.bt-frow-dl{position:absolute;right:6px;top:50%;translate:0 -50%;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:6px;background:var(--bt-card);color:var(--bt-ink-2);cursor:pointer;opacity:0;transition:opacity .12s ease,background-color .12s ease;box-shadow:0 0 0 1px var(--bt-line)}
li[data-files-entry]:hover>.bt-frow-dl,.bt-frow-dl:focus-visible,.bt-frow-dl[data-busy]{opacity:1}
.bt-frow-dl:hover{color:var(--bt-accent);background:color-mix(in srgb,var(--bt-accent) 10%,var(--bt-card))}
li[data-files-entry]>ul .bt-frow-dl{right:6px}
.bt-fpreview-dl{display:inline-flex;align-items:center;justify-content:center;width:26px;height:24px;margin-right:4px;border:0;border-radius:6px;background:transparent;color:var(--bt-ink-2);cursor:pointer}
.bt-fpreview-dl:hover{background:var(--bt-hover);color:var(--bt-ink)}
:is(.bt-frow-dl,.bt-fpreview-dl,.bt-fcard-download)[data-busy]{cursor:progress;animation:bt-fdl-pulse 1s ease-in-out infinite}
@keyframes bt-fdl-pulse{50%{opacity:.45}}
[data-textpreview-unsupported]:has(>.bt-fcard)>:not(.bt-fcard){display:none!important}
[data-textpreview-unsupported]:has(>.bt-fcard){align-items:center;justify-content:center}
.bt-fcard{display:flex;flex-direction:column;gap:14px;width:min(360px,calc(100% - 32px));padding:20px;border-radius:16px;background:var(--bt-card);box-shadow:0 0 0 1px var(--bt-line-2),0 10px 30px -16px rgba(0,0,0,.25);color:var(--bt-ink);text-align:left;box-sizing:border-box}
.bt-fcard:empty{min-height:120px}
.bt-fcard-head{display:flex;align-items:center;gap:12px;min-width:0}
.bt-fcard-icon{display:flex;align-items:center;justify-content:center;width:46px;height:46px;flex:none;border-radius:12px;background:color-mix(in srgb,var(--bt-accent) 12%,transparent);color:var(--bt-accent)}
.bt-fcard-text{min-width:0}
.bt-fcard-name{font-size:14px;line-height:20px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-fcard-meta{font-size:12px;line-height:18px;color:var(--bt-ink-2)}
.bt-fcard-audio{width:100%}
.bt-fcard-video{width:100%;max-height:50vh;border-radius:10px}
.bt-fcard-note{margin:0;font-size:12.5px;line-height:19px;color:var(--bt-ink-2)}
.bt-fcard-download{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;border:0;border-radius:10px;background:var(--bt-accent);color:var(--bt-accent-ink);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:filter .12s ease}
.bt-fcard-download:hover{filter:brightness(1.08)}
.bt-fcard-kinds{font-size:12px;line-height:18px;color:var(--bt-ink-3)}
.bt-fcard-kinds summary{cursor:pointer;color:var(--bt-ink-2)}
.bt-fcard-kinds ul{margin:6px 0 0;padding-left:16px}
.bt-fcard-kinds b{font-weight:500;color:var(--bt-ink-2)}
:is(.bt-frow-dl,.bt-fpreview-dl,.bt-fcard-download,.bt-fcard-kinds summary):focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
`
