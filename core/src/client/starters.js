// Mochou patch: starter chips over the composer of a fresh chat, so the cards
// (show_view: table, checklist, options) are one tap away. They go once the chat
// has a conversation going, or once the user taps one.
import { createElement as h, useState } from 'react'
import { t } from './i18n.js'

const STARTERS = [
  ['Compare with a table…', '用表格对比一下 iPhone 和安卓旗舰的优缺点'],
  ['Make me a to-do list', '帮我做个这周的待办清单'],
  ['Give me options to pick', '周末去哪儿玩？给我几个选项选'],
]
const DONE_KEY = 'dsh-bot:starters-done'
const doneSet = () => { try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]')) } catch { return new Set() } }

export function StarterChips({ sessionId, useRoster, useTurnClock, actions }) {
  const bot = useRoster(value => value.byId?.[sessionId])
  const turns = useTurnClock(state => Object.keys(state[sessionId] ?? {}).length)
  const pending = useRoster(value => Boolean(value.questions?.[sessionId] || value.views?.[sessionId]))
  const [done, setDone] = useState(() => doneSet().has(sessionId))
  if (!bot || !bot.model || done || pending || turns > 1) return null
  const pick = (text) => {
    const set = doneSet(); set.add(sessionId)
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...set])) } catch {}
    setDone(true)
    void actions.send(sessionId, text)
  }
  return h('div', { className: 'bt-starters', role: 'group', 'aria-label': t('Try a card') },
    STARTERS.map(([label, text]) => h('button', { key: label, type: 'button', className: 'bt-starter', title: text, onClick: () => pick(text) }, t(label))))
}

export const STARTERS_CSS = `
.bt-starters{display:flex;flex-wrap:wrap;gap:8px;padding:0 23px 10px}
.bt-starter{border:1px solid var(--bt-line,rgba(0,0,0,.1));background:var(--bt-card,transparent);color:inherit;font:inherit;font-size:13px;line-height:20px;padding:5px 12px;border-radius:999px;cursor:pointer;white-space:nowrap}
.bt-starter:hover{background:var(--bt-hover,rgba(0,0,0,.04))}
`
