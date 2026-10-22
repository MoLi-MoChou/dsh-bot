// OpenUI 富消息：一个小的白名单组件库，外观直接用 DS Bot 问答卡（.bt-q）的类名与变量。
// bot 回复里 ```openui 围栏内的内容交给 OpenUI Renderer 流式渲染；围栏外仍是普通 Markdown 气泡。
// 没用 OpenUI 官方的 @openuidev/react-ui：它自带一套 Thesys 风格的设计系统与样式表，和 DS Bot 的外观冲突。
import { createContext, createElement as h, useContext, useMemo, useState } from 'react'
import { z } from 'zod/v4'
import { createLibrary, defineComponent, Renderer, action, reactive, useRenderNode, useStateField, useTriggerAction, useIsStreaming } from '@openuidev/react-lang'

// 一张卡片提交过一次（或者用户之后又发了消息）就整体锁定，并记住点的是哪个按钮。
const Lock = createContext({ locked: false, chosen: null, choose: () => {} })
const useLocked = () => { const streaming = useIsStreaming(); const lock = useContext(Lock); return { ...lock, off: streaming || lock.locked } }

const Card = defineComponent({
  name: 'Card', description: 'Root container: a rounded card that stacks its children vertically',
  props: z.object({ children: z.array(z.any()).describe('Child components') }),
  component: ({ props }) => { const render = useRenderNode(); return h('div', { className: 'bt-q ou-card' }, render(props.children)) },
})
const CardHeader = defineComponent({
  name: 'CardHeader', description: 'Card title with an optional one-line subtitle; put it first in the Card',
  props: z.object({ title: z.string(), subtitle: z.string().optional() }),
  component: ({ props }) => h('div', { className: 'ou-head' }, h('h3', { className: 'ou-title' }, props.title), props.subtitle ? h('div', { className: 'ou-sub' }, props.subtitle) : null),
})
const Table = defineComponent({
  name: 'Table', description: 'A compact table: header labels and rows of cell strings. Keep it to a few columns',
  props: z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  component: ({ props }) => h('div', { className: 'ou-table-wrap' }, h('table', { className: 'ou-table' },
    h('thead', null, h('tr', null, (props.headers ?? []).map((c, i) => h('th', { key: i, scope: 'col' }, c)))),
    h('tbody', null, (props.rows ?? []).map((r, i) => h('tr', { key: i }, (r ?? []).map((c, j) => h('td', { key: j }, c))))))),
})
const Field = ({ label, children }) => h('label', { className: 'ou-field' }, label ? h('span', { className: 'ou-label' }, label) : null, h('span', { className: 'bt-q-field' }, children))
const Input = defineComponent({
  name: 'Input', description: 'A one-line text field bound to a $variable, with an optional label above it',
  props: z.object({ name: z.string(), placeholder: z.string().optional(), value: reactive(z.string().optional()), label: z.string().optional() }),
  component: ({ props }) => {
    const field = useStateField(props.name, props.value)
    const { off } = useLocked()
    return h(Field, { label: props.label }, h('input', { className: 'bt-q-input', placeholder: props.placeholder, value: field.value ?? '', disabled: off, onChange: e => field.setValue(e.target.value) }))
  },
})
function ActionButton({ label, act, variant, solo }) {
  const trigger = useTriggerAction()
  const { off, chosen, choose } = useLocked()
  const picked = chosen === label
  return h('button', {
    type: 'button', className: `${variant === 'secondary' ? 'bt-q-btn' : 'bt-q-submit'}${solo ? ' ou-btn-solo' : ''}`, disabled: off,
    'data-chosen': picked || undefined, 'aria-pressed': picked || undefined,
    onClick: () => { choose(label); trigger(label, undefined, act) },
  }, label)
}
const Button = defineComponent({
  name: 'Button', description: 'A button that runs an action such as @ToAssistant(message); variant "secondary" for a quieter button. Wrap 2+ buttons in Buttons',
  props: z.object({ label: z.string(), action: action().optional(), variant: z.enum(['primary', 'secondary']).optional() }),
  component: ({ props }) => h(ActionButton, { label: props.label, act: props.action, variant: props.variant, solo: true }),
})

const GAPS = { s: 6, m: 10, l: 16 }
const Stack = defineComponent({
  name: 'Stack', description: 'Lays out children in a column (default) or a wrapping row',
  props: z.object({ children: z.array(z.any()), direction: z.enum(['column', 'row']).optional(), gap: z.enum(['s', 'm', 'l']).optional() }),
  component: ({ props }) => { const render = useRenderNode(); return h('div', { className: 'ou-stack', 'data-dir': props.direction ?? 'column', style: { gap: GAPS[props.gap ?? 'm'] } }, render(props.children)) },
})
const Text = defineComponent({
  name: 'Text', description: 'A paragraph of plain text; variant "muted" for secondary text, "strong" for emphasis',
  props: z.object({ text: z.string(), variant: z.enum(['body', 'muted', 'strong']).optional() }),
  component: ({ props }) => h('p', { className: 'ou-text', 'data-variant': props.variant ?? 'body' }, props.text),
})
const List = defineComponent({
  name: 'List', description: 'A bulleted list of short strings; ordered=true for numbers',
  props: z.object({ items: z.array(z.string()), ordered: z.boolean().optional() }),
  component: ({ props }) => h(props.ordered ? 'ol' : 'ul', { className: 'ou-list' }, (props.items ?? []).map((it, i) => h('li', { key: i }, it))),
})
const KeyValue = defineComponent({
  name: 'KeyValue', description: 'Label/value pairs, e.g. [["Status","Done"],["Owner","Me"]]',
  props: z.object({ pairs: z.array(z.array(z.string())) }),
  component: ({ props }) => h('dl', { className: 'ou-kv' }, (props.pairs ?? []).flatMap((p, i) => [h('dt', { key: `k${i}` }, p?.[0] ?? ''), h('dd', { key: `v${i}` }, p?.[1] ?? '')])),
})
const Tag = defineComponent({
  name: 'Tag', description: 'A small status pill; tone neutral|accent|success|warning|danger. Put several in a row Stack',
  props: z.object({ label: z.string(), tone: z.enum(['neutral', 'accent', 'success', 'warning', 'danger']).optional() }),
  component: ({ props }) => h('span', { className: 'ou-tag', 'data-tone': props.tone ?? 'neutral' }, props.label),
})
const Callout = defineComponent({
  name: 'Callout', description: 'A highlighted note; tone info|success|warning|danger',
  props: z.object({ text: z.string(), tone: z.enum(['info', 'success', 'warning', 'danger']).optional(), title: z.string().optional() }),
  component: ({ props }) => h('div', { className: 'ou-callout', 'data-tone': props.tone ?? 'info', role: 'note' }, props.title ? h('b', null, props.title) : null, h('span', null, props.text)),
})
const Progress = defineComponent({
  name: 'Progress', description: 'A progress bar from 0 to 100 with an optional label',
  props: z.object({ value: z.number(), label: z.string().optional() }),
  component: ({ props }) => {
    const v = Math.max(0, Math.min(100, Number(props.value) || 0))
    return h('div', { className: 'ou-progress' }, h('div', { className: 'ou-progress-top' }, h('span', null, props.label ?? ''), h('span', null, `${Math.round(v)}%`)),
      h('div', { className: 'ou-progress-bar', role: 'progressbar', 'aria-valuenow': v, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: `${v}%` } })))
  },
})
const Divider = defineComponent({ name: 'Divider', description: 'A thin horizontal line', props: z.object({}), component: () => h('hr', { className: 'ou-hr' }) })
const TextArea = defineComponent({
  name: 'TextArea', description: 'A multi-line text field bound to a $variable, with an optional label',
  props: z.object({ name: z.string(), placeholder: z.string().optional(), value: reactive(z.string().optional()), label: z.string().optional() }),
  component: ({ props }) => {
    const field = useStateField(props.name, props.value)
    const { off } = useLocked()
    return h(Field, { label: props.label }, h('textarea', { className: 'bt-q-input ou-textarea', rows: 3, placeholder: props.placeholder, value: field.value ?? '', disabled: off, onChange: e => field.setValue(e.target.value), style: { minHeight: 60, overflowY: 'auto' } }))
  },
})
const Select = defineComponent({
  name: 'Select', description: 'A dropdown of options bound to a $variable, with an optional label',
  props: z.object({ name: z.string(), options: z.array(z.string()), value: reactive(z.string().optional()), label: z.string().optional() }),
  component: ({ props }) => {
    const field = useStateField(props.name, props.value)
    const { off } = useLocked()
    return h(Field, { label: props.label }, h('select', { className: 'bt-q-input ou-select', value: field.value ?? '', disabled: off, onChange: e => field.setValue(e.target.value) },
      h('option', { value: '', disabled: true }, '请选择…'), (props.options ?? []).map(o => h('option', { key: o, value: o }, o))))
  },
})
const Checkbox = defineComponent({
  name: 'Checkbox', description: 'A checkbox with a label bound to a boolean $variable',
  props: z.object({ name: z.string(), label: z.string(), value: reactive(z.boolean().optional()) }),
  component: ({ props }) => {
    const field = useStateField(props.name, props.value)
    const { off } = useLocked()
    return h('label', { className: 'ou-check' }, h('input', { type: 'checkbox', checked: field.value === true, disabled: off, onChange: e => field.setValue(e.target.checked) }), h('span', null, props.label))
  },
})
const Choices = defineComponent({
  name: 'Choices', description: 'Quick-reply options shown as a numbered list; clicking one sends that option back as the user\'s answer. Use instead of asking the user to type a choice',
  props: z.object({ options: z.array(z.string()) }),
  component: ({ props }) => {
    const trigger = useTriggerAction()
    const { off, chosen, choose } = useLocked()
    return h('div', { className: 'bt-q-list ou-choices', role: 'group' }, (props.options ?? []).map((o, i) => h('button', {
      key: o, type: 'button', className: 'bt-q-opt', disabled: off, 'aria-pressed': chosen === o || undefined,
      onClick: () => { choose(o); trigger(o, undefined, { type: 'continue_conversation', params: { message: o } }) },
    }, h('span', { className: 'bt-key' }, i + 1), h('span', { className: 'bt-q-body' }, h('span', { className: 'bt-q-label' }, o)))))
  },
})
const ButtonRow = defineComponent({
  name: 'Buttons', description: 'Puts several Button components side by side, right-aligned; the last one should be the primary action',
  props: z.object({ children: z.array(z.any()) }),
  component: ({ props }) => {
    const render = useRenderNode()
    // Buttons 里的按钮不单独靠右（ou-btn-solo 只给单独放置的按钮）。
    return h('div', { className: 'ou-buttons' }, render(props.children))
  },
})

export const library = createLibrary({ components: [Card, CardHeader, Stack, Text, List, KeyValue, Table, Tag, Callout, Progress, Divider, Input, TextArea, Select, Checkbox, Button, ButtonRow, Choices], root: 'Card' })

// 发给模型的组件库说明（宿主把它拼进 bot 的 system prompt）。
export const libraryPrompt = () => library.prompt({ preamble: [
  'You can reply with an interactive card by writing an ```openui fenced block that uses only the components below.',
  'Use a card only when it clearly beats prose: comparing several items (Table), a status or progress overview (Tag, Progress, KeyValue), a checklist, a short form to collect several fields at once, or offering 2-5 quick-reply options (Choices).',
  'Do NOT use a card for greetings, explanations, opinions, single facts, short answers, code, or anything that reads fine as a sentence or a Markdown list. Most replies should have no card.',
  'At most one card per reply. Put one short sentence of prose before the fence and keep the card small: a CardHeader, then a few components. Never put secrets in a card.',
  'Buttons and Choices send their message back to you as the user\'s next turn; after that the card is locked, so do not ask the user to click it again.',
].join(' ') })

// 把一条 bot 文本拆成 Markdown 段和 OpenUI 段。
export function splitOpenUI(text) {
  const parts = []
  const re = /```openui[^\n]*\n([\s\S]*?)(```|$)/g
  let last = 0
  for (let m; (m = re.exec(text));) {
    if (m.index > last) parts.push({ kind: 'md', text: text.slice(last, m.index) })
    parts.push({ kind: 'ui', text: m[1], open: m[2] === '' })
    last = re.lastIndex
  }
  if (last < text.length) parts.push({ kind: 'md', text: text.slice(last) })
  // 流式时围栏头刚写了一半（“```ope”）先不显示，免得闪一下原文。
  return parts.filter(p => p.text.trim() !== '').map(p => p.kind === 'md' ? { ...p, text: p.text.replace(/```[a-z]*$/, '') } : p).filter(p => p.text.trim() !== '')
}

const CHECK = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'm5 12 5 5 9-10' }))
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* 满了就不存 */ } } }

// stateKey：表单值与“已提交”状态存在 localStorage 里，刷新页面后卡片保持原样。
// locked：这张卡片之后用户又说过话，也视为已处理。
export function OpenUIBlock({ source, streaming, onSend, stateKey, locked }) {
  const saved = useMemo(() => (stateKey ? store.get(`ou:${stateKey}`) : null), [stateKey])
  const [chosen, setChosen] = useState(saved?.chosen ?? null)
  const [parse, setParse] = useState({ root: undefined, errors: 0 })
  const lock = useMemo(() => ({ locked: locked || chosen !== null, chosen, choose: (label) => { setChosen(label); if (stateKey) store.set(`ou:${stateKey}`, { ...store.get(`ou:${stateKey}`), chosen: label }) } }), [locked, chosen, stateKey])
  const empty = parse.root === null || parse.root === undefined
  if (!streaming && empty && parse.root !== undefined) {
    return h('div', { className: 'ou-wrap ou-fallback' }, h('span', { className: 'ou-fallback-note' }, '这张卡片没能显示，下面是原文：'), h('pre', null, source))
  }
  const wide = /Table\(/.test(source)
  return h('div', { className: `ou-wrap${streaming && !empty ? ' ou-live' : ''}`, 'data-wide': wide || undefined, 'aria-busy': streaming || undefined },
    streaming && empty ? h('div', { className: 'bt-q ou-card ou-skel-card', 'aria-label': '正在生成卡片' }, h('div', { className: 'ou-skel' }, h('i'), h('i'), h('i'))) : null,
    h(Lock.Provider, { value: lock }, h('div', { hidden: streaming && empty || undefined }, h(Renderer, {
      response: source,
      library,
      isStreaming: streaming,
      initialState: saved?.state ?? undefined,
      onStateUpdate: stateKey && !streaming ? (state) => store.set(`ou:${stateKey}`, { ...store.get(`ou:${stateKey}`), state }) : undefined,
      onParseResult: (r) => setParse(p => (p.root === (r?.root ?? null) ? p : { root: r?.root ?? null, errors: r?.meta?.errors?.length ?? 0 })),
      onAction: (event) => { if (event.type === 'continue_conversation') onSend(event.params?.message ?? event.humanFriendlyMessage ?? '') },
      onError: errors => { if (errors?.length && !streaming) console.warn('openui', JSON.stringify(errors).slice(0, 600)) },
    }))),
    !streaming && chosen ? h('div', { className: 'ou-done' }, CHECK, `已发送：${chosen}`) : null)
}
