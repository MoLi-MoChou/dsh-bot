// Moon Bot: Enter that ends a CJK input method's composition must not send. Browsers
// mark it with isComposing or keyCode 229; Safari/WebKit instead fire one plain Enter
// right after compositionend. A capture-phase listener ahead of the composer's own
// (Lexical) keydown swallows both (after open-claude-ui's ChatComposer, MIT).
//
// The post-compositionend stray window is WebKit-only: on Chromium/Firefox, committing
// with Space then pressing Enter to send within a few dozen ms was wrongly swallowed
// (dogfood: first Enter dropped, text stayed in the composer).
const COMPOSER = '[data-composer-input],[contenteditable=true],textarea'
const WEBKIT_STRAY_MS = 500

const isAppleWebKit = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg\//i.test(ua)
}

export function installImeGuard(root = document, { webkit = isAppleWebKit() } = {}) {
  let endedAt = -Infinity
  const ended = () => { endedAt = performance.now() }
  const keydown = (event) => {
    if (event.key !== 'Enter' && event.keyCode !== 229) return
    if (!(event.target instanceof Element) || !event.target.closest(COMPOSER)) return
    const composing = event.isComposing || event.keyCode === 229
    const stray = webkit
      && event.key === 'Enter'
      && endedAt !== -Infinity
      && performance.now() - endedAt < WEBKIT_STRAY_MS
    if (!composing && !stray) return
    event.stopImmediatePropagation()
    if (stray) {
      // Only the first fake Enter after compositionend; a deliberate second Enter sends.
      endedAt = -Infinity
      event.preventDefault()
    }
  }
  root.addEventListener('compositionend', ended, true)
  root.addEventListener('keydown', keydown, true)
  return () => {
    root.removeEventListener('compositionend', ended, true)
    root.removeEventListener('keydown', keydown, true)
  }
}
