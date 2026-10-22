// OpenUI 富消息：一个很小的组件库（白名单），外观用 DS Bot 的变量与类名。
// bot 回复里 ```openui 围栏内的内容交给 OpenUI Renderer 流式渲染；围栏外仍是普通 Markdown 气泡。
import { createElement as h } from 'react'
import { z } from 'zod/v4'
import { createLibrary, defineComponent, Renderer, action, reactive, useRenderNode, useStateField, useTriggerAction, useIsStreaming } from '@openuidev/react-lang'

const Card = defineComponent({
  name: 'Card', description: 'A rounded card that stacks its children vertically',
  props: z.object({ children: z.array(z.any()).describe('Child components') }),
  component: ({ props }) => { const render = useRenderNode(); return h('div', { className: 'ou-card' }, render(props.children)) },
})
const CardHeader = defineComponent({
  name: 'CardHeader', description: 'Card title with an optional subtitle',
  props: z.object({ title: z.string(), subtitle: z.string().optional() }),
  component: ({ props }) => h('div', { className: 'ou-head' }, h('div', { className: 'ou-title' }, props.title), props.subtitle ? h('div', { className: 'ou-sub' }, props.subtitle) : null),
})
const Table = defineComponent({
  name: 'Table', description: 'A simple table: header labels and rows of cell strings',
  props: z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  component: ({ props }) => h('table', { className: 'ou-table' },
    h('thead', null, h('tr', null, (props.headers ?? []).map((c, i) => h('th', { key: i }, c)))),
    h('tbody', null, (props.rows ?? []).map((r, i) => h('tr', { key: i }, (r ?? []).map((c, j) => h('td', { key: j }, c)))))),
})
const Input = defineComponent({
  name: 'Input', description: 'A one-line text field bound to a $variable',
  props: z.object({ name: z.string(), placeholder: z.string().optional(), value: reactive(z.string().optional()) }),
  component: ({ props }) => {
    const field = useStateField(props.name, props.value)
    const streaming = useIsStreaming()
    return h('input', { className: 'ou-input', placeholder: props.placeholder, value: field.value ?? '', disabled: streaming, onChange: e => field.setValue(e.target.value) })
  },
})
const Button = defineComponent({
  name: 'Button', description: 'A button that runs an action such as @ToAssistant(message); variant "secondary" for a quieter button',
  props: z.object({ label: z.string(), action: action().optional(), variant: z.enum(['primary', 'secondary']).optional() }),
  component: ({ props }) => {
    const trigger = useTriggerAction()
    const streaming = useIsStreaming()
    return h('button', { type: 'button', className: 'ou-btn', 'data-variant': props.variant ?? 'primary', disabled: streaming, onClick: () => trigger(props.label, undefined, props.action) }, props.label)
  },
})


const GAPS = { s: 6, m: 10, l: 16 }
const Stack = defineComponent({
  name: 'Stack', description: 'Lays out children in a column (default) or a row',
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
  name: 'Tag', description: 'A small status pill; tone neutral|accent|success|warning|danger',
  props: z.object({ label: z.string(), tone: z.enum(['neutral', 'accent', 'success', 'warning', 'danger']).optional() }),
  component: ({ props }) => h('span', { className: 'ou-tag', 'data-tone': props.tone ?? 'neutral' }, props.label),
})
const Callout = defineComponent({
  name: 'Callout', description: 'A highlighted note; tone info|success|warning|danger',
  props: z.object({ text: z.string(), tone: z.enum(['info', 'success', 'warning', 'danger']).optional(), title: z.string().optional() }),
  component: ({ props }) => h('div', { className: 'ou-callout', 'data-tone': props.tone ?? 'info' }, props.title ? h('b', null, props.title) : null, h('span', null, props.text)),
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
  name: 'TextArea', description: 'A multi-line text field bound to a $variable',
  props: z.object({ name: z.string(), placeholder: z.string().optional(), value: reactive(z.string().optional()) }),
  component: ({ props }) => {
    const field = useStateField(props.name, props.value)
    const streaming = useIsStreaming()
    return h('textarea', { className: 'ou-input ou-textarea', rows: 3, placeholder: props.placeholder, value: field.value ?? '', disabled: streaming, onChange: e => field.setValue(e.target.value) })
  },
})
const Select = defineComponent({
  name: 'Select', description: 'A dropdown of options bound to a $variable',
  props: z.object({ name: z.string(), options: z.array(z.string()), value: reactive(z.string().optional()) }),
  component: ({ props }) => {
    const field = useStateField(props.name, props.value)
    const streaming = useIsStreaming()
    return h('select', { className: 'ou-input ou-select', value: field.value ?? '', disabled: streaming, onChange: e => field.setValue(e.target.value) },
      h('option', { value: '', disabled: true }, '请选择…'), (props.options ?? []).map(o => h('option', { key: o, value: o }, o)))
  },
})
const Checkbox = defineComponent({
  name: 'Checkbox', description: 'A checkbox with a label bound to a boolean $variable',
  props: z.object({ name: z.string(), label: z.string(), value: reactive(z.boolean().optional()) }),
  component: ({ props }) => {
    const field = useStateField(props.name, props.value)
    const streaming = useIsStreaming()
    return h('label', { className: 'ou-check' }, h('input', { type: 'checkbox', checked: field.value === true, disabled: streaming, onChange: e => field.setValue(e.target.checked) }), h('span', null, props.label))
  },
})
const Choices = defineComponent({
  name: 'Choices', description: 'Quick-reply buttons; clicking one sends that option back to the assistant as the user\'s answer',
  props: z.object({ options: z.array(z.string()) }),
  component: ({ props }) => {
    const trigger = useTriggerAction()
    const streaming = useIsStreaming()
    return h('div', { className: 'ou-choices' }, (props.options ?? []).map(o => h('button', { key: o, type: 'button', className: 'ou-choice', disabled: streaming, onClick: () => trigger(o, undefined, { type: 'continue_conversation', params: { message: o } }) }, o)))
  },
})
const ButtonRow = defineComponent({
  name: 'Buttons', description: 'Puts several Button components side by side, right-aligned',
  props: z.object({ children: z.array(z.any()) }),
  component: ({ props }) => { const render = useRenderNode(); return h('div', { className: 'ou-buttons' }, render(props.children)) },
})

export const library = createLibrary({ components: [Card, CardHeader, Stack, Text, List, KeyValue, Table, Tag, Callout, Progress, Divider, Input, TextArea, Select, Checkbox, Button, ButtonRow, Choices], root: 'Card' })

// 发给模型的组件库说明（宿主把它拼进 bot 的 system prompt）。
export const libraryPrompt = () => library.prompt({ preamble: 'When structured output helps (status overviews, tables, comparisons, checklists, small forms, quick-reply choices), put it in an ```openui fenced block using only these components. Keep normal prose outside the fence. Never put secrets in a card.' })

// 把一条 bot 文本拆成 Markdown 段和 OpenUI 段。
export function splitOpenUI(text) {
  const parts = []
  const re = /```openui\n([\s\S]*?)(```|$)/g
  let last = 0
  for (let m; (m = re.exec(text));) {
    if (m.index > last) parts.push({ kind: 'md', text: text.slice(last, m.index) })
    parts.push({ kind: 'ui', text: m[1], open: m[2] === '' })
    last = re.lastIndex
  }
  if (last < text.length) parts.push({ kind: 'md', text: text.slice(last) })
  return parts.filter(p => p.text.trim() !== '')
}

export function OpenUIBlock({ source, streaming, onSend }) {
  return h('div', { className: 'ou-wrap' }, h(Renderer, {
    response: source,
    library,
    isStreaming: streaming,
    onAction: (event) => {
      if (event.type === 'continue_conversation') onSend(event.params?.message ?? event.humanFriendlyMessage ?? '')
    },
    onError: errors => { if (errors?.length) console.warn('openui', errors) },
  }))
}
