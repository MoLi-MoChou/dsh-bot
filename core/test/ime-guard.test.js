import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installImeGuard } from '../src/client/ime-guard.js'

// The guard runs in a page, where `Element` exists; the test brings its own.
globalThis.Element ??= class Element {}

const realNow = performance.now
let clock = 0
performance.now = () => clock

// A capture-phase listener root, like the document the guard is installed on.
function createRoot() {
  const listeners = new Map()
  return {
    addEventListener (type, listener, capture) {
      assert.equal(capture, true, `${type} must listen in the capture phase`)
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    removeEventListener (type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter(item => item !== listener))
    },
    fire (type, event) {
      // remove() swaps in a new array, so a listener that removes itself cannot skip another.
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
    count: type => (listeners.get(type) ?? []).length,
  }
}

class Field extends Element {
  constructor (composer) { super(); this.composer = composer }
  // Only the composer's descendants answer the guard's selector, as in the page.
  closest (selector) { return this.composer && selector.includes('data-composer-input') ? this : null }
}

const enter = (target, { composing = false, keyCode = 13 } = {}) => {
  const calls = []
  return {
    key: 'Enter',
    keyCode,
    isComposing: composing,
    target,
    calls,
    stopImmediatePropagation: () => calls.push('stop'),
    preventDefault: () => calls.push('prevent'),
  }
}

const composerField = () => new Field(true)
const elsewhere = () => new Field(false)

test('Enter that commits a Chinese input method is swallowed, not cancelled', () => {
  const root = createRoot()
  const stop = installImeGuard(root)
  try {
    // Chrome and Firefox mark the Enter that commits a composition as composing, or 229.
    for (const event of [enter(composerField(), { composing: true }), enter(composerField(), { keyCode: 229 })]) {
      root.fire('keydown', event)
      assert.deepEqual(event.calls, ['stop'])
    }
  } finally {
    stop()
  }
})

test('the plain Enter a browser sends right after compositionend does not send either', () => {
  const root = createRoot()
  const stop = installImeGuard(root)
  try {
    clock = 1000
    root.fire('compositionend', { target: composerField() })
    clock = 1000 + 59
    const stray = enter(composerField())
    root.fire('keydown', stray)
    assert.deepEqual(stray.calls, ['stop', 'prevent'])

    // An Enter the user pressed after the input method finished goes through.
    clock = 1000 + 60
    const later = enter(composerField())
    root.fire('keydown', later)
    assert.deepEqual(later.calls, [])
  } finally {
    stop()
  }
})

test('an Enter outside the composer, or with no composition behind it, is left alone', () => {
  const root = createRoot()
  const stop = installImeGuard(root)
  try {
    clock = 2000
    const plain = enter(composerField())
    root.fire('keydown', plain)
    assert.deepEqual(plain.calls, [])

    root.fire('compositionend', { target: composerField() })
    clock += 10
    const outside = enter(elsewhere())
    root.fire('keydown', outside)
    assert.deepEqual(outside.calls, [])

    // A composing Enter outside the composer is not the composer's problem either.
    const composingOutside = enter(elsewhere(), { composing: true })
    root.fire('keydown', composingOutside)
    assert.deepEqual(composingOutside.calls, [])
  } finally {
    stop()
  }
})

test('nothing is heard after the guard is removed', () => {
  const root = createRoot()
  const stop = installImeGuard(root)
  assert.equal(root.count('keydown'), 1)
  assert.equal(root.count('compositionend'), 1)
  stop()
  assert.equal(root.count('keydown'), 0)
  assert.equal(root.count('compositionend'), 0)

  clock = 3000
  const event = enter(composerField(), { composing: true })
  root.fire('keydown', event)
  assert.deepEqual(event.calls, [])
})

// Restore the clock for any test file that runs after this one in the same process.
test.after?.(() => { performance.now = realNow })
process.on('exit', () => { performance.now = realNow })
