// Model-choice dock and DeepSeek sign-in host. Split from model-menu for the line limit.
import { createElement as h, useEffect, useState, useSyncExternalStore } from 'react'
import { SlidersIcon } from './icons.ts'
import { KeyIcon, MaskedInput } from './secret-card.ts'
import { BotMark } from './mark.ts'
import { currentPart } from './text.ts'
import { hostText, t } from './i18n.ts'
import { useEscape } from './overlay-hooks.ts'
import { manageModels } from './model-menu-manage.ts'
import { groupModels } from './model-menu.ts'
import type {
  ModelEntry, ModelMenuOptionalActions, ModelMenuRoster, UpdateBot, SignInEntry, SignInOps, SignInSource,
} from './model-menu.ts'

export interface ModelChoiceBot {
  id: string
  name: string
  model?: string | undefined
  appliedModel?: string | undefined
}
export interface ModelChoiceRoster extends ModelMenuRoster {
  ready: boolean
  byId: Record<string, ModelChoiceBot | undefined>
}
export interface ModelChoiceActions extends ModelMenuOptionalActions { updateBot: UpdateBot }
export interface ModelChoiceDockProps {
  sessionId: string
  useRoster: <T>(select: (roster: ModelChoiceRoster) => T) => T
  actions: ModelChoiceActions
}

// The card a Bot's chat opens on while the Bot has no model, or has one that is no
// longer served. The first Main Bot greets the user only after a pick.
export function ModelChoiceDock({ sessionId, useRoster, actions }: ModelChoiceDockProps) {
  const roster = useRoster(value => value)
  const bot = roster.byId[sessionId]
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const shown = bot !== undefined && currentPart(bot) === sessionId && roster.ready
  useEffect(() => { if (shown) void actions.refreshModels?.() }, [shown, sessionId])
  if (!bot || currentPart(bot) !== sessionId || !roster.ready) return null
  const models = roster.models ?? []
  // A model whose provider has no API key fails every turn, so it is no choice.
  const usable = models.filter(model => !model.needsKey)
  const lost = bot.model ? !models.some(model => model.ref === bot.model) : false
  // An unknown catalog (none listed) cannot tell a lost model from a slow provider.
  if (bot.model && (!lost || models.length === 0)) return null
  // A window without DSH's own settings takes the missing key here.
  const keyFor = usable.length === 0 && actions.setProviderKey ? models.find(model => model.needsKey) : undefined
  const manage = manageModels(actions)
  const pick = (ref: string): void => {
    setBusy(ref)
    setError('')
    void Promise.resolve(actions.updateBot(bot.id, { model: ref }))
      .catch((failure: unknown) => { setError(failureMessage(failure)); void actions.refreshModels?.() })
      .finally(() => setBusy(''))
  }
  // The pick reads as the Bot's own first message, with the choices as replies under it.
  const text = lost
    ? t('{model} is not available anymore. Pick another model for me.', { model: (bot.model ?? '').split('/').slice(1).join('/') })
    : keyFor
      ? t("Hi, I'm {name}. I need a {provider} API key before I can start.", { name: bot.name, provider: keyFor.providerName ?? keyFor.provider })
      : usable.length === 0
        ? t("Hi, I'm {name}. I don't have a model yet. How do you want to set one up?", { name: bot.name })
        : t("Hi, I'm {name}. Pick a model for me first. You can change it later in my details.", { name: bot.name })
  const choices = usable.length === 0
    ? setupChoices(actions).map(([label, run]) => h('button', { key: label, type: 'button', className: 'bt-model-chip', onClick: run }, label))
    : [
        ...groupModels(usable).map(([provider, list]) => h('div', { key: list[0]?.provider ?? provider, className: 'bt-model-choice-group', role: 'group', 'aria-label': provider },
          h('div', { className: 'bt-model-choice-provider', 'aria-hidden': true }, provider),
          h('div', { className: 'bt-model-choice-chips' }, list.map(model => h('button', {
            key: model.ref, type: 'button', className: 'bt-model-chip', disabled: busy !== '', 'aria-busy': busy === model.ref || undefined,
            'aria-label': `${model.name} · ${provider}`,
            title: model.ref === roster.defaultModel ? `${model.ref} · ${t('Harness default')}` : model.ref,
            onClick: () => pick(model.ref),
          }, model.name, busy === model.ref ? h('span', { className: 'bt-model-spin', 'aria-label': t('Saving…') }) : null))))),
        manage ? h('button', { key: 'manage', type: 'button', className: 'bt-model-chip bt-model-chip-quiet', onClick: manage }, h(SlidersIcon), t('Manage models')) : null,
      ]
  return h('div', { className: 'bt-model-dock' },
    h('div', { className: 'bt-astack', 'data-lead': '' },
      h('div', { className: 'bt-msg' },
        h('div', { className: 'bt-msg-line' },
          h(BotMark, { bot, size: 22 }),
          h('div', { className: 'bt-bubble' }, text)))),
    keyFor
      ? h(ModelKeyCard, { key: keyFor.provider, model: keyFor, actions })
      : h('div', { className: 'bt-model-chips', role: 'group', 'aria-label': t('Choose a model') }, choices),
    error ? h('div', { className: 'bt-secret-error bt-model-error', role: 'alert' }, error) : null)
}

// The provider's API key, saved through the host; once it is set, the provider's
// models become the choices.
export function ModelKeyCard({ model, actions }: { model: ModelEntry; actions: ModelChoiceActions }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = t('{provider} API key', { provider: model.providerName ?? model.provider })
  const ready = value.trim() !== '' && !busy
  const save = (): void => {
    if (!ready || actions.setProviderKey === undefined) return
    setBusy(true)
    setError('')
    void Promise.resolve(actions.setProviderKey(model.provider, value))
      .then(() => setValue(''), (failure: unknown) => setError(hostText(failureMessage(failure))))
      .finally(() => setBusy(false))
  }
  return h('div', { className: 'bt-q bt-model-key', role: 'group', 'aria-label': label },
    h('div', { className: 'bt-model-key-title' }, h(KeyIcon), label),
    h('label', { className: 'bt-q-field bt-secret-field' }, h(MaskedInput, { value, onChange: setValue, onEnter: save, label, autoFocus: true })),
    error ? h('div', { className: 'bt-secret-error', role: 'alert' }, error) : null,
    h('div', { className: 'bt-q-foot' },
      actions.openModels ? h('button', { type: 'button', className: 'bt-q-btn bt-model-key-other', onClick: actions.openModels }, t('Another provider')) : null,
      h('button', { type: 'button', className: 'bt-q-submit', disabled: !ready, onClick: save }, busy ? t('Saving…') : t('Save'))))
}

// Where the providers are set up: the window's own Models page, else DSH's settings.

// Ways to get a first model. The DeepSeek sign-in exists only where the shell carries
// its account plugin (the Desktop); the API key and custom models use the shell's
// own editors.
export function setupChoices(actions: ModelMenuOptionalActions): [string, () => unknown][] {
  const choices: ([string, () => unknown] | null)[] = [
    actions.canSignIn?.() ? [t('Sign in to DeepSeek'), () => actions.signIn?.()] : null,
    actions.openHarnessOnboarding ? [t('Enter a DeepSeek API key'), () => actions.openHarnessOnboarding?.('deepseek-official')] : null,
    actions.openHarnessSettings ? [t('Open settings to set up a custom model'), () => actions.openHarnessSettings?.('models')] : null,
  ]
  return choices.filter((choice): choice is [string, () => unknown] => choice !== null)
}

// The shell's own DeepSeek sign-in dialog, borrowed from its account plugin: the
// plugin's model sign-in entry renders here with the plugin's own operations.
export function DeepSeekSignIn({ useUi, actions }: { useUi: <T>(select: (state: { signIn?: number | null | undefined }) => T) => T; actions: ModelMenuOptionalActions }) {
  const open = useUi(state => state.signIn)
  const entry = open ? actions.signInEntry?.() ?? null : null
  if (!entry) return null
  return h(SignInHost, { key: String(open), entry, actions })
}

export function SignInHost({ entry, actions }: { entry: SignInEntry; actions: ModelMenuOptionalActions }) {
  const [ops] = useState<SignInOps>(() => (entry.inject?.() ?? {}) as SignInOps)
  const close = (): void => actions.closeSignIn?.()
  useEscape(close)
  const useHook = (source: SignInSource) => <T>(selector: (state: unknown) => T): T => useSyncExternalStore(source.subscribe, () => selector(source.getSnapshot()))
  const [hooks] = useState(() => ({ useAccount: useHook(ops.hooks.account), useTheme: useHook(ops.hooks.theme) }))
  return h(entry.component, {
    ...ops,
    ...hooks,
    t: actions.accountT?.(),
    complete: close,
    useApiKey: () => { close(); actions.openHarnessOnboarding?.('deepseek-official') },
  })
}

const failureMessage = (failure: unknown): string => (failure as { message?: string } | null)?.message ?? String(failure)

