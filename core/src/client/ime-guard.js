// Mochou: Enter that ends a CJK input method's composition must not send. Browsers
// mark it with isComposing or keyCode 229; Safari and some IMEs instead fire one plain
// Enter right after compositionend. A capture-phase listener ahead of the composer's
// own (Lexical) keydown swallows both (after open-claude-ui's ChatComposer, MIT).
const COMPOSER = '[data-composer-input],[contenteditable=true],textarea'
const STRAY_MS = 60

export function installImeGuard(root = document) {
  let endedAt = -Infinity
  const ended = () => { endedAt = performance.now() }
  const keydown = (event) => {
    if (event.key !== 'Enter' && event.keyCode !== 229) return
    if (!(event.target instanceof Element) || !event.target.closest(COMPOSER)) return
    const composing = event.isComposing || event.keyCode === 229
    const stray = event.key === 'Enter' && performance.now() - endedAt < STRAY_MS
    if (!composing && !stray) return
    event.stopImmediatePropagation()
    if (stray) event.preventDefault()
  }
  root.addEventListener('compositionend', ended, true)
  root.addEventListener('keydown', keydown, true)
  return () => {
    root.removeEventListener('compositionend', ended, true)
    root.removeEventListener('keydown', keydown, true)
  }
}
