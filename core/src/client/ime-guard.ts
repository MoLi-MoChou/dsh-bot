// Moon Bot: Enter that ends a CJK input method's composition must not send. Browsers
// mark it with isComposing or keyCode 229; Safari and some IMEs instead fire one plain
// Enter right after compositionend. A capture-phase listener ahead of the composer's
// own (Lexical) keydown swallows both (after open-claude-ui's ChatComposer, MIT).
const COMPOSER = '[data-composer-input],[contenteditable=true],textarea'
const STRAY_MS = 60

interface ComposingEvent extends KeyboardEvent { keyCode: number }

export function installImeGuard(root: Document | HTMLElement = document): () => void {
  let endedAt = -Infinity
  const ended = (): void => { endedAt = performance.now() }
  const keydown = (event: Event): void => {
    const key = event as ComposingEvent
    if (key.key !== 'Enter' && key.keyCode !== 229) return
    if (!(key.target instanceof Element) || key.target.closest(COMPOSER) === null) return
    const composing = key.isComposing || key.keyCode === 229
    const stray = key.key === 'Enter' && performance.now() - endedAt < STRAY_MS
    if (!composing && !stray) return
    key.stopImmediatePropagation()
    if (stray) key.preventDefault()
  }
  root.addEventListener('compositionend', ended, true)
  root.addEventListener('keydown', keydown, true)
  return () => {
    root.removeEventListener('compositionend', ended, true)
    root.removeEventListener('keydown', keydown, true)
  }
}
