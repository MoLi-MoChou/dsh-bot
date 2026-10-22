import { t } from './i18n.js'

const ONCE = new Set(['允许一次', 'Allow once'])
const PRESET = /\b(read-only|workspace-write|danger-full-access)\b/

// DeepSeek Harness answers an approval once or not at all. "Always allow" adds the
// third choice from the approval card: it raises this Bot's saved permission to the
// preset the card asks for, then allows the waiting request, so the Bot stops asking.
export function addAlwaysAllow({ work, shownSession, raise }) {
  const augment = () => {
    for (const once of document.querySelectorAll('button')) {
      if (!ONCE.has(once.textContent.trim()) || once.dataset.dsBotAlways) continue
      once.dataset.dsBotAlways = '1'
      let card = once.parentElement
      for (let i = 0; card && i < 6 && !PRESET.test(card.textContent); i++) card = card.parentElement
      const preset = card && PRESET.exec(card.textContent)?.[1]
      if (!preset) continue
      const always = document.createElement('button')
      always.type = 'button'
      always.className = once.previousElementSibling?.className ?? once.className
      always.textContent = t('Always allow for this Bot')
      always.title = t('Saves this permission for the Bot, so it stops asking')
      always.addEventListener('click', async () => {
        const place = shownSession()
        const waiting = (work.getSnapshot().approvals ?? []).filter(a => !a.roomId)
        const entry = waiting.find(a => a.sessionId === place) ?? (waiting.length === 1 ? waiting[0] : undefined)
        always.disabled = true
        try {
          if (entry?.botId) await raise(entry.botId, preset)
          else console.warn('ds-bot: always-allow found no waiting approval', place, waiting)
        } catch (error) { console.warn('ds-bot: always-allow could not save the permission', error) }
        once.click()
      })
      once.before(always)
    }
  }
  const observer = new MutationObserver(augment)
  observer.observe(document.body, { childList: true, subtree: true })
  augment()
  return () => observer.disconnect()
}
