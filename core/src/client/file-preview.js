// Moon Bot: the file a reply carries, opened in one overlay: an image, a PDF, a text or
// markdown file drawn here, audio and video played here, and anything else as the same
// card the workspace panel shows. The cards themselves are in file-card.js.
import { createElement as h, Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MarkdownText } from './dsh-primitives.js'
import { t } from './i18n.js'
import { FileCards, FileGlyph, downloadFile, fileBlob, fileName, fileKind, formatBytes, previewKind } from './file-card.js'
import { DownloadIcon } from './icons.js'

const TEXT_MAX = 200_000
const COLLAPSE_AT = 3

const mdLabels = () => ({ code: { copyLabel: t('Copy'), copiedLabel: t('Copied') }, footnotes: t('Footnotes') })

// The file's bytes, once the overlay asks for them.
function useBlob(file, botId) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    fileBlob(file, botId)
      .then(blob => { if (live) setState({ status: 'ready', blob }) })
      .catch(error => { if (live) setState({ status: 'error', error }) })
    return () => { live = false }
  }, [file, botId])
  return state
}

function useObjectUrl(blob) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (blob === undefined) { setUrl(null); return }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function useFileText(blob) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    if (blob === undefined) return
    let live = true
    setState({ status: 'loading' })
    blob.text()
      .then(text => { if (live) setState({ status: 'ready', text }) })
      .catch(error => { if (live) setState({ status: 'error', error }) })
    return () => { live = false }
  }, [blob])
  return state
}

function Note({ children }) {
  return h('p', { className: 'bt-fpreview-note' }, children)
}

function DownloadButton({ file, botId }) {
  const [busy, setBusy] = useState(false)
  return h('button', {
    type: 'button', className: 'bt-fpreview-dl', title: t('Download'), 'aria-label': t('Download'),
    'data-busy': busy || undefined,
    onClick: () => {
      if (busy) return
      setBusy(true)
      downloadFile(file, botId).finally(() => setBusy(false))
    },
  }, h(DownloadIcon), h('span', null, t('Download')))}

function TextBody({ blob, kind }) {
  const state = useFileText(blob)
  if (state.status === 'loading') return h(Note, null, t('Loading…'))
  if (state.status === 'error') return h(Note, null, t('Could not read this file here'))
  const text = state.text
  const shown = text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text
  return h(Fragment, null,
    kind === 'markdown'
      ? h('div', { className: 'bt-fpreview-md' }, h(MarkdownText, { text: shown, labels: mdLabels(), variant: 'compact' }))
      : h('pre', { className: 'bt-fpreview-code', tabIndex: 0 }, shown),
    text.length > TEXT_MAX ? h(Note, null, t('Showing the first {count} characters', { count: TEXT_MAX })) : null)
}

function PreviewBody({ file, botId, kind }) {
  // Nothing to draw here: the shared card says so and offers the download.
  if (kind === 'none') return h(FileCards, { files: [file], botId, variant: 'panel' })
  return h(LoadedBody, { file, botId, kind })
}

function LoadedBody({ file, botId, kind }) {
  const state = useBlob(file, botId)
  const url = useObjectUrl(state.status === 'ready' ? state.blob : undefined)
  if (state.status === 'loading') return h(Note, null, t('Loading…'))
  if (state.status === 'error') return h(Note, null, state.error?.message ?? t('Could not read this file here'))
  if (kind === 'image') {
    return url
      ? h('img', { className: 'bt-fpreview-image', src: url, alt: fileName(file) })
      : h('div', { className: 'bt-fpreview-image', 'aria-hidden': true })
  }
  if (kind === 'pdf') {
    return h('iframe', { className: 'bt-fpreview-pdf', src: url ?? undefined, title: fileName(file) })
  }
  if (kind === 'video') return h('video', { className: 'bt-fpreview-video', src: url ?? undefined, controls: true, preload: 'metadata' })
  if (kind === 'audio') return h('div', { className: 'bt-fpreview-audio' }, h('audio', { src: url ?? undefined, controls: true, preload: 'metadata' }))
  return h(TextBody, { blob: state.blob, kind })
}

// One file, whole screen.
export function FilePreview({ file, botId, onClose }) {
  const name = fileName(file)
  const kind = previewKind(name, file.mime)
  const close = useRef(null)
  const dialog = useRef(null)
  useEffect(() => {
    const key = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', key, true)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    close.current?.focus()
    return () => {
      window.removeEventListener('keydown', key, true)
      document.body.style.overflow = previous
    }
  }, [onClose])
  return createPortal(h('div', {
    className: 'bt-fpreview-scrim',
    onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() },
  }, h('div', {
    ref: dialog, className: 'bt-fpreview', role: 'dialog', 'aria-modal': 'true', 'aria-label': name, 'data-kind': fileKind(name, file.mime),
  },
  h('header', null,
    h('span', { className: 'bt-fpreview-glyph' }, h(FileGlyph, { kind: fileKind(name, file.mime), size: 20 })),
    h('div', { className: 'bt-fpreview-title' },
      h('strong', { title: String(file.path ?? name) }, name),
      h('span', null, [formatBytes(file.size), kind === 'none' ? t('No preview') : undefined].filter(Boolean).join(' · '))),
    h(DownloadButton, { file, botId }),
    h('button', { ref: close, type: 'button', className: 'bt-fpreview-close', 'aria-label': t('Close'), title: t('Close'), onClick: onClose }, '×')),
  h('div', { className: 'bt-fpreview-body' }, h(PreviewBody, { file, botId, kind })))), document.body)
}

// The files one turn wrote or delivered, under its reply: one card each, a group that
// folds past a few, and the preview they open.
export function FilesUnderReply({ files = [], botId }) {
  const [all, setAll] = useState(false)
  const [preview, setPreview] = useState(null)
  const open = useCallback(file => setPreview(file), [])
  const close = useCallback(() => setPreview(null), [])
  if (files.length === 0) return null
  const shown = all ? files : files.slice(0, COLLAPSE_AT)
  const hidden = files.length - shown.length
  const total = files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0)
  const toggle = (label, next) => h('button', {
    type: 'button', className: 'bt-files-more', 'aria-expanded': all, onClick: () => setAll(next),
  }, label)
  return h(Fragment, null,
    h('div', { className: 'bt-files', 'data-count': String(files.length) },
      files.length > 1 ? h('div', { className: 'bt-files-head' },
        h('span', { className: 'bt-files-title' }, t('{count} files', { count: files.length })),
        total > 0 ? h('span', { className: 'bt-files-size' }, formatBytes(total)) : null) : null,
      h(FileCards, { files: shown, botId, onOpen: open }),
      hidden > 0 ? toggle(t('Show {count} more', { count: hidden }), true) : null,
      hidden === 0 && all && files.length > COLLAPSE_AT ? toggle(t('Show fewer'), false) : null),
    preview ? h(FilePreview, { key: `${botId ?? ''}:${preview.path ?? preview.name}`, file: preview, botId, onClose: close }) : null)
}

export const FILE_PREVIEW_CSS = `
.bt-files{display:flex;flex-direction:column;gap:6px;min-width:0;max-width:min(420px,100%);margin-top:4px}
.bt-files-head{display:flex;align-items:baseline;gap:8px;font-size:12px;line-height:17px;color:var(--bt-ink-3)}
.bt-files-title{font-weight:500;color:var(--bt-ink-2)}
.bt-files-more{align-self:flex-start;padding:2px 9px;border:.5px solid var(--bt-line-2);border-radius:999px;background:none;color:var(--bt-ink-2);font:inherit;font-size:12px;cursor:pointer}
.bt-files-more:hover{background:var(--bt-hover)}
.bt-fpreview-scrim{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:4vh 4vw;background:rgba(0,0,0,.42);box-sizing:border-box}
.bt-fpreview{display:flex;flex-direction:column;width:min(980px,100%);height:min(86vh,100%);border-radius:18px;background:var(--bt-main);color:var(--bt-ink);box-shadow:0 24px 64px -24px rgba(0,0,0,.5);overflow:hidden}
.bt-fpreview>header{display:flex;align-items:center;gap:10px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--bt-line-2);min-width:0}
.bt-fpreview-glyph{display:flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--bt-accent) 12%,transparent);color:var(--bt-accent)}
.bt-fpreview-title{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.bt-fpreview-title strong{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-fpreview-title span{font-size:12px;color:var(--bt-ink-3)}
.bt-fpreview-dl{display:inline-flex;align-items:center;gap:6px;flex:none;height:30px;padding:0 10px;border:.5px solid var(--bt-line-2);border-radius:8px;background:none;color:var(--bt-ink-2);font:inherit;font-size:12.5px;cursor:pointer}
.bt-fpreview-dl:hover{background:var(--bt-hover);color:var(--bt-ink)}
.bt-fpreview-dl[data-busy]{cursor:progress;animation:bt-fdl-pulse 1s ease-in-out infinite}
.bt-fpreview-close{flex:none;width:30px;height:30px;border:0;border-radius:8px;background:none;color:inherit;font-size:20px;line-height:1;cursor:pointer}
.bt-fpreview-close:hover{background:var(--bt-hover)}
.bt-fpreview-close:focus-visible,.bt-fpreview-dl:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
.bt-fpreview-body{display:flex;align-items:center;justify-content:center;flex:1;min-height:0;padding:16px;overflow:auto}
.bt-fpreview-image{max-width:100%;max-height:100%;object-fit:contain;border-radius:10px}
.bt-fpreview-pdf{width:100%;height:100%;border:0;border-radius:10px;background:var(--bt-card)}
.bt-fpreview-video{max-width:100%;max-height:100%;border-radius:10px}
.bt-fpreview-audio{width:min(520px,100%)}
.bt-fpreview-audio audio{width:100%}
.bt-fpreview-md{width:100%;height:100%;overflow:auto;padding:4px 8px;font-size:14px;line-height:1.65;text-align:left;align-self:flex-start}
.bt-fpreview-code{margin:0;width:100%;height:100%;overflow:auto;padding:12px 14px;border-radius:12px;background:var(--bt-card);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;text-align:left;align-self:stretch}
.bt-fpreview-body>.bt-fcards{max-width:min(420px,100%)}
.bt-fpreview-note{margin:0;padding:24px;font-size:13px;line-height:20px;color:var(--bt-ink-2);text-align:center}
@media (prefers-reduced-motion:reduce){.bt-files-more{transition:none}}
`
