// A blank team chat: who is on the other side and how to start, over the composer.
// The shell marks a Session without turns as its hero phase; the welcome shows only
// there (see the CSS), so it leaves as soon as the first message is in. A chat that
// carries on from earlier parts is not new, and gets no welcome.
import { createElement as h } from 'react'
import { BotAvatar, RoomAvatar } from './mark.js'
import { isMainOf } from './sources.js'
import { EmptyState } from './empty-state.js'
import { t } from './i18n.js'

export function welcomeCopy(roster, sessionId) {
  const bot = roster.byId?.[sessionId]
  if (bot) {
    if ((bot.parts ?? []).length > 0) return null
    if (isMainOf(roster, bot.id)) {
      return { title: t('Hi, I’m {name}', { name: bot.name }), hint: t('I lead your Bot team. Tell me what you need, or ask me to set up a Bot for a job.') }
    }
    return {
      title: t('Start a chat with {name}', { name: bot.name }),
      hint: bot.role ? t('{role}. Tell {name} what you need; the work stays in this chat.', { role: bot.role, name: bot.name }) : t('Tell {name} what you need; the work stays in this chat.', { name: bot.name }),
    }
  }
  const room = roster.roomsById?.[sessionId]
  if (room && (room.parts ?? []).length === 0) {
    return { title: t('Welcome to {name}', { name: room.name }), hint: t('Write to everyone here, or call one member with @Name.') }
  }
  return null
}

export function ChatWelcome({ sessionId, useRoster }) {
  const roster = useRoster(value => value)
  const copy = welcomeCopy(roster, sessionId)
  if (!copy) return null
  const bot = roster.byId?.[sessionId]
  const art = bot
    ? h(BotAvatar, { bot, size: 56, main: isMainOf(roster, bot.id), badge: false })
    : h(RoomAvatar, { room: roster.roomsById[sessionId], roster, size: 56 })
  return h('div', { className: 'bt-welcome' }, h(EmptyState, { art, title: copy.title, hint: copy.hint }))
}

export const WELCOME_CSS = `
.bt-welcome{display:none;padding:0 23px 12px}
[data-content-phase=hero] .bt-welcome{display:flex;justify-content:center}
.bt-welcome .bt-es{padding:12px 16px 20px}
`
