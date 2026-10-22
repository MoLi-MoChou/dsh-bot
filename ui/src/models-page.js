// 设置 → 模型：重新设计的模型配置页。
// 一个“配置档”= 一个模型服务（DeepSeek 或任何 OpenAI 兼容接口）+ 一把 API key + 它提供的模型；可以有多个。
// 外观沿用 DS Bot providers-page.js / secret-card.js 的类名与组件（MaskedInput、Segmented，Apache-2.0）。
import { createElement as h, Fragment, useEffect, useState } from 'react'
import { CheckIcon, CloseIcon, PlusIcon, TrashIcon } from '../../vendor/ds-bot/client/icons.js'
import { KeyIcon, MaskedInput } from '../../vendor/ds-bot/client/secret-card.js'
import { Segmented } from '../../vendor/ds-bot/client/motion.js'
import { call } from './api.js'

const PROTOCOL_NAMES = { 'openai-completions': 'OpenAI Chat Completions（最常见）', 'openai-responses': 'OpenAI Responses', 'anthropic-messages': 'Anthropic Messages' }

export function ModelsPage({ Section, Row, run }) {
  const [view, setView] = useState(null)
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const refresh = () => run(call('models').then(setView))
  useEffect(() => { void refresh() }, [])
  if (view === null) return h('div', { className: 'bt-set-hint' }, '读取中…')
  const def = view.default
  const owner = view.profiles.find(p => p.id === def?.provider)
  const ready = owner && owner.models.some(m => m.id === def.model) && owner.key.configured
  const onSaved = (next) => { setView(next); setAdding(false); setOpen(null) }
  return h(Fragment, null,
    h(Section, { title: '默认模型' },
      h(DefaultRow, { view, setView, run, Row, ready }),
      !ready ? h('div', { className: 'bt-set-row dsb-model-warn' }, h('span', { className: 'bt-set-hint' },
        view.profiles.length === 0 ? '还没有配置模型。添加一个 DeepSeek 或 OpenAI 兼容的服务，填上 API key 就能开始聊天。'
          : !owner ? '默认模型不在下面的配置档里，请重新选一个。' : !owner.key.configured ? `“${owner.name}”还没有 API key。` : '请重新选择默认模型。')) : null),
    h(Section, { title: `模型服务 · ${view.profiles.length}` },
      view.profiles.map(p => h(ProfileItem, { key: p.id, profile: p, view, isDefault: p.id === def?.provider, open: open === p.id, onToggle: () => setOpen(open === p.id ? null : p.id), onSaved, run })),
      adding ? h('div', { className: 'bt-set-row bt-set-paste dsb-profile-add' }, h(ProfileForm, { view, run, onSaved, onCancel: () => setAdding(false) })) : null,
      !adding ? h('button', { type: 'button', className: 'bt-set-row dsb-add-row', onClick: () => { setAdding(true); setOpen(null) } }, h(PlusIcon), h('span', null, '添加模型服务')) : null))
}

function DefaultRow({ view, setView, run, Row, ready }) {
  const def = view.default ?? {}
  const value = `${def.provider}\u0000${def.model}`
  const options = view.profiles.flatMap(p => p.models.map(m => ({ value: `${p.id}\u0000${m.id}`, label: `${p.name} · ${m.name}`, profile: p, model: m })))
  const current = options.find(o => o.value === value)
  const pick = (v) => {
    const [provider, model] = v.split('\u0000')
    void run(call('models/default', { provider, model }).then(setView))
  }
  const thinking = current?.model.reasoning
  return h(Fragment, null,
    h(Row, { label: '新对话使用', hint: current ? `${current.profile.baseURL}` : '还没有可用的模型' },
      h('select', { className: 'bt-select dsb-default-select', 'aria-label': '默认模型', value: current ? value : '', disabled: options.length === 0, onChange: e => pick(e.target.value) },
        current ? null : h('option', { value: '', disabled: true }, options.length ? '选择一个模型' : '先添加模型服务'),
        view.profiles.map(p => h('optgroup', { key: p.id, label: p.name }, p.models.map(m => h('option', { key: m.id, value: `${p.id}\u0000${m.id}` }, m.name)))))),
    thinking ? h(Row, { label: '深度思考', hint: '回复前先思考，速度慢一些、更擅长复杂问题。' },
      h(Segmented, { label: '深度思考', value: def.reasoningEffort === 'high' ? 'high' : 'off' },
        [['off', '关'], ['high', '开']].map(([id, label]) => h('button', {
          key: id, type: 'button', 'aria-pressed': (def.reasoningEffort === 'high' ? 'high' : 'off') === id,
          onClick: () => void run(call('models/default', { provider: def.provider, model: def.model, reasoningEffort: id }).then(setView)),
        }, label)))) : null,
    ready ? h(Row, { label: '状态' }, h('span', { className: 'bt-provider-state', 'data-state': 'set' }, '可以使用')) : null)
}

function stateOf(p) {
  if (!p.key.configured) return ['missing', '缺少 API key']
  if (p.error) return ['missing', '出错']
  return ['set', 'Key 已保存']
}

function ProfileItem({ profile, view, isDefault, open, onToggle, onSaved, run }) {
  const [confirm, setConfirm] = useState(false)
  const st = stateOf(profile)
  return h('div', { className: 'bt-secret-item bt-provider', 'data-open': open ? '' : undefined, 'data-profile': profile.id },
    h('button', { type: 'button', className: 'bt-set-row bt-secret-summary', 'aria-expanded': open, onClick: onToggle },
      h('span', { className: 'bt-set-copy' },
        h('span', { className: 'bt-secret-title' }, profile.name, isDefault ? h('span', { className: 'bt-tag dsb-tag-accent' }, '默认') : null, h('span', { className: 'bt-tag' }, profile.preset === 'deepseek' ? 'DeepSeek' : 'OpenAI 兼容')),
        h('span', { className: 'bt-set-hint', 'data-error': profile.error ? '' : undefined }, profile.error ?? `${profile.baseURL} · ${profile.models.length} 个模型`)),
      h('span', { className: 'bt-set-control' }, h('span', { className: 'bt-provider-state', 'data-state': st[0] }, st[1]))),
    open ? h('div', { className: 'bt-secret-edit' },
      profile.editable ? h(ProfileForm, { view, profile, run, onSaved, onCancel: onToggle })
        : h('div', { className: 'bt-set-hint' }, '这个服务是在配置文件里写的，这里只能查看。'),
      profile.editable ? h('div', { className: 'bt-secret-row-actions dsb-danger-zone' },
        confirm ? [
          h('span', { key: 'q', className: 'bt-set-hint' }, `删除“${profile.name}”和它保存的 API key？`),
          h('button', { key: 'no', type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => setConfirm(false) }, '保留'),
          h('button', { key: 'yes', type: 'button', className: 'bt-soft bt-soft-sm bt-secret-danger', onClick: () => void run(call('models/remove', { id: profile.id }).then(onSaved)) }, '删除'),
        ] : h('button', { type: 'button', className: 'bt-soft bt-soft-sm bt-secret-danger', onClick: () => setConfirm(true) }, h(TrashIcon), '删除这个服务')) : null) : null)
}

// 添加 / 编辑一个模型服务。
export function ProfileForm({ view, profile, run, onSaved, onCancel }) {
  const editing = Boolean(profile)
  const [preset, setPreset] = useState(profile?.preset ?? 'deepseek')
  const [draft, setDraft] = useState(() => ({
    name: profile?.name ?? '', baseURL: profile?.baseURL ?? view.presets.deepseek.baseURL, api: profile?.api ?? 'openai-completions', key: '',
  }))
  const [models, setModels] = useState(() => profile?.models ?? view.presets.deepseek.models.map(id => ({ id, name: id, reasoning: id.includes('reasoner') })))
  const [found, setFound] = useState(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(null)
  const [test, setTest] = useState(null)
  const [makeDefault, setMakeDefault] = useState(!editing && view.profiles.length === 0)
  const [primary, setPrimary] = useState(models[0]?.id ?? '')
  const set = (k, v) => { setDraft(d => ({ ...d, [k]: v })); setTest(null) }
  const switchPreset = (next) => {
    if (next === preset) return
    setPreset(next); setTest(null); setFound(null)
    if (next === 'deepseek') { set('baseURL', view.presets.deepseek.baseURL); set('api', 'openai-completions'); const m = view.presets.deepseek.models.map(id => ({ id, name: id, reasoning: id.includes('reasoner') })); setModels(m); setPrimary(m[0].id) }
    else { set('baseURL', ''); setModels([]); setPrimary('') }
  }
  const endpoint = () => ({ id: profile?.id, baseURL: draft.baseURL, api: draft.api, key: draft.key })
  const fetchModels = async () => {
    setBusy('fetch')
    const ok = await run(call('models/fetch', endpoint()).then(setFound))
    if (!ok) setFound(null)
    setBusy(null)
  }
  const has = id => models.some(m => m.id === id)
  const toggle = (m) => {
    setTest(null)
    setModels(list => (list.some(x => x.id === m.id) ? list.filter(x => x.id !== m.id) : [...list, { id: m.id, name: m.name ?? m.id, reasoning: /reason|think|r1/i.test(m.id), image: m.image === true }]))
    if (!primary) setPrimary(m.id)
  }
  const addTyped = () => {
    const ids = typed.split(/[\s,，]+/).map(s => s.trim()).filter(Boolean).filter(id => !has(id))
    if (!ids.length) return
    setModels(list => [...list, ...ids.map(id => ({ id, name: id, reasoning: /reason|think|r1/i.test(id) }))])
    if (!primary) setPrimary(ids[0]); setTyped('')
  }
  const flag = (id, k) => setModels(list => list.map(m => (m.id === id ? { ...m, [k]: !m[k] } : m)))
  const testNow = async () => {
    setBusy('test'); setTest(null)
    await run(call('models/test', { ...endpoint(), model: primary || models[0]?.id }).then(setTest))
    setBusy(null)
  }
  const keyNeeded = !editing || !profile.key.configured
  const ready = draft.baseURL.trim() !== '' && models.length > 0 && (!keyNeeded || draft.key.trim() !== '')
  const save = async () => {
    setBusy('save')
    const ordered = [...models].sort((a, b) => (a.id === primary ? -1 : b.id === primary ? 1 : 0))
    const ok = await run(call('models/save', { id: profile?.id, preset, name: draft.name, baseURL: draft.baseURL, api: draft.api, key: draft.key, models: ordered, makeDefault })
      .then(async (r) => {
        let v = r.view
        if (makeDefault && primary) v = await call('models/default', { provider: r.id, model: primary })
        onSaved(v)
      }))
    if (!ok) setBusy(null)
  }
  const field = (k, label, placeholder, extra = {}) => h('label', { className: 'dsb-field' }, h('span', { className: 'dsb-field-label' }, label),
    h('input', { className: 'bt-input', 'aria-label': label, placeholder, value: draft[k], spellCheck: false, autoComplete: 'off', onChange: e => set(k, e.target.value), ...extra }))
  return h('div', { className: 'dsb-profile-form' },
    h('div', { className: 'dsb-step' }, h('span', { className: 'dsb-field-label' }, '服务类型'),
      h(Segmented, { label: '服务类型', value: preset, className: 'dsb-preset-seg' },
        [['deepseek', 'DeepSeek 官方'], ['openai', 'OpenAI 兼容（自定义地址）']].map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': preset === id, onClick: () => switchPreset(id) }, label)))),
    h('div', { className: 'bt-provider-pair' },
      field('name', '名称', preset === 'deepseek' ? 'DeepSeek' : '例如：公司网关、硅基流动'),
      preset === 'openai' ? h('label', { className: 'dsb-field' }, h('span', { className: 'dsb-field-label' }, '协议'),
        h('select', { className: 'bt-select', 'aria-label': '协议', value: draft.api, onChange: e => set('api', e.target.value) }, view.protocols.map(p => h('option', { key: p, value: p }, PROTOCOL_NAMES[p] ?? p))))
        : h('div')),
    field('baseURL', '接口地址', 'https://api.example.com/v1', preset === 'deepseek' ? { title: 'DeepSeek 官方接口，一般不用改' } : {}),
    h('label', { className: 'dsb-field' }, h('span', { className: 'dsb-field-label' }, 'API key', editing && profile.key.configured ? h('span', { className: 'dsb-field-note' }, '已保存（不会显示）；留空表示不修改') : null),
      h('span', { className: 'bt-q-field bt-secret-field' }, h(KeyIcon), h(MaskedInput, { value: draft.key, onChange: v => set('key', v), label: 'API key' }))),
    h('div', { className: 'dsb-field' },
      h('div', { className: 'bt-provider-models-head' }, h('span', { className: 'dsb-field-label' }, `模型 · 已选 ${models.length}`),
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: busy !== null || !draft.baseURL.trim(), onClick: fetchModels }, busy === 'fetch' ? '获取中…' : '从接口获取模型列表')),
      found && found.length === 0 ? h('div', { className: 'bt-set-hint' }, '接口没有返回模型，请在下面手动填写模型 ID。') : null,
      found && found.length > 0 ? h('div', { className: 'bt-secret-bots bt-provider-found', 'aria-label': '可用模型' }, found.map(m => h('button', {
        key: m.id, type: 'button', className: 'bt-secret-bot', 'aria-pressed': has(m.id), onClick: () => toggle(m),
      }, h('code', null, m.id), has(m.id) ? h(CheckIcon) : null))) : null,
      h('div', { className: 'dsb-typed' },
        h('input', { className: 'bt-input', placeholder: '手动添加模型 ID，多个用逗号隔开', value: typed, 'aria-label': '手动添加模型', onChange: e => setTyped(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTyped() } } }),
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: !typed.trim(), onClick: addTyped }, '添加')),
      models.length ? h('div', { className: 'dsb-model-list', role: 'list' }, models.map(m => h('div', { key: m.id, className: 'dsb-model-item', role: 'listitem' },
        h('label', { className: 'dsb-radio', title: '测试和设为默认时用这个模型' }, h('input', { type: 'radio', name: `primary-${profile?.id ?? 'new'}`, checked: primary === m.id, onChange: () => setPrimary(m.id) }), h('code', null, m.id)),
        h('span', { className: 'dsb-model-flags' },
          h('button', { type: 'button', className: 'bt-tag dsb-flag', 'aria-pressed': m.reasoning === true, title: '模型支持深度思考', onClick: () => flag(m.id, 'reasoning') }, '思考'),
          h('button', { type: 'button', className: 'bt-tag dsb-flag', 'aria-pressed': m.image === true, title: '模型能看图片', onClick: () => flag(m.id, 'image') }, '图片'),
          h('button', { type: 'button', className: 'bt-icon-btn', 'aria-label': `移除 ${m.id}`, onClick: () => { setModels(list => list.filter(x => x.id !== m.id)); if (primary === m.id) setPrimary('') } }, h(CloseIcon)))))) : null),
    h('label', { className: 'dsb-check' }, h('input', { type: 'checkbox', checked: makeDefault, onChange: e => setMakeDefault(e.target.checked) }), h('span', null, '保存后设为默认模型', primary ? `（${primary}）` : '')),
    test ? h('div', { className: 'dsb-test', 'data-ok': test.ok || undefined, role: 'status' }, test.ok ? h(Fragment, null, h(CheckIcon), `连接成功 · ${test.ms} ms`) : h(Fragment, null, h(CloseIcon), `连接失败：${test.message}`)) : null,
    h('div', { className: 'bt-secret-row-actions dsb-form-actions' },
      h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: busy !== null || !draft.baseURL.trim() || models.length === 0 || (keyNeeded && !draft.key.trim()), onClick: testNow }, busy === 'test' ? '测试中…' : '测试连接'),
      h('span', { style: { flex: 1 } }),
      h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: onCancel }, '取消'),
      h('button', { type: 'button', className: 'bt-fb-primary', disabled: !ready || busy !== null, onClick: save }, busy === 'save' ? '保存中…' : '保存')))
}
