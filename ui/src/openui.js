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
  name: 'Button', description: 'A button that runs an action such as @ToAssistant(message)',
  props: z.object({ label: z.string(), action: action().optional() }),
  component: ({ props }) => {
    const trigger = useTriggerAction()
    const streaming = useIsStreaming()
    return h('button', { type: 'button', className: 'ou-btn', disabled: streaming, onClick: () => trigger(props.label, undefined, props.action) }, props.label)
  },
})

export const library = createLibrary({ components: [Card, CardHeader, Table, Input, Button], root: 'Card' })

// 发给模型的组件库说明（宿主把它拼进 bot 的 system prompt）。
export const libraryPrompt = () => library.prompt({ preamble: 'When structured output helps (tables, cards, small forms), reply with an ```openui fenced block using only these components.' })

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
