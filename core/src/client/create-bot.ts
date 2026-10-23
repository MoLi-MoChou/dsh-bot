import { createElement as h, useEffect, useRef, useState } from 'react'
import { BotMark } from './mark.ts'
import { CharacterGrid, avatarImage } from './bot-settings.js'
import { DEFAULT_SHAPES, DEFAULT_COLORS } from './characters.ts'
import { ChevronLeftIcon, CloseIcon } from './icons.ts'
import { useEscape } from './overlay-hooks.ts'
import { createPayload, freshBotName, startModel } from './bot-draft.ts'
import { ModelMenu } from './model-menu.js'
import { hostText, t } from './i18n.js'
import { nameProblem } from '../shared/mentions.ts'
import type { DraftRoster } from './bot-draft.ts'

// The roster fields the form reads; the rest of a roster passes through untouched.
export type CreateRoster = DraftRoster
export interface CreateBotActions {
  createBot: (payload: Record<string, unknown>) => Promise<{ id: string }>
  closeOverlay: () => void
}
export interface CreateBotProps {
  roster: CreateRoster
  actions: CreateBotActions
  start?: { name?: string } | undefined
  brief?: string
  onBack: () => void
  canGoBack: boolean
  onCreated: (bot: { id: string }) => void
  inline?: boolean
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!
const randomLook = (avoid: { shape?: string; color?: string } = {}) => {
  const shapes = DEFAULT_SHAPES.filter(shape => shape !== avoid.shape)
  const colors = DEFAULT_COLORS.filter(color => color !== avoid.color)
  return { shape: pick(shapes), color: pick(colors) }
}

// The new-Bot form: look first, then name and model. Nothing exists until Create.
// `inline` drops the pane's header for a form shown inside Settings.
export function CreateBot({ roster, actions, start, brief = '', onBack, canGoBack, onCreated, inline = false }: CreateBotProps) {
  const [look, setLook] = useState(() => randomLook())
  const [image, setImage] = useState<string | null>(null)
  const [name, setName] = useState(start?.name ?? '')
  const [model, setModel] = useState(() => startModel(roster))
  const [effort, setEffort] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const frame = useRef<HTMLDivElement | null>(null)
  useEscape(onBack)
  // Inside Settings the form opens below other sections, so it scrolls itself into view.
  useEffect(() => { if (inline) frame.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [])
  const fallbackName = freshBotName(roster, t('New Bot'))
  const finalName = name.trim() || fallbackName
  const clash = roster.bots.some(bot => bot.name.toLowerCase() === finalName.toLowerCase())
  const problem = nameProblem(finalName)
  const create = async () => {
    if (busy || clash || problem) return
    setError('')
    setBusy(true)
    try {
      const bot = await actions.createBot(createPayload({ name: finalName, look, image: image ?? undefined, model, effort, brief }))
      onCreated(bot)
    } catch (failure) {
      setError((failure as { message?: string } | null)?.message ?? String(failure))
      setBusy(false)
    }
  }
  const upload = (file: File | undefined) => {
    if (!file) return
    setError('')
    avatarImage(file).then((value) => { setImage(typeof value === 'string' ? value : null) }, failure => setError(failure?.message ?? String(failure)))
  }
  const previewLook = image ? { ...look, image } : look
  const card = h('div', { className: 'bt-create-card' },
    h('div', { className: 'bt-create-preview' },
      // The key remounts the mark, so every new pick plays the pop.
      h('span', { key: `${look.shape}:${look.color}:${image ? 'photo' : ''}`, className: 'bt-create-pop' },
        h(BotMark, { look: previewLook, bot: { id: 'new-bot' }, size: 88, live: true, gaze: true, pokeable: true })),
      h('span', { className: 'bt-create-name' }, finalName)),
    h('div', { className: 'bt-create-step' }, t('Look')),
    h('div', { className: 'bt-create-looks' },
      h(CharacterGrid, {
        look, hasPhoto: Boolean(image),
        onShape: (shape: string) => { setImage(null); setLook(current => ({ ...current, shape })) },
        onColor: (color: string) => { setImage(null); setLook(current => ({ ...current, color })) },
      }),
      h('div', { className: 'bt-actions bt-create-lookbar' },
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => { setImage(null); setLook(current => randomLook(current)) } }, t('Shuffle')),
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => fileRef.current?.click() }, image ? t('Replace photo') : t('Upload photo')),
        image ? h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => setImage(null) }, t('Remove photo')) : null,
        h('input', { ref: fileRef, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onChange: (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; upload(file) } }))),
    h('label', { className: 'bt-field' },
      h('span', { className: 'bt-field-label' }, t('Name')),
      h('input', {
        className: 'bt-input', autoFocus: !inline, value: name, placeholder: fallbackName, maxLength: 40, 'aria-label': t('Name'),
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value),
        onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void create() } },
      }),
      problem ? h('span', { className: 'bt-note bt-danger' }, hostText(problem))
        : clash ? h('span', { className: 'bt-note bt-danger' }, t('A Bot named {name} already exists', { name: finalName })) : null),
    h('div', { className: 'bt-field' },
      h('span', { className: 'bt-field-label' }, t('Model')),
      h(ModelMenu, { bot: { id: 'new-bot', name: finalName, model: model || undefined, effort }, roster, actions, wide: true, onPick: ref => { setModel(ref); setEffort(undefined) }, onPickEffort: setEffort }),
      h('span', { className: 'bt-note' }, (roster.models ?? []).length > 0
        ? t('The Bot runs on this model. You can change it later in its details.')
        : t('Add a provider and a model in DeepSeek Harness first, or pick one in the Bot\'s chat later.'))),
    error ? h('div', { className: 'bt-error', role: 'alert', style: { padding: 0 } }, error) : null,
    h('div', { className: 'bt-create-foot' },
      h('button', { type: 'button', className: 'bt-soft', onClick: onBack }, canGoBack ? t('Back') : t('Cancel')),
      h('button', { type: 'button', className: 'bt-send bt-create-go', disabled: busy || clash || Boolean(problem), onClick: () => void create() }, busy ? t('Creating…') : t('Create'))))
  if (inline) return h('div', { ref: frame, className: 'bt-create-inline', role: 'group', 'aria-label': t('Create Bot') }, card)
  return h('div', { className: 'bt-create', role: 'dialog', 'aria-label': t('Create Bot') },
    h('div', { className: 'bt-create-head' },
      canGoBack ? h('button', { type: 'button', className: 'bt-icon-btn', 'aria-label': t('Back to new chat'), onClick: onBack }, h(ChevronLeftIcon)) : h('span', { className: 'bt-create-gap' }),
      h('span', { className: 'bt-create-title' }, t('Create Bot')),
      h('button', { type: 'button', className: 'bt-icon-btn', 'aria-label': t('Close'), onClick: () => actions.closeOverlay() }, h(CloseIcon))),
    h('div', { className: 'bt-create-body' }, card))
}
