// Secrets settings page and its row editors. Split from secret-card so each
// file stays inside the 350-line logic limit.
import { createElement as h, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckIcon, TrashIcon } from './icons.ts'
import { BotAvatar } from './mark.ts'
import { t } from './i18n.ts'
import { useEscape } from './overlay-hooks.ts'
import {
  KeyIcon, MaskedInput,
} from './secret-card.ts'
import type {
  SecretActions, SecretBot, SecretEntry, SecretScope, SecretsRoster,
} from './secret-card.ts'
import { dateLocale } from './i18n.ts'

const MIN_VALUE = 4

const when = (time: number | undefined): string => (time !== undefined && Number.isFinite(time)
  ? new Date(time).toLocaleString(dateLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '')

interface ScopeEditorProps {
  secret: SecretEntry
  roster: SecretsRoster
  onSave: (scope: SecretScope) => unknown
}
function ScopeEditor({ secret, roster, onSave }: ScopeEditorProps) {
  const [mode, setMode] = useState<'all' | 'some'>(secret.scope === 'all' ? 'all' : 'some')
  const [picked, setPicked] = useState<string[]>(secret.scope === 'all' ? [] : secret.scope)
  const toggle = (id: string): void => setPicked(list => (list.includes(id) ? list.filter(item => item !== id) : [...list, id]))
  const same = mode === 'all' ? secret.scope === 'all' : secret.scope !== 'all' && [...picked].sort().join() === [...secret.scope].sort().join()
  return h('div', { className: 'bt-secret-edit-block' },
    h('div', { className: 'bt-secret-edit-label' }, t('Who may use it')),
    h('div', { className: 'bt-secret-radios', role: 'radiogroup', 'aria-label': t('Who may use {name}', { name: secret.name }) },
      ([['all', t('All Bots')], ['some', t('Chosen Bots')]] as const).map(([id, text]) => h('label', { key: id, className: 'bt-secret-radio' },
        h('input', { type: 'radio', name: `scope-${secret.name}`, checked: mode === id, onChange: () => setMode(id) }), text))),
    mode === 'some' ? h('div', { className: 'bt-secret-bots' }, roster.bots.map(bot => h('button', {
      key: bot.id, type: 'button', className: 'bt-secret-bot', 'aria-pressed': picked.includes(bot.id), onClick: () => toggle(bot.id),
    }, h(BotAvatar, { bot, size: 20, badge: false, live: false }), bot.name, picked.includes(bot.id) ? h(CheckIcon) : null))) : null,
    h('div', { className: 'bt-secret-row-actions' },
      h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: same, onClick: () => onSave(mode === 'all' ? 'all' : picked) }, t('Save access'))))
}

interface ValueEditorProps { secret: SecretEntry; onSave: (value: string) => unknown }
function ValueEditor({ secret, onSave }: ValueEditorProps) {
  const [value, setValue] = useState('')
  const [replaced, setReplaced] = useState(false)
  const long = value.trim().length >= MIN_VALUE
  const save = (): void => {
    if (!long) return
    void Promise.resolve(onSave(value)).then(ok => { if (ok) { setValue(''); setReplaced(true) } })
  }
  const edit = (next: string): void => { setValue(next); setReplaced(false) }
  return h('div', { className: 'bt-secret-edit-block' },
    h('div', { className: 'bt-secret-edit-label' }, t('Replace the value')),
    h('div', { className: 'bt-secret-inline' },
      h('label', { className: 'bt-q-field bt-secret-field' }, h(MaskedInput, { value, onChange: edit, onEnter: save, label: t('New value of {name}', { name: secret.name }) })),
      h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: !long, onClick: save }, t('Replace'))),
    value !== '' && !long ? h('div', { className: 'bt-set-hint' }, t('At least {count} characters.', { count: MIN_VALUE }))
      : replaced ? h('div', { className: 'bt-set-hint bt-secret-ok', role: 'status' }, h(CheckIcon), t('Replaced. Bots get the new value from their next command.')) : null)
}

interface SecretRowProps {
  secret: SecretEntry
  roster: SecretsRoster
  actions: SecretActions
  run: (work: Promise<unknown>) => Promise<boolean>
  open: boolean
  onToggle: () => void
}
function SecretRow({ secret, roster, actions, run, open, onToggle }: SecretRowProps) {
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { if (!open) setConfirm(false) }, [open])
  const asker = secret.requestedBy ? roster.byId[secret.requestedBy]?.name ?? t('a deleted Bot') : t('you')
  const allowed = secret.scope === 'all' ? [] : secret.scope.map(id => roster.byId[id]).filter((bot): bot is SecretBot => bot !== undefined)
  const meta = [t('Asked by {name}', { name: asker }), t('added {time}', { time: when(secret.createdAt) }), secret.lastUsedAt ? t('last used {time}', { time: when(secret.lastUsedAt) }) : t('not used yet')].join(' · ')
  return h('div', { className: 'bt-secret-item', 'data-open': open ? '' : undefined },
    h('button', { type: 'button', className: 'bt-set-row bt-secret-summary', 'aria-expanded': open, onClick: onToggle },
      h('span', { className: 'bt-set-copy' },
        h('span', { className: 'bt-secret-title' }, h(KeyIcon), h('code', { className: 'bt-secret-name' }, secret.name), secret.purpose ? h('span', { className: 'bt-secret-purpose' }, secret.purpose) : null),
        h('span', { className: 'bt-set-hint' }, meta)),
      h('span', { className: 'bt-set-control' },
        secret.scope === 'all' ? h('span', { className: 'bt-tag' }, t('All Bots'))
          : allowed.length === 0 ? h('span', { className: 'bt-tag' }, t('No Bot'))
            : h('span', { className: 'bt-secret-faces', title: allowed.map(bot => bot.name).join(', ') }, allowed.slice(0, 5).map(bot => h(BotAvatar, { key: bot.id, bot, size: 20, badge: false, live: false }))))),
    open ? h('div', { className: 'bt-secret-edit' },
      h(ScopeEditor, { key: JSON.stringify(secret.scope), secret, roster, onSave: scope => run(actions.secretUpdate(secret.name, scope)) }),
      h(ValueEditor, { secret, onSave: value => run(actions.secretSet({ name: secret.name, value })) }),
      h('div', { className: 'bt-secret-row-actions' },
        confirm
          ? [
              h('span', { key: 'q', className: 'bt-set-hint' }, t('Delete {name}? Bots lose it at once.', { name: secret.name })),
              h('button', { key: 'no', type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => setConfirm(false) }, t('Keep')),
              h('button', { key: 'yes', type: 'button', className: 'bt-soft bt-soft-sm bt-secret-danger', onClick: () => run(actions.secretDelete(secret.name)) }, t('Delete')),
            ]
          : h('button', { type: 'button', className: 'bt-soft bt-soft-sm bt-secret-danger', onClick: () => setConfirm(true) }, h(TrashIcon), t('Delete')))) : null)
}

interface AddSecretProps {
  actions: SecretActions
  run: (work: Promise<unknown>) => Promise<boolean>
  onDone: () => void
}
function AddSecret({ actions, run, onDone }: AddSecretProps) {
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [value, setValue] = useState('')
  const ready = /^[A-Za-z][\w-]{0,63}$/.test(name.trim()) && value.trim().length >= MIN_VALUE
  const save = (): void => {
    if (!ready) return
    void run(actions.secretSet({ name, purpose, value, scope: 'all' })).then(ok => { if (ok) { setValue(''); onDone() } })
  }
  return h('div', { className: 'bt-set-row bt-set-paste bt-secret-add' },
    h('input', { className: 'bt-input', 'aria-label': t('Key name'), placeholder: t('NAME, e.g. GITHUB_TOKEN'), value: name, spellCheck: false, autoComplete: 'off', autoFocus: true, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value.toUpperCase()) }),
    h('input', { className: 'bt-input', 'aria-label': t('What it is for'), placeholder: t('What it is for'), value: purpose, autoComplete: 'off', onChange: (event: React.ChangeEvent<HTMLInputElement>) => setPurpose(event.target.value) }),
    h('label', { className: 'bt-q-field bt-secret-field' }, h(MaskedInput, { value, onChange: setValue, onEnter: save, label: t('Value') })),
    h('div', { className: 'bt-secret-row-actions' },
      h('span', { className: 'bt-set-hint' }, t('New keys are for all Bots; narrow it down afterwards.')),
      h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: onDone }, t('Cancel')),
      h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: !ready, onClick: save }, t('Save key'))))
}

export interface SectionProps {
  title?: string | undefined
  className?: string | undefined
  children?: ReactNode | undefined
}
export interface SecretsPageProps {
  roster: SecretsRoster
  actions: SecretActions
  run: (work: Promise<unknown>) => Promise<boolean>
  Section: (props: SectionProps) => ReactNode
}
export function SecretsPage({ roster, actions, run, Section }: SecretsPageProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  useEscape(() => setAdding(false), adding)
  useEscape(() => setOpen(null), open !== null && !adding)
  const secrets = roster.secrets ?? []
  return [
    h('p', { key: 'about', className: 'bt-secret-about' },
      t('Keys your Bots asked for. Bots never see the values: they use them as '), h('code', null, '$DSH_SECRET_NAME'),
      t(' in their shell, and every value is replaced by '), h('code', null, '[secret:NAME]'), t(' before anything goes to a model.')),
    h(Section, { key: 'list', title: t('Secrets · {count}', { count: secrets.length }) },
      secrets.length === 0 && !adding ? h('div', { className: 'bt-set-row' }, h('span', { className: 'bt-set-hint' }, t('No keys yet. When a Bot needs one, it shows a card in its chat.'))) : null,
      secrets.map(secret => h(SecretRow, { key: secret.name, secret, roster, actions, run, open: open === secret.name, onToggle: () => setOpen(open === secret.name ? null : secret.name) })),
      adding ? h(AddSecret, { actions, run, onDone: () => setAdding(false) }) : null),
    adding ? null : h('div', { key: 'add', className: 'bt-actions' }, h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => setAdding(true) }, t('Add a key'))),
  ]
}

