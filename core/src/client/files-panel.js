// Moon Bot: Download in DSH's workspace file panel, and the card for what it cannot
// preview. DSH's panel previews images, PDF, Word/PowerPoint, Excel/CSV, Markdown and
// code/text, but cannot save a file, and shows a bare "Preview is not available" for
// everything else. This adds, without patching DSH (only its stable data-* hooks):
// - a Download button on every row of the tree (a folder downloads as a .zip);
// - a Download button in every preview's toolbar;
// - in place of the bare notice, the same card the chat's file cards use (file-card.js)
//   with the file's icon, name, size and type, a Download button, and audio and video
//   playing right in it.
// Bytes come over the api/bot channel, so it works in the web build behind its password.
import { t } from './i18n.js'
import { describeFile, downloadFile, fileCard, icon } from './file-card.js'

const DOWNLOAD = ['M10 3.5v9', 'M6.5 9.5L10 13l3.5-3.5', 'M4 16h12']

export function installFilesPanel({ notify = message => console.warn(message) } = {}) {
  if (typeof MutationObserver === 'undefined') return () => {}
  const save = async (file, button) => {
    if (button?.dataset.busy) return
    if (button) button.dataset.busy = ''
    try {
      await downloadFile(file)
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
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); void save({ path }, button) })
    return button
  }

  // The fallback card, filled in once the host describes the file.
  async function fillCard(card, path) {
    let info
    try { info = await describeFile({ path }) } catch (error) { info = { name: path.split(/[\\/]/).pop(), error: error?.message } }
    card.replaceChildren(fileCard({ file: { ...info, path }, variant: 'panel' }))
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
        const card = document.createElement('div'); card.className = 'bt-fcard-host'
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

// The card's own styles ship with file-card.js.
export const FILES_PANEL_CSS = `
li[data-files-entry]{position:relative}
.bt-frow-dl{position:absolute;right:6px;top:50%;translate:0 -50%;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:6px;background:var(--bt-card);color:var(--bt-ink-2);cursor:pointer;opacity:0;transition:opacity .12s ease,background-color .12s ease;box-shadow:0 0 0 1px var(--bt-line)}
li[data-files-entry]:hover>.bt-frow-dl,.bt-frow-dl:focus-visible,.bt-frow-dl[data-busy]{opacity:1}
.bt-frow-dl:hover{color:var(--bt-accent);background:color-mix(in srgb,var(--bt-accent) 10%,var(--bt-card))}
li[data-files-entry]>ul .bt-frow-dl{right:6px}
.bt-fpreview-dl{display:inline-flex;align-items:center;justify-content:center;width:26px;height:24px;margin-right:4px;border:0;border-radius:6px;background:transparent;color:var(--bt-ink-2);cursor:pointer}
.bt-fpreview-dl:hover{background:var(--bt-hover);color:var(--bt-ink)}
:is(.bt-frow-dl,.bt-fpreview-dl)[data-busy]{cursor:progress;animation:bt-fdl-pulse 1s ease-in-out infinite}
[data-textpreview-unsupported]:has(>.bt-fcard-host)>:not(.bt-fcard-host){display:none!important}
[data-textpreview-unsupported]:has(>.bt-fcard-host){align-items:center;justify-content:center}
`
