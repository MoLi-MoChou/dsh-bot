// DSH Bot patch: one onboarding, not three. On a first start DSH opens its own "Get started"
// sign-in dialog and a preview notice on top of Chief's model choice; Chief already offers
// the same three ways in (account, API key, custom model). Both are closed once, as they
// open; a sign-in the user asks for through Chief's chips is left alone.
let userAsked = false
export const noteSignInAsked = () => { userAsked = true }

const isPreviewNotice = dialog => /DeepSeek Harness/.test(dialog.textContent ?? '') && /0\.2/.test(dialog.textContent ?? '')
const signInRoot = () => document.querySelector('[class*="_76YFJG_"]')

export function quietShellOnboarding({ windowMs = 20_000 } = {}) {
  if (typeof MutationObserver === 'undefined') return () => {}
  const started = Date.now()
  const sweep = () => {
    for (const dialog of document.querySelectorAll('[role=dialog]')) {
      if (!isPreviewNotice(dialog)) continue
      ;[...dialog.querySelectorAll('button')].find(node => /^(继续|Continue)$/u.test(node.textContent.trim()))?.click()
    }
    const signIn = signInRoot()
    if (signIn && !userAsked && Date.now() - started < windowMs) {
      const box = signIn.closest('[role=dialog]') ?? signIn.parentElement
      const close = box?.querySelector('button[aria-label="关闭"], button[aria-label="Close"]')
      if (close) close.click()
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
  }
  const observer = new MutationObserver(sweep)
  observer.observe(document.body, { childList: true, subtree: true })
  sweep()
  const stop = setTimeout(() => observer.disconnect(), windowMs + 40_000)
  return () => { clearTimeout(stop); observer.disconnect() }
}

// DSH Bot patch: DSH's General settings name the DSH runtime ("当前版本：0.2.1-rc.2"); the
// person runs DSH Bot, so the line names the app's version and the runtime after it.
const VERSION_LINE = /^(当前版本：|Current version: )(\d[\w.-]*)$/u
export function relabelShellVersion(appVersion) {
  if (typeof MutationObserver === 'undefined' || !appVersion) return () => {}
  const fix = () => {
    if (!document.querySelector('[role=dialog]')) return
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const match = VERSION_LINE.exec(node.nodeValue.trim())
      if (match) node.nodeValue = `${match[1]}DSH Bot ${appVersion}（DSH ${match[2]}）`
    }
  }
  const observer = new MutationObserver(fix)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return () => observer.disconnect()
}
