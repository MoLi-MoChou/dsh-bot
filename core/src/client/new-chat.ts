import { createElement as h, useRef, useState } from 'react'
import { LEAN } from './lean.ts'
import { FishLogo } from './dsh-primitives.ts'
import { PlusIcon, PeopleIcon, ArrowUpIcon } from './icons.ts'
import { AdminStar, BotMark } from './mark.ts'
import { SearchIcon } from './icons.ts'
import { useEscape, usePaneLeft } from './overlay-hooks.ts'
import { EmptyState } from './empty-state.ts'
import { CreateBot } from './create-bot.ts'
import { QUICK_EDGES, useFlip, useGlide, useMorph } from './motion.js'
import { t } from './i18n.js'
import type { MarkBot } from './mark.ts'
import type { CreateRoster, CreateBotActions } from './create-bot.ts'

/** A Bot as the roster lists it: the mark's shape, plus what the picker shows. */
interface ListedBot extends MarkBot {
  readonly id: string
  name: string
  role?: string | undefined
  hidden?: boolean | undefined
}

/** The roster fields the picker reads; the rest of a roster passes through untouched. */
export interface NewChatRoster extends CreateRoster {
  bots: ListedBot[]
  byId: Record<string, ListedBot | undefined>
  agents?: readonly unknown[] | undefined
}

export interface NewChatActions extends CreateBotActions {
  openSession(id: string): void
  showDetails(id: string, page: string): void
  send(id: string, text: string): Promise<unknown>
  setFlags(id: string, flags: { hidden: boolean }): Promise<unknown>
  createRoom(members: readonly string[], options?: { admin?: string | undefined; greet?: boolean | undefined }): Promise<{ id: string }>
  addAgent?(): Promise<unknown>
}

export interface NewChatProps {
  mode: string
  roster: NewChatRoster
  actions: NewChatActions
}

/** The Create Bot form, opened from 'create' mode or from the list. */
interface Draft { name: string; fromList: boolean }

/** One row of the picker. */
interface Option {
  key: string
  label: string
  run: () => void
  icon?: unknown
  hint?: string | undefined
  bot?: ListedBot | undefined
}

export function NewChat({ mode, roster, actions }: NewChatProps) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [group, setGroup] = useState(mode === 'group')
  // A new group chat picks its admin first, then the other members.
  const [admin, setAdmin] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(0)
  // The Create Bot form, opened straight from 'create' mode or from the list.
  const [draft, setDraft] = useState<Draft | null>(mode === 'create' ? { name: '', fromList: false } : null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const close = () => actions.closeOverlay()
  useEscape(close)
  const paneLeft = usePaneLeft()
  const wanted = query.trim().toLowerCase()
  const matches = roster.bots.filter(bot => !picked.includes(bot.id) && bot.id !== admin && (wanted === '' || bot.name.toLowerCase().includes(wanted) || (bot.role ?? '').toLowerCase().includes(wanted)))
  const choosingAdmin = group && admin === null
  const exact = roster.bots.some(bot => bot.name.toLowerCase() === wanted)
  const pickedBots = picked.map(id => roster.byId[id]).filter((bot): bot is ListedBot => bot !== undefined)
  const run = async (task: () => Promise<unknown>) => {
    if (busy) return
    setError('')
    setBusy(true)
    try { await task() } catch (failure) { setError((failure as { readonly message?: string } | undefined)?.message ?? String(failure)) } finally { setBusy(false) }
  }
  const pick = (bot: ListedBot): void => {
    setPicked(current => [...current, bot.id])
    setQuery('')
    setCursor(0)
    inputRef.current?.focus()
  }
  const chooseAdmin = (bot: ListedBot): void => {
    setAdmin(bot.id)
    setQuery('')
    setCursor(0)
    inputRef.current?.focus()
  }
  const openBot = (bot: ListedBot) => run(async () => {
    if (choosingAdmin) { chooseAdmin(bot); return }
    if (group || picked.length > 0) { pick(bot); return }
    if (bot.hidden) await actions.setFlags(bot.id, { hidden: false })
    if (message.trim()) await actions.send(bot.id, message.trim())
    actions.openSession(bot.id)
    close()
  })
  const createBot = () => {
    if (busy) return
    setError('')
    setDraft({ name: query.trim() !== '' && !exact ? query.trim() : '', fromList: true })
  }
  // Close first: closing the new-chat pane keeps the details panel, while closing
  // nothing would clear it.
  const created = (bot: { readonly id: string }): void => {
    close()
    actions.openSession(bot.id)
    actions.showDetails(bot.id, 'settings')
  }
  // The admin and at least one more Bot make a group; a message typed below goes with it,
  // else the admin opens by asking what the group is for.
  const makeGroup = async () => {
    if (admin === null || picked.length === 0) return
    const text = message.trim()
    const room = await actions.createRoom([admin, ...picked], { admin, ...(text ? {} : { greet: true }) })
    if (text) await actions.send(room.id, text)
    actions.openSession(room.id)
    close()
  }
  const createGroup = () => run(makeGroup)
  const sendMessage = () => run(async () => {
    const text = message.trim()
    if (group && admin !== null) { await makeGroup(); return }
    if (text === '' || picked.length === 0) return
    if (picked.length === 1) {
      const only = picked[0] as string
      await actions.send(only, text)
      actions.openSession(only)
      close()
      return
    }
    const room = await actions.createRoom(picked)
    await actions.send(room.id, text)
    actions.openSession(room.id)
    close()
  })
  const options: Option[] = []
  if (!group && picked.length === 0 && mode !== 'search' && wanted === '') {
    options.push({ key: 'new', icon: h(PlusIcon), label: t('Create new Bot'), run: createBot })
    if (LEAN.groups) options.push({ key: 'group', icon: h(PeopleIcon), label: t('Create group chat'), run: () => { setGroup(true); setCursor(0); inputRef.current?.focus() } })
    // A team holds at most one DSH Agent; the entry exists only while there is none.
    if (LEAN.dshAgent && (roster.agents ?? []).length === 0 && actions.addAgent !== undefined) {
      options.push({ key: 'agent', icon: h(FishLogo, { size: 16 }), label: t('Add DSH Agent'), run: () => run(async () => { await actions.addAgent?.(); close() }) })
    }
  }
  for (const bot of matches) {
    options.push({ key: bot.id, bot, label: bot.name, hint: choosingAdmin ? t('Make admin') : group || picked.length > 0 ? t('Add to group chat') : undefined, run: () => openBot(bot) })
  }
  if (wanted !== '' && !exact && mode !== 'search') options.push({ key: 'create', icon: h(PlusIcon), label: t('Create new Bot “{name}”', { name: query.trim() }), run: createBot })
  const active = Math.min(cursor, Math.max(options.length - 1, 0))
  const listed = options.map(option => option.key).join('\n')
  const glide = useGlide(`${active}\n${listed}`, { axis: 'y', ...QUICK_EDGES })
  useFlip(glide.box, listed, '[data-flip]')
  const drop = useRef<HTMLDivElement | null>(null)
  useMorph(drop, listed)
  if (draft) {
    return h('div', { className: 'bt-pane', style: { left: paneLeft } },
      h(CreateBot, {
        roster, actions, start: draft, brief: message.trim(), canGoBack: draft.fromList,
        onBack: draft.fromList ? () => { setDraft(null); setTimeout(() => inputRef.current?.focus()) } : close,
        onCreated: created,
      }))
  }
  const adminBot = admin === null ? undefined : roster.byId[admin]
  const recipients = adminBot ? [adminBot, ...pickedBots] : pickedBots
  const placeholder = recipients.length > 0 ? t('Message {name}', { name: recipients.map(bot => bot.name).join(t(' and ')) }) : t('Message Bot')
  const unpick = () => {
    if (picked.length > 0) setPicked(current => current.slice(0, -1))
    else if (admin !== null) setAdmin(null)
  }
  return h('div', { className: 'bt-pane', style: { left: paneLeft } },
    h('div', { className: 'bt-newchat', role: 'dialog', 'aria-label': mode === 'search' ? t('Search') : t('New chat') },
      h('div', { className: 'bt-to' },
        h('span', { className: 'bt-to-label' }, t('To:')),
        adminBot ? h('span', { key: adminBot.id, className: 'bt-token bt-token-admin', title: t('Admin') },
          h(BotMark, { bot: adminBot, size: 16 }), adminBot.name, h(AdminStar),
          h('button', { type: 'button', 'aria-label': t('Remove {name}', { name: adminBot.name }), onClick: () => setAdmin(null) }, '×')) : null,
        choosingAdmin ? h('span', { className: 'bt-to-star', 'aria-hidden': true }, h(AdminStar)) : null,
        pickedBots.map(bot => h('span', { key: bot.id, className: 'bt-token' },
          h(BotMark, { bot: bot, size: 16 }), bot.name,
          h('button', { type: 'button', 'aria-label': t('Remove {name}', { name: bot.name }), onClick: () => setPicked(current => current.filter(id => id !== bot.id)) }, '×'))),
        h('input', {
          ref: inputRef, autoFocus: true, value: query, 'aria-label': t('Recipient'),
          placeholder: mode === 'search' ? t('Search Bots…') : choosingAdmin ? t('Choose the group admin') : group ? t('Who to chat with…') : t('Start a chat with…'),
          onChange: (event) => { setQuery(event.target.value); setCursor(0) },
          onKeyDown: (event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(Math.min(active + 1, options.length - 1)) }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(Math.max(active - 1, 0)) }
            else if (event.key === 'Enter' && options[active] !== undefined) { event.preventDefault(); options[active]?.run() }
            else if (event.key === 'Backspace' && query === '') unpick()
          },
        }),
        group && admin !== null ? h('button', {
          type: 'button', className: 'bt-send bt-to-create', disabled: busy || picked.length === 0,
          title: picked.length === 0 ? t('Add at least one more Bot') : undefined, onClick: createGroup,
        }, t('Create group chat')) : null,
        h('button', { type: 'button', className: 'bt-x', 'aria-label': t('Close new chat'), onClick: close }, '×')),
      h('div', { ref: drop, className: 'bt-drop' }, h('div', { ref: glide.box, role: 'listbox', 'aria-label': t('Recipients'), className: 'bt-drop-list' },
        h('span', { ref: glide.thumb, className: 'bt-thumb', 'aria-hidden': true }),
        options.length === 0 ? h(EmptyState, {
            compact: true, icon: h(mode === 'search' ? SearchIcon : PlusIcon),
            title: mode === 'search' ? t('No Bots match') : t('Type a name to create a Bot'),
            ...(mode === 'search' && wanted ? { hint: t('Try another name, or clear the search.') } : {}),
            ...(mode === 'search' && query ? { action: { label: t('Clear search'), onClick: () => { setQuery(''); setCursor(0); inputRef.current?.focus() } } } : {}),
          })
          : options.map((option, index) => h('button', {
              key: option.key, type: 'button', role: 'option', className: 'bt-option', 'aria-selected': index === active, 'data-flip': option.key,
              onMouseEnter: () => setCursor(index), onClick: option.run,
            },
            option.bot ? h(BotMark, { bot: option.bot, size: 22 }) : h('span', { className: 'bt-option-icon' }, option.icon as never),
            h('span', { className: 'bt-option-label' }, option.label),
            option.hint && index === active ? h('span', { className: 'bt-option-hint' }, option.hint) : null)))),
      h('div', { className: 'bt-nc-spacer' }),
      error ? h('div', { className: 'bt-error' }, error) : null,
      h('div', { className: 'bt-nc-compose' },
        h('div', { className: 'bt-nc-card' },
          h('span', { className: 'bt-nc-plus', 'aria-hidden': true }, h(PlusIcon)),
          h('textarea', {
            rows: 1, value: message, placeholder, 'aria-label': placeholder,
            onChange: event => setMessage((event.target as HTMLTextAreaElement).value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage() }
            },
          }),
          h('button', { type: 'button', className: 'bt-nc-send', 'aria-label': t('Send message'), disabled: busy || message.trim() === '' || picked.length === 0, onClick: sendMessage }, h(ArrowUpIcon))))))
}
