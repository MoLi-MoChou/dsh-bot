// 单 bot 界面。框架、聊天行、气泡、思考行、输入栏都用 DS Bot 原有的组件和类名
// （vendor/ds-bot/client，Apache-2.0）；结构参照 DS Bot app/ui/src/app.js 与 chat.js。
import { createElement as h, Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Bubbles, ChatRows, ThinkingRow, Shimmer } from '../../vendor/ds-bot/client/cells.js'
import { ArrowUpIcon, SearchIcon, PlusIcon } from '../../vendor/ds-bot/client/icons.js'
import { BotAvatar } from '../../vendor/ds-bot/client/mark.js'
import { allThemes, themeCss } from '../../vendor/ds-bot/client/themes.js'
import { call, openFeed } from './api.js'
import { OpenUIBlock, splitOpenUI } from './openui.js'

const BOT = { id: 'bot', name: 'DSH Bot', color: 'blue', role: '助手' }
const noop = () => {}
const ACTIONS = new Proxy({}, { get: () => noop })

function useTheme() {
  useEffect(() => {
    const dark = new URLSearchParams(location.search).get('theme') === 'dark'
    const style = document.createElement('style')
    style.textContent = themeCss(allThemes().deepseek)
    document.head.append(style)
    if (dark) document.documentElement.classList.add('dark')
    return () => style.remove()
  }, [])
}

function useBot() {
  const [items, setItems] = useState([])
  const [stream, setStream] = useState(null)
  const [approvals, setApprovals] = useState([])
  const [running, setRunning] = useState(false)
  useEffect(() => {
    const load = () => call('chat').then(v => { setItems(v.items); setApprovals(v.approvals) }).catch(noop)
    return openFeed((event, data) => {
      if (event === 'hello') load()
      else if (event === 'item') { setItems(list => [...list, data]); if (data.kind === 'bot') setStream(null) }
      else if (event === 'stream') {
        if (data.phase === 'start') setStream({ id: data.attemptId, text: '', reasoning: '', at: Date.now() })
        else if (data.phase === 'end') setStream(s => (s?.id === data.attemptId ? null : s))
        else setStream(s => (s?.id === data.attemptId ? { ...s, text: s.text + (data.text ?? ''), reasoning: s.reasoning + (data.reasoning ?? '') } : s))
      } else if (event === 'status') setRunning(data.status === 'running')
      else if (event === 'approval') setApprovals(list => [...list, data])
      else if (event === 'approval-done') setApprovals(list => list.filter(a => a.id !== data.id))
    })
  }, [])
  return { items, stream, approvals, running }
}

const roster = { byId: { bot: BOT }, bots: [BOT], roomsById: {}, questions: {} }

// 一条 bot 文本：Markdown 段用 DS Bot 的气泡，OpenUI 段用 OpenUI Renderer。
function BotText({ text, streaming, onSend, k }) {
  const parts = splitOpenUI(text)
  if (!parts.some(p => p.kind === 'ui')) return h(Bubbles, { key: k, texts: [text], roster, selfId: BOT.id, actions: ACTIONS, streaming })
  return h(Fragment, { key: k }, parts.map((p, i) => p.kind === 'md'
    ? h(Bubbles, { key: i, texts: [p.text], roster, selfId: BOT.id, actions: ACTIONS, streaming: streaming && i === parts.length - 1 })
    : h(OpenUIBlock, { key: i, source: p.text, streaming: streaming && p.open, onSend })))
}

function ToolCard({ item, result }) {
  let input = item.input
  try { if (typeof input === 'string') input = JSON.parse(input) } catch { /* 原样显示 */ }
  const title = input?.description ?? item.name
  const detail = input?.command ?? JSON.stringify(input, null, 2)
  return h('details', { className: 'bt-toolcard', 'data-error': result?.error || undefined },
    h('summary', null, h('span', null, result ? (result.error ? '✕' : '✓') : '…'), h('b', null, item.name), h('span', null, title)),
    h('pre', null, `$ ${detail}${result ? `\n\n${result.output}` : ''}`))
}

function ApprovalCard({ entry }) {
  const [busy, setBusy] = useState(false)
  const answer = async (choice) => { setBusy(true); try { await call('approve', { id: entry.id, choice }) } finally { setBusy(false) } }
  let input = entry.input
  try { if (typeof input === 'string') input = JSON.parse(input) } catch { /* */ }
  return h('div', { className: 'bt-q bt-approval', role: 'group' },
    h('div', { className: 'bt-q-head' }, h('div', { className: 'bt-q-text' },
      h('p', { className: 'bt-q-title' }, `${BOT.name} 想运行一条命令`),
      h('span', { className: 'bt-q-detail' }, input?.justification ?? entry.reason ?? ''))),
    h('code', null, input?.command ?? entry.tool),
    h('div', { className: 'bt-q-foot' },
      h('button', { type: 'button', className: 'bt-q-btn', disabled: busy, onClick: () => answer('reject') }, '拒绝'),
      h('button', { type: 'button', className: 'bt-q-submit', disabled: busy, onClick: () => answer('allow') }, '允许一次')))
}

function Flow({ items, stream, approvals, running, onSend }) {
  const results = useMemo(() => Object.fromEntries(items.filter(i => i.kind === 'tool-result').map(i => [i.id, i])), [items])
  const rows = []
  let chat = []
  const flush = () => { if (chat.length) rows.push(h(ChatRows, { key: `c${rows.length}`, items: chat, sessionId: BOT.id, roster, actions: ACTIONS, clock: rows.length === 0 })); chat = [] }
  items.forEach((item, i) => {
    if (item.kind === 'user') { chat.push(item); return }
    if (item.kind === 'bot' && !item.text.includes('```openui')) { chat.push(item); return }
    flush()
    if (item.kind === 'bot') rows.push(h(BotText, { key: i, k: i, text: item.text, onSend }))
    else if (item.kind === 'reasoning') rows.push(h(ThinkingRow, { key: i, text: item.text, live: false, viewKey: `r${i}` }))
    else if (item.kind === 'tool') rows.push(h('div', { key: i, className: 'dsb-row-tool' }, h(ToolCard, { item, result: results[item.id] })))
  })
  flush()
  if (stream?.reasoning && !stream.text) rows.push(h(ThinkingRow, { key: 'sr', text: stream.reasoning, live: true, at: stream.at, viewKey: 'live' }))
  if (stream?.text) rows.push(h(BotText, { key: 'st', k: 'st', text: stream.text, streaming: true, onSend }))
  for (const a of approvals) rows.push(h(ApprovalCard, { key: a.id, entry: a }))
  if (running && !stream && approvals.length === 0) rows.push(h(Shimmer, { key: 'busy' }, `${BOT.name} 正在处理…`))
  return rows
}

function Composer({ onSend, disabled }) {
  const [text, setText] = useState('')
  const field = useRef(null)
  useLayoutEffect(() => { const n = field.current; n.style.height = 'auto'; n.style.height = `${n.scrollHeight}px` }, [text])
  const submit = () => { const v = text.trim(); if (!v) return; setText(''); void onSend(v) }
  return h('div', { className: 'dsb-composer-wrap' },
    h('div', { className: 'dsb-composer', 'data-composer-card': '' },
      h('div', { className: 'dsb-composer-input', 'data-input-scroll': '' },
        h('textarea', { ref: field, rows: 1, value: text, placeholder: `给 ${BOT.name} 发消息`, 'data-composer-input': '', onChange: e => setText(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } } })),
      h('div', { className: 'dsb-composer-trailing' },
        h('button', { type: 'button', className: 'dsb-send', disabled: disabled || !text.trim(), 'aria-label': '发送', onClick: submit }, h(ArrowUpIcon)))))
}

export function App() {
  useTheme()
  const bot = useBot()
  const scroller = useRef(null)
  useLayoutEffect(() => { const n = scroller.current; if (n) n.scrollTop = n.scrollHeight }, [bot.items, bot.stream, bot.approvals])
  const send = text => call('send', { text })
  const last = [...bot.items].reverse().find(i => i.kind === 'bot')?.text ?? ''
  const state = bot.running ? 'working' : 'idle'
  return h('div', { className: 'dsb-frame' },
    h('aside', { className: 'dsb-side' },
      h('div', { className: 'dsb-band' }),
      h('div', { className: 'dsb-side-list' },
        h('div', { className: 'bt-side-top' },
          h('span', { className: 'bt-brand' }, h('b', null, 'DSH Bot')),
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', className: 'bt-round', 'aria-label': '搜索' }, h(SearchIcon)),
          h('button', { type: 'button', className: 'bt-round', 'aria-label': '新对话', onClick: () => call('reset', {}).then(() => location.reload()) }, h(PlusIcon))),
        h('div', { className: 'bt-list' },
          h('button', { type: 'button', className: 'bt-row', 'aria-current': 'page', 'data-bot-id': BOT.id },
            h(BotAvatar, { bot: BOT, size: 36, state, main: true }),
            h('span', { className: 'bt-row-body' }, h('span', { className: 'bt-row-name' }, BOT.name), h('span', { className: 'bt-row-preview' }, last.replace(/```[\s\S]*?(```|$)/g, '[卡片]').slice(0, 60))))))),
    h('main', { className: 'dsb-main dsb_centerCol' },
      h('div', { className: 'dsb-band' }),
      h('div', { className: 'dsb-head' }, h('div', { className: 'bt-head' },
        h('button', { type: 'button', className: 'bt-pill' }, h(BotAvatar, { bot: BOT, size: 24, state, badge: false }), h('span', { className: 'bt-pill-name' }, BOT.name)))),
      h('div', { className: 'dsb-chat' },
        h('div', { ref: scroller, className: 'dsb-scroll', 'data-conversation-scroll': '' },
          h('div', { className: 'dsb-column' }, h('div', { className: 'dsb-flow', role: 'feed' }, h(Flow, { ...bot, onSend: send })))),
        h('div', { className: 'dsb-composer-root' }, h(Composer, { onSend: send, disabled: false })))))
}
