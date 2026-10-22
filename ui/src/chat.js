// 一个会话的主视图：DS Bot 的聊天行、气泡、思考行、活动行与输入栏（vendor/ds-bot/client，Apache-2.0）；
// 结构参照 DS Bot app/ui/src/chat.js。我们新写的只有工具卡、审批卡、附件和 OpenUI 段。
import { createElement as h, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bubbles, ChatRows, ThinkingRow } from '../../vendor/ds-bot/client/cells.js'
import { ComposerVoice } from '../../vendor/ds-bot/client/composer.js'
import { ArrowUpIcon, CloseIcon, PaperclipIcon, PlusIcon } from '../../vendor/ds-bot/client/icons.js'
import { useLinger } from '../../vendor/ds-bot/client/motion.js'
import { call } from './api.js'
import { OpenUIBlock, splitOpenUI } from './openui.js'
import { BOT } from './team.js'

const FOLLOW_PX = 80
const MAX_FILE = 20 * 1024 * 1024
const keepFocus = e => e.preventDefault()

function useChat(sessionId, feed) {
  const [view, setView] = useState({ items: [], loading: true, failed: false })
  const [stream, setStream] = useState(null)
  const [approvals, setApprovals] = useState([])
  const [pending, setPending] = useState([])
  const load = useCallback(async () => {
    if (!sessionId) return
    try {
      const v = await call('chat', { id: sessionId })
      setView({ items: v.items, loading: false, failed: false }); setApprovals(v.approvals)
    } catch { setView(c => ({ ...c, loading: false, failed: true })) }
  }, [sessionId])
  useEffect(() => { setView({ items: [], loading: true, failed: false }); setStream(null); setPending([]); void load() }, [load])
  useEffect(() => feed.on((event, data) => {
    if (event === 'hello') { void load(); return }
    if (data?.sessionId !== sessionId) return
    if (event === 'item') {
      setView(c => ({ ...c, items: [...c.items, data.item] }))
      if (data.item.kind === 'user') setPending(list => list.slice(1))
      if (data.item.kind === 'bot') setStream(null)
    } else if (event === 'stream') {
      if (data.phase === 'start') setStream({ id: data.attemptId, text: '', reasoning: '', at: Date.now() })
      else if (data.phase === 'end') setStream(s => (s?.id === data.attemptId ? null : s))
      else setStream(s => (s?.id === data.attemptId ? { ...s, text: s.text + (data.text ?? ''), reasoning: s.reasoning + (data.reasoning ?? '') } : s))
    } else if (event === 'approval') setApprovals(list => [...list, data])
    else if (event === 'approval-done') setApprovals(list => list.filter(a => a.id !== data.id))
    else if (event === 'status' && !data.running) setStream(null)
  }), [feed, sessionId, load])
  return { view, stream, approvals, pending, setPending, load }
}

const sizeText = n => (n == null ? '' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

function FileChips({ files, sessionId, removable, onRemove }) {
  return h('div', { className: 'dsb-files', 'data-removable': removable || undefined },
    files.map((f, i) => {
      const src = f.preview ?? (f.kind === 'image' && f.id ? `api/attachment?sid=${encodeURIComponent(sessionId)}&aid=${encodeURIComponent(f.id)}` : null)
      return h('div', { key: i, className: 'dsb-file', 'data-kind': f.kind, title: f.name },
        src ? h('img', { src, alt: f.name, className: 'dsb-file-img' }) : h('span', { className: 'dsb-file-ico' }, h(PaperclipIcon)),
        src ? null : h('span', { className: 'dsb-file-text' }, h('span', { className: 'dsb-file-name' }, f.name), h('span', { className: 'dsb-file-size' }, sizeText(f.size))),
        removable ? h('button', { type: 'button', className: 'dsb-file-x', 'aria-label': `移除 ${f.name}`, onClick: () => onRemove(i) }, h(CloseIcon)) : null)
    }))
}

function BotText({ text, streaming, onSend, roster }) {
  const parts = splitOpenUI(text)
  if (!parts.some(p => p.kind === 'ui')) return h(Bubbles, { texts: [text], roster, selfId: BOT.id, actions: {}, streaming })
  return h(Fragment, null, parts.map((p, i) => (p.kind === 'md'
    ? h(Bubbles, { key: i, texts: [p.text], roster, selfId: BOT.id, actions: {}, streaming: streaming && i === parts.length - 1 })
    : h(OpenUIBlock, { key: i, source: p.text, streaming: streaming && p.open, onSend }))))
}

function ToolCard({ item, result }) {
  let input = item.input
  try { if (typeof input === 'string') input = JSON.parse(input) } catch { /* 原样显示 */ }
  const title = input?.description ?? input?.path ?? input?.file_path ?? ''
  const detail = input?.command ? `$ ${input.command}` : JSON.stringify(input, null, 2)
  return h('details', { className: 'bt-toolcard', 'data-error': result?.error || undefined, 'data-pending': result ? undefined : '' },
    h('summary', null, h('span', { className: 'bt-toolcard-state' }, result ? (result.error ? '✕' : '✓') : '…'), h('b', null, item.name), title ? h('span', { className: 'bt-toolcard-title' }, title) : null),
    h('pre', null, `${detail}${result ? `\n\n${result.output}` : ''}`))
}

function ApprovalCard({ entry, actions }) {
  const [busy, setBusy] = useState(false)
  const answer = async (choice) => { setBusy(true); try { await actions.approve(entry.id, choice) } catch (e) { actions.reportError(e) } finally { setBusy(false) } }
  let input = entry.input
  try { if (typeof input === 'string') input = JSON.parse(input) } catch { /* */ }
  return h('div', { className: 'bt-q bt-approval', role: 'group', 'aria-label': '审批' },
    h('div', { className: 'bt-q-head' }, h('div', { className: 'bt-q-text' },
      h('p', { className: 'bt-q-title' }, entry.tool === 'bash' ? `${BOT.name} 想运行一条命令` : `${BOT.name} 想使用 ${entry.tool}`),
      h('span', { className: 'bt-q-detail' }, input?.justification ?? entry.reason ?? ''))),
    h('code', null, input?.command ?? input?.path ?? JSON.stringify(input ?? entry.tool)),
    h('div', { className: 'bt-q-foot' },
      h('button', { type: 'button', className: 'bt-q-btn', disabled: busy, onClick: () => answer('reject') }, '拒绝'),
      h('button', { type: 'button', className: 'bt-q-submit', disabled: busy, onClick: () => answer('allow') }, '允许一次')))
}

function Flow({ sessionId, items, pending, stream, approvals, roster, actions, onSend, useUi }) {
  const results = useMemo(() => Object.fromEntries(items.filter(i => i.kind === 'tool-result').map(i => [i.id, i])), [items])
  const rows = []
  let chat = []
  const flush = () => { if (chat.length) rows.push(h(ChatRows, { key: `c${rows.length}`, items: chat, sessionId, roster, actions, useUi, clock: rows.length === 0 })); chat = [] }
  items.forEach((item, i) => {
    if (item.kind === 'user') {
      if (item.files?.length) { flush(); rows.push(h('div', { key: `f${i}`, className: 'dsb-urow-files' }, h(FileChips, { files: item.files, sessionId }))) }
      if (item.text) chat.push(item)
      return
    }
    if (item.kind === 'bot' && !item.text.includes('```openui')) { chat.push(item); return }
    if (item.kind === 'tool-result') return
    flush()
    if (item.kind === 'bot') rows.push(h('div', { key: i, className: 'bt-astack dsb-ui-row' }, h(BotText, { text: item.text, onSend, roster })))
    else if (item.kind === 'reasoning') rows.push(h(ThinkingRow, { key: i, text: item.text, live: false, viewKey: `${sessionId}:r${i}` }))
    else if (item.kind === 'tool') rows.push(h('div', { key: i, className: 'dsb-row-tool' }, h(ToolCard, { item, result: results[item.id] })))
    else if (item.kind === 'error') rows.push(h('div', { key: i, className: 'dsb-error-row', role: 'alert' }, item.text, /设置/.test(item.text) ? h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => actions.openSettings('models') }, '去配置模型') : null))
    else if (item.kind === 'notice') rows.push(h('div', { key: i, className: 'bt-time-sep', role: 'separator' }, item.text))
  })
  flush()
  if (pending.length) rows.push(h('div', { key: 'pending', className: 'dsb-pending' }, pending.map((p, i) => h(Fragment, { key: i },
    p.files?.length ? h('div', { className: 'dsb-urow-files' }, h(FileChips, { files: p.files, sessionId })) : null,
    p.text ? h(ChatRows, { items: [{ kind: 'user', text: p.text, time: p.time }], sessionId, roster, actions }) : null))))
  if (stream?.reasoning && !stream.text) rows.push(h(ThinkingRow, { key: 'sr', text: stream.reasoning, live: true, at: stream.at, viewKey: `${sessionId}:live` }))
  if (stream?.text) rows.push(h('div', { key: 'st', className: 'bt-astack dsb-ui-row' }, h(BotText, { text: stream.text, streaming: true, onSend, roster })))
  for (const a of approvals) rows.push(h(ApprovalCard, { key: a.id, entry: a, actions }))
  return rows
}

// 输入栏左边的“+”：DS Bot ComposerPlus 的按钮和菜单样式（bt-plus、bt-menu），这里只有“添加文件”一项。
function PlusMenu({ onFiles }) {
  const [open, setOpen] = useState(null)
  const [shown, leaving] = useLinger(open, 120)
  const button = useRef(null)
  const menu = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const down = (e) => { if (![button.current, menu.current].some(n => n?.contains(e.target))) setOpen(null) }
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(null) } }
    window.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true) }
  }, [open])
  const toggle = () => {
    if (open) { setOpen(null); return }
    const r = button.current.getBoundingClientRect()
    setOpen({ left: r.left, bottom: window.innerHeight - r.top + 8 })
  }
  return h(Fragment, null,
    h('button', { ref: button, type: 'button', className: 'bt-plus', 'aria-label': '添加', title: '添加', 'aria-haspopup': 'menu', 'aria-expanded': Boolean(open), onMouseDown: keepFocus, onClick: toggle }, h(PlusIcon)),
    shown ? createPortal(h('div', { ref: menu, className: 'bt-menu bt-menu-up bt-plus-menu', role: 'menu', 'aria-label': '添加', style: { left: shown.left, bottom: shown.bottom }, 'data-leaving': leaving || undefined },
      h('button', { type: 'button', role: 'menuitem', onClick: () => { setOpen(null); onFiles() } }, h(PaperclipIcon), h('span', { className: 'bt-menu-label' }, '添加图片或文件'))), document.body) : null)
}

const readFile = file => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
  r.onerror = () => reject(r.error)
  r.readAsDataURL(file)
})

function Composer({ sessionId, running, onSend, onStop, actions, useUi }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [error, setError] = useState(null)
  const [drag, setDrag] = useState(false)
  const field = useRef(null)
  const picker = useRef(null)
  const inputActions = useMemo(() => ({
    captureInsertion: () => (field.current ? { start: field.current.selectionStart, end: field.current.selectionEnd } : null),
    insertText: (value, at) => setText((cur) => { const s = Math.min(at?.start ?? cur.length, cur.length); return cur.slice(0, s) + value + cur.slice(Math.max(s, at?.end ?? s)) }),
  }), [])
  useLayoutEffect(() => { const n = field.current; n.style.height = 'auto'; n.style.height = `${n.scrollHeight}px` }, [text])
  useEffect(() => { field.current?.focus(); setFiles([]); setError(null) }, [sessionId])
  const add = async (list) => {
    const next = []
    for (const file of list) {
      if (file.size > MAX_FILE) { setError(`${file.name} 超过 20 MB，发不了`); continue }
      const data = await readFile(file)
      const image = /^image\/(png|jpeg|gif|webp)$/.test(file.type)
      next.push({ kind: image ? 'image' : 'file', name: file.name, type: file.type || 'application/octet-stream', size: file.size, data, preview: image ? URL.createObjectURL(file) : null })
    }
    setFiles(cur => [...cur, ...next])
  }
  const submit = async () => {
    const value = text.trim()
    if ((value === '' && files.length === 0)) return
    setError(null); setText(''); const sending = files; setFiles([])
    try { await onSend(value, sending) } catch (failure) { setText(c => (c === '' ? value : c)); setFiles(sending); setError(failure.message) }
  }
  const empty = text.trim() === '' && files.length === 0
  return h('div', { className: 'dsb-composer-wrap' },
    error ? h('p', { className: 'dsb-composer-error', role: 'alert' }, error) : null,
    h('div', {
      className: 'dsb-composer', 'data-composer-card': '', 'data-multiline': text.includes('\n') || files.length > 0 || undefined, 'data-drag': drag || undefined,
      onDragOver: (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } },
      onDragLeave: () => setDrag(false), onDrop: (e) => { e.preventDefault(); setDrag(false); void add([...e.dataTransfer.files]) },
    },
    files.length ? h('div', { className: 'dsb-composer-files' }, h(FileChips, { files, sessionId, removable: true, onRemove: i => setFiles(cur => cur.filter((_, j) => j !== i)) })) : null,
    h('input', { ref: picker, type: 'file', multiple: true, hidden: true, onChange: (e) => { void add([...e.target.files]); e.target.value = '' } }),
    h('div', { className: 'dsb-composer-tools' }, h(PlusMenu, { onFiles: () => picker.current?.click() })),
    h('div', { className: 'dsb-composer-input', 'data-input-scroll': '' },
      h('textarea', {
        ref: field, rows: 1, value: text, placeholder: `给 ${BOT.name} 发消息`, 'aria-label': `给 ${BOT.name} 发消息`, 'data-composer-input': '',
        onChange: e => setText(e.target.value),
        onPaste: (e) => { const list = [...e.clipboardData.files]; if (list.length) { e.preventDefault(); void add(list) } },
        onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } },
      })),
    h('div', { className: 'dsb-composer-trailing' },
      h(ComposerVoice, { sessionId, inputActions, actions, useUi }),
      running && empty
        ? h('button', { type: 'button', className: 'dsb-send dsb-stop', 'aria-label': '停止', title: '停止', onClick: onStop }, h('span', { className: 'dsb-stop-sq' }))
        : h('button', { type: 'button', className: 'dsb-send', disabled: empty, 'aria-label': '发送', title: '发送', onClick: () => { void submit() } }, h(ArrowUpIcon)))))
}

export function Chat({ sessionId, team }) {
  const { actions, hooks, chat: feed } = team
  const roster = hooks.useRoster(v => v)
  const running = hooks.useSessionStatus(map => map.get(sessionId)?.running === true)
  const { view, stream, approvals, pending, setPending } = useChat(sessionId, feed)
  const scroller = useRef(null)
  const follow = useRef(true)
  useLayoutEffect(() => { const n = scroller.current; if (n && follow.current) n.scrollTop = n.scrollHeight }, [view.items, stream, approvals, pending, running])
  useEffect(() => { follow.current = true }, [sessionId])
  const onScroll = () => { const n = scroller.current; follow.current = n.scrollHeight - n.scrollTop - n.clientHeight < FOLLOW_PX }
  const send = async (text, files = []) => {
    follow.current = true
    const entry = { text, files: files.map(({ data, ...f }) => f), time: Date.now() }
    setPending(list => [...list, entry])
    try { await actions.send(sessionId, text, files.map(({ name, type, data }) => ({ name, type, data }))) } catch (e) { setPending(list => list.filter(x => x !== entry)); throw e }
  }
  const empty = !view.loading && view.items.length === 0 && pending.length === 0
  return h('div', { className: 'dsb-chat' },
    h('div', { ref: scroller, className: 'dsb-scroll', 'data-conversation-scroll': '', onScroll },
      h('div', { className: 'dsb-column' },
        empty ? h(Welcome, { onPick: text => void send(text).catch(actions.reportError) }) : null,
        h('div', { className: 'dsb-flow', 'data-chat-flow': '', role: 'feed', 'aria-busy': view.loading },
          h(Flow, { sessionId, items: view.items, pending, stream, approvals, roster, actions, useUi: hooks.useUi, onSend: t => void send(t).catch(actions.reportError) }),
          // DS Bot 的活动行（头部胶囊里的 ActivityIndicator）画在这里。
          h('div', { 'data-chat-running': '' })))),
    h('div', { className: 'dsb-composer-root' },
      h(Composer, { sessionId, running, onSend: send, onStop: () => void actions.cancel(sessionId).catch(actions.reportError), actions, useUi: hooks.useUi })))
}

function Welcome({ onPick }) {
  const picks = ['你能做什么？', '看看工作目录里有哪些文件', '给我一张本周任务卡片']
  return h('div', { className: 'dsb-welcome' },
    h('div', { className: 'dsb-welcome-title' }, `和 ${BOT.name} 聊点什么`),
    h('div', { className: 'dsb-welcome-picks' }, picks.map(p => h('button', { key: p, type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => onPick(p) }, p))))
}
