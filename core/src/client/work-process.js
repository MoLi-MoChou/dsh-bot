// Moon Bot patch: a finished turn's thinking and tool steps stay out of the chat. One
// quiet line ("已工作 12s · 5 步") stands where DS Bot drew its thinking row; clicking it
// opens a side panel with the whole process in the user's words: what it thought about,
// what it read, searched and ran. The tool's own name, its arguments and its output sit
// behind one "Details" fold.
import { createElement as h, Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { contentText, toolName, toolArgs, elapsedLabel } from './text.js'
import { callTree } from './cells.js'
import { t } from './i18n.js'
import { useTurnRetries } from './retry-cell.js'
import { framerMotion } from './vendor/framer-motion.js'

// Steps carry no seq; both carry the time they began, which orders them.
const seqOf = item => item?.time ?? item?.root?.time ?? item?.finalNode?.seq ?? item?.seq ?? item?.root?.seq ?? 0

// Every call of the turn, sub-calls included, in the order they ran.
export function turnCalls(tools) {
  const calls = []
  for (const node of [...(tools ?? [])].sort((a, b) => seqOf(a) - seqOf(b))) {
    if (node?.root) calls.push(...callTree(node.root).map(call => ({ call, seq: seqOf(node) })))
  }
  return calls
}

export function processCount(steps, tools) {
  const thoughts = (steps ?? []).filter(step => (step?.blocks ?? []).some(block => block?.kind === 'reasoning' && String(block.text ?? '').trim() !== '')).length
  return thoughts + turnCalls(tools).length
}

const baseName = value => String(value ?? '').split(/[\\/]/).pop()
const siteOf = (value) => {
  try { return new URL(String(value)).host } catch { return String(value ?? '').slice(0, 60) }
}
const firstLine = (value, length = 60) => String(value ?? '').split('\n')[0].slice(0, length)

const PAGE_TOOLS = new Set(['web_fetch', 'read_page', 'browse', 'browser_read'])

// What one tool call did, in the user's words: "读了 report.md", "搜了「moon bot」".
// `action` groups calls that read alike; `target` names what the call touched, when it
// names anything at all.
export function toolStory(call) {
  const name = (toolName(call) ?? '').toLowerCase()
  const args = toolArgs(call)
  const arg = (...keys) => keys.map(key => args.text(key)).find(value => typeof value === 'string' && value !== '') ?? ''
  const done = call.kind === 'tool-result'
  const story = (action, target, running, finished, params) => ({ action, target, text: t(done ? finished : running, params) })
  if (name === 'read') return story('read', arg('path', 'file', 'file_path'), 'Reading {name}', 'Read {name}', { name: baseName(arg('path', 'file', 'file_path')) })
  if (name === 'read_image') return story('read-image', arg('path', 'file'), 'Looking at {name}', 'Looked at {name}', { name: baseName(arg('path', 'file')) })
  if (name === 'write') return story('write', arg('path', 'file', 'file_path'), 'Writing {name}', 'Wrote {name}', { name: baseName(arg('path', 'file', 'file_path')) })
  if (name === 'edit' || name === 'apply_patch') return story('edit', arg('path', 'file', 'file_path'), 'Editing {name}', 'Edited {name}', { name: baseName(arg('path', 'file', 'file_path')) })
  if (name === 'grep' || name === 'glob' || name.endsWith('_inspect')) return story('search-files', arg('pattern', 'query'), 'Looking through the files', 'Looked through the files', {})
  if (['bash', 'pwsh', 'exec_command', 'write_stdin'].includes(name) || name.startsWith('terminal_')) {
    const command = firstLine(arg('command', 'cmd'))
    return command
      ? story('command', command, 'Running {command}', 'Ran {command}', { command })
      : story('command', '', 'Running a command', 'Ran a command', {})
  }
  if (name === 'run_code') return story('code', '', 'Running code', 'Ran code', {})
  if (name === 'web_search') {
    const query = firstLine(arg('query', 'q'), 48)
    return query ? story('search-web', query, 'Searching for {query}', 'Searched for {query}', { query }) : story('search-web', '', 'Searching the web', 'Searched the web', {})
  }
  if (PAGE_TOOLS.has(name)) {
    const url = arg('url', 'href')
    return url ? story('page', url, 'Opening {site}', 'Opened {site}', { site: siteOf(url) }) : story('page', '', 'Opening a page', 'Opened a page', {})
  }
  if (name === 'subagent' || name.startsWith('subagent_')) return story('subagent', '', 'Handing work to a helper', 'Handed work to a helper', {})
  if (['todo_write', 'create_goal', 'update_goal', 'get_goal'].includes(name)) return story('plan', '', 'Tidying the plan', 'Tidied the plan', {})
  if (name === 'ask_user_question' || name === 'request_user_input' || name === 'ask_user') return story('question', '', 'Asking you a question', 'Asked you a question', {})
  if (name === 'message_bot' || name === 'send_message') {
    const to = arg('to', 'bot', 'name')
    return to ? story('message', to, 'Messaging {name}', 'Messaged {name}', { name: to }) : story('message', '', 'Messaging a teammate', 'Messaged a teammate', {})
  }
  if (name === 'present') return story('present', '', 'Gathering the files', 'Gathered the files', {})
  const label = toolName(call) ?? ''
  return label ? story('tool', label, 'Using {tool}', 'Used {tool}', { tool: label }) : story('tool', '', 'Working on it', 'Worked on it', {})
}

// Consecutive page visits read as one line: "看了 3 个网页".
function mergePages(rows) {
  const out = []
  for (const row of rows) {
    const last = out.at(-1)
    if (row.kind === 'tool' && row.action === 'page' && row.done && last?.kind === 'tool' && last.action === 'page' && last.done) {
      last.pages = (last.pages ?? 1) + 1
      last.text = t('Looked at {count} pages', { count: last.pages })
      continue
    }
    out.push({ ...row, pages: row.kind === 'tool' && row.action === 'page' && row.done ? 1 : undefined })
  }
  return out
}

// One line per step, for the fold under the work line.
function summaryRows(steps, tools, retries) {
  const rows = []
  for (const step of steps ?? []) {
    for (const block of step?.blocks ?? []) {
      const text = String(block?.text ?? '').trim()
      if (block?.kind === 'reasoning' && text) rows.push({ seq: seqOf(step), kind: 'reasoning', text: text.split('\n')[0].slice(0, 90) })
    }
  }
  turnCalls(tools).forEach(({ call, seq }, index) => {
    const story = toolStory(call)
    rows.push({ seq: seq + 0.5 + index / 1000, kind: 'tool', text: story.text, action: story.action, done: call.kind === 'tool-result', failed: call.kind === 'tool-result' && call.isError })
  })
  for (const retry of retries) rows.push({ seq: retry.seq, kind: 'retry', text: `${t('Retried')} ${retry.retry}/${retry.maximum}` })
  return mergePages(rows.sort((a, b) => a.seq - b.seq))
}

export function WorkLine({ steps, tools, ms, sessionId, turn }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const retries = useTurnRetries(sessionId, turn)
  const count = processCount(steps, tools) + retries.length
  if (count === 0) return null
  const label = ms !== undefined && ms >= 1000
    ? t('Worked for {time} · {count} steps', { time: elapsedLabel(ms), count })
    : t('{count} steps', { count })
  const rows = expanded ? summaryRows(steps, tools, retries) : []
  return h(Fragment, null,
    h('button', { type: 'button', className: 'bt-work-line', 'aria-expanded': expanded, onClick: () => setExpanded(value => !value) },
      h('span', null, label), h('span', { 'aria-hidden': true, className: 'bt-work-chev' }, '›')),
    h('div', { className: 'bt-work-fold', 'data-open': expanded || undefined, 'aria-hidden': !expanded },
      h('div', { className: 'bt-work-fold-in' },
        h('ol', { className: 'bt-work-steps' }, rows.map((row, index) => h('li', { key: index, 'data-kind': row.kind, 'data-failed': row.failed || undefined },
          h('span', { className: 'bt-work-text' }, row.text)))),
        h('button', { type: 'button', className: 'bt-work-all', tabIndex: expanded ? 0 : -1, 'aria-haspopup': 'dialog', onClick: () => setOpen(true) }, t('Full process')))),
    h(framerMotion()?.AnimatePresence ?? Fragment, null, open ? h(ProcessPanel, { key: 'panel', steps, tools, retries, label, onClose: () => setOpen(false) }) : null))
}

function pretty(raw) {
  if (raw === undefined || raw === null || raw === '') return ''
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return String(raw) }
}

const PANEL_SPRING = { type: 'spring', stiffness: 420, damping: 38 }

function ProcessPanel({ steps, tools, retries = [], label, onClose }) {
  useEffect(() => {
    const key = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const items = []
  for (const step of steps ?? []) {
    for (const [index, block] of (step?.blocks ?? []).entries()) {
      const text = String(block?.text ?? '').trim()
      if (text === '' || (block.kind !== 'reasoning' && block.kind !== 'text')) continue
      items.push({ seq: seqOf(step) + index / 100, key: `s${seqOf(step)}:${index}`, kind: block.kind, text })
    }
  }
  turnCalls(tools).forEach(({ call, seq }, index) => items.push({ seq: seq + 0.5 + index / 1000, key: `c${call.callId ?? index}`, kind: 'tool', call }))
  for (const retry of retries) items.push({ seq: retry.seq, key: `r${retry.seq}`, kind: 'retry', retry })
  items.sort((a, b) => a.seq - b.seq)
  const motion = framerMotion()?.motion ?? { div: 'div', aside: 'aside' }
  const moving = typeof motion.div !== 'string'
  const anim = props => (moving ? props : {})
  return createPortal(h(motion.div, { className: 'bt-process-scrim', ...anim({ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }), onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() } },
    h(motion.aside, { className: 'bt-process', role: 'dialog', 'aria-label': t('Work process'), ...anim({ initial: { x: 48, opacity: 0.6 }, animate: { x: 0, opacity: 1 }, exit: { x: 48, opacity: 0 }, transition: PANEL_SPRING }) },
      h('header', null,
        h('div', null, h('strong', null, t('Work process')), h('span', null, label)),
        h('button', { type: 'button', className: 'bt-process-close', 'aria-label': t('Close'), onClick: onClose }, '×')),
      h('ol', null, items.map(item => h('li', { key: item.key, 'data-kind': item.kind },
        item.kind === 'tool' ? h(ToolItem, { call: item.call })
          : item.kind === 'retry' ? h(Fragment, null,
            h('div', { className: 'bt-process-tag' }, t('Retried a request'), ' · ', item.retry.cancelled ? t('Retry cancelled') : `${item.retry.retry}/${item.retry.maximum}`),
            item.retry.failure ? h('div', { className: 'bt-process-text' }, item.retry.failure) : null)
          : item.kind === 'reasoning' ? h(Fragment, null,
            h('div', { className: 'bt-process-tag' }, t('Thought it through')),
            h('div', { className: 'bt-process-text' }, item.text))
            // A reply is already in the chat; here it is one line that opens.
            : h('details', null, h('summary', { className: 'bt-process-reply' }, h('span', { className: 'bt-process-tag' }, t('Reply'), ' · '), item.text.slice(0, 60) + (item.text.length > 60 ? '…' : '')),
              h('div', { className: 'bt-process-text' }, item.text))))))), document.body)
}

function ToolItem({ call }) {
  const done = call.kind === 'tool-result'
  const story = toolStory(call)
  const args = pretty(call.argsRaw ?? call.call?.argsRaw)
  const output = done ? contentText(call.content) : ''
  return h(Fragment, null,
    h('div', { className: 'bt-process-tag' }, story.text,
      done ? (call.isError ? h('span', { className: 'bt-process-err' }, ` · ${t('Failed')}`) : null) : ` · ${t('Running')}`),
    h('details', { className: 'bt-process-details' },
      h('summary', null, t('Details')),
      h('div', { className: 'bt-process-tool' }, h('span', null, t('Action')), h('code', null, toolName(call) ?? '?')),
      args ? h('div', { className: 'bt-process-block' }, h('div', { className: 'bt-process-label' }, t('Arguments')), h('pre', null, args)) : null,
      output ? h('div', { className: 'bt-process-block' }, h('div', { className: 'bt-process-label' }, t('Result')), h('pre', null, output)) : null))
}

export const PROCESS_CSS = `
.bt-work-line{display:inline-flex;align-items:center;gap:4px;margin:2px 0 6px;padding:2px 0;border:0;background:none;color:var(--bt-ink-3);font:inherit;font-size:13px;cursor:pointer}
.bt-work-line:hover{color:var(--bt-ink-2)}
.bt-work-chev{font-size:14px;line-height:1;transition:transform .2s ease}
.bt-work-line[aria-expanded=true] .bt-work-chev{transform:rotate(90deg)}
.bt-work-fold{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .28s cubic-bezier(.2,.8,.2,1),opacity .2s ease}
.bt-work-fold[data-open]{grid-template-rows:1fr;opacity:1}
.bt-work-fold-in{overflow:hidden;min-height:0}
.bt-work-steps{list-style:none;margin:0 0 6px;padding:2px 0 2px 10px;border-left:.5px solid var(--bt-line-2);display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:var(--bt-ink-2)}
.bt-work-steps li{display:flex;align-items:baseline;gap:8px;min-width:0}
.bt-work-steps li::before{content:'';flex:none;width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.4;translate:0 -2px}
.bt-work-steps li[data-kind=reasoning]::before{opacity:.25}
.bt-work-steps li[data-failed]{color:var(--bt-danger)}
.bt-work-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-work-all{margin:0 0 8px 10px;padding:2px 8px;border:.5px solid var(--bt-line-2);border-radius:999px;background:none;color:var(--bt-ink-2);font:inherit;font-size:12px;cursor:pointer}
.bt-work-all:hover{background:var(--bt-hover)}
@media (prefers-reduced-motion:reduce){.bt-work-fold,.bt-work-chev{transition:none}}
.bt-process-scrim{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.18);display:flex;justify-content:flex-end}
.bt-process{width:min(480px,92vw);height:100%;display:flex;flex-direction:column;background:var(--bt-main);color:var(--bt-ink);box-shadow:-8px 0 32px rgba(0,0,0,.14);font-size:14px}
.bt-process header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--bt-line-2)}
.bt-process header div{display:flex;flex-direction:column;gap:2px}
.bt-process header span{font-size:12px;color:var(--bt-ink-3)}
.bt-process-close{border:0;background:none;font-size:22px;line-height:1;color:inherit;cursor:pointer;padding:4px 8px;border-radius:6px}
.bt-process-close:hover{background:var(--bt-hover)}
.bt-process ol{list-style:none;margin:0;padding:12px 20px 24px;overflow:auto;flex:1}
.bt-process li{padding:10px 0;border-bottom:1px dashed var(--bt-line-2)}
.bt-process-tag{font-size:12.5px;color:var(--bt-ink-2);margin-bottom:4px}
.bt-process-tag code{font-size:12px}
.bt-process-err{color:var(--bt-danger)}
.bt-process-reply{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-process-text{white-space:pre-wrap;line-height:1.6}
.bt-process li[data-kind=reasoning] .bt-process-text{color:var(--bt-ink-2)}
.bt-process details summary{cursor:pointer;font-size:12px;color:var(--bt-ink-3);margin:4px 0}
.bt-process-tool{display:flex;align-items:baseline;gap:8px;font-size:12px;color:var(--bt-ink-3);margin:2px 0 6px}
.bt-process-tool span{min-width:32px}
.bt-process-tool code{font-size:12px;color:var(--bt-ink-2)}
.bt-process-block{margin:6px 0 2px}
.bt-process-label{font-size:11.5px;color:var(--bt-ink-3);margin-bottom:2px}
.bt-process pre{margin:4px 0 0;padding:8px 10px;max-height:320px;overflow:auto;border-radius:8px;background:var(--bt-hover);font-size:12px;white-space:pre-wrap;word-break:break-word}
`
