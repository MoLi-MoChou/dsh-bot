// Moon Bot: what a file is, by its name and MIME type, and how big it is. Plain data, so
// the workspace panel, the cards and the preview agree and the unit tests can read it
// without a browser.
import { t } from './i18n.js'

const AUDIO = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac)$/i
const VIDEO = /\.(mp4|m4v|webm|mov|ogv|mkv|avi)$/i
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i
const PDF = /\.pdf$/i
const SHEET = /\.(xlsx|xls|csv|tsv|ods)$/i
const DOC = /\.(docx|doc|odt|rtf)$/i
const SLIDES = /\.(pptx|ppt|odp)$/i
const ARCHIVE = /\.(zip|tar|gz|tgz|7z|rar|bz2|xz)$/i
const MARKDOWN = /\.(md|markdown|mdx)$/i
const CODE = /\.(js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|cs|php|swift|sh|bash|zsh|fish|sql|html?|css|scss|less|xml|ya?ml|toml|ini|json|jsonc|env|conf|lock|lua|pl|r|vue|svelte)$/i

export const mediaKind = name => (AUDIO.test(name) ? 'audio' : VIDEO.test(name) ? 'video' : null)
export const isArchive = (name, mime = '') => ARCHIVE.test(name) || /zip|tar|gzip|7z|rar/.test(mime)
export const isText = (name, mime = '') => MARKDOWN.test(name) || CODE.test(name) || mime.startsWith('text/') || /json|xml|javascript|x-sh|x-yaml|csv/.test(mime)

// One word for the glyph and the card's tone: image, pdf, sheet, doc, slides, archive,
// markdown, code, audio, video, text, file.
export function fileKind(name, mime = '') {
  const media = mediaKind(name)
  if (media) return media
  if (IMAGE.test(name) || mime.startsWith('image/')) return 'image'
  if (PDF.test(name) || mime === 'application/pdf') return 'pdf'
  if (SHEET.test(name)) return 'sheet'
  if (DOC.test(name)) return 'doc'
  if (SLIDES.test(name)) return 'slides'
  if (isArchive(name, mime)) return 'archive'
  if (MARKDOWN.test(name)) return 'markdown'
  if (CODE.test(name)) return 'code'
  if (isText(name, mime)) return 'text'
  return 'file'
}

// Whether the preview overlay can draw it here: image, pdf, audio, video, markdown,
// text. Office files and archives open by download instead, as in DSH's own panel.
export function previewKind(name, mime = '') {
  const kind = fileKind(name, mime)
  if (kind === 'sheet') return /\.(csv|tsv)$/i.test(name) ? 'text' : 'none'
  return kind === 'image' || kind === 'pdf' || kind === 'audio' || kind === 'video' || kind === 'markdown' || kind === 'text' || kind === 'code'
    ? kind
    : 'none'
}

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
    : isArchive(name, mime) ? t('archive') : t('file')
  return ext ? `${ext} ${kind}` : kind
}

export const fileName = file => (file?.name !== undefined && file.name !== '' ? file.name : String(file?.path ?? file?.abs ?? '').split(/[\\/]/).pop() ?? '')
