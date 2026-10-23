// Moon Bot patch: a finished turn's thinking and tool steps stay out of the chat. One
// quiet line ("已工作 12s · 5 步") stands where DS Bot drew its thinking row; clicking it
// opens a side panel with the whole process: thinking, tool calls with their
// arguments, and their outputs, in order.
import { createElement as h, Fragment, useState } from 'react'
import { createPortal } from 'react-dom'
import { contentText, toolName, elapsedLabel } from './text.ts'
import { callTree } from './cells.js'
import { t } from './i18n.js'
import { EASE_PANEL, PANEL_LINGER_MS, SPRING_SHAPE } from './motion.js'
import { useTurnRetries } from './retry-cell.js'
import { useEscape } from './overlay-hooks.ts'
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

// One line per step, for the fold under the work line.
function summaryRows(steps, tools, retries) {
  const rows = []
  for (const step of steps ?? []) {
    for (const block of step?.blocks ?? []) {
      const text = String(block?.text ?? '').trim()
      if (block?.kind === 'reasoning' && text) rows.push({ seq: seqOf(step), kind: 'reasoning', text: text.split('\n')[0].slice(0, 90) })
    }
  }
  turnCalls(tools).forEach(({ call, seq }, index) => rows.push({ seq: seq + 0.5 + index / 1000, kind: 'tool', text: toolName(call) ?? '?', failed: call.kind === 'tool-result' && call.isError }))
  for (const retry of retries) rows.push({ seq: retry.seq, kind: 'retry', text: `${t('Retried')} ${retry.retry}/${retry.maximum}` })
  return rows.sort((a, b) => a.seq - b.seq)
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
          h('span', { className: 'bt-work-kind' }, row.kind === 'tool' ? t('Tool') : row.kind === 'retry' ? t('Model retry') : t('Thinking')),
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
  useEscape(onClose)
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
            h('div', { className: 'bt-process-tag' }, t('Model retry'), ' · ', item.retry.cancelled ? t('Retry cancelled') : `${t('Retried')} ${item.retry.retry}/${item.retry.maximum}`),
            item.retry.failure ? h('div', { className: 'bt-process-text' }, item.retry.failure) : null)
          : item.kind === 'reasoning' ? h(Fragment, null,
            h('div', { className: 'bt-process-tag' }, t('Thinking')),
            h('div', { className: 'bt-process-text' }, item.text))
            // A reply is already in the chat; here it is one line that opens.
            : h('details', null, h('summary', { className: 'bt-process-reply' }, h('span', { className: 'bt-process-tag' }, t('Reply'), ' · '), item.text.slice(0, 60) + (item.text.length > 60 ? '…' : '')),
              h('div', { className: 'bt-process-text' }, item.text))))))), document.body)
}

function ToolItem({ call }) {
  const done = call.kind === 'tool-result'
  const args = pretty(call.argsRaw ?? call.call?.argsRaw)
  const output = done ? contentText(call.content) : ''
  return h(Fragment, null,
    h('div', { className: 'bt-process-tag' }, t('Tool'), ' · ', h('code', null, toolName(call) ?? '?'),
      done ? (call.isError ? h('span', { className: 'bt-process-err' }, ` · ${t('Failed')}`) : null) : ` · ${t('Running')}`),
    args ? h('details', null, h('summary', null, t('Input')), h('pre', null, args)) : null,
    output ? h('details', { open: output.length < 600 }, h('summary', null, t('Output')), h('pre', null, output)) : null)
}

export const PROCESS_CSS = `
.bt-work-line{display:inline-flex;align-items:center;gap:4px;margin:2px 0 6px;padding:2px 0;border:0;background:none;color:var(--bt-ink-3);font:inherit;font-size:13px;cursor:pointer}
.bt-work-line:hover{color:var(--bt-ink-2)}
.bt-work-chev{font-size:14px;line-height:1;transition:transform .2s ease}
.bt-work-line[aria-expanded=true] .bt-work-chev{transform:rotate(90deg)}
.bt-work-fold{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows ${SPRING_SHAPE.duration}ms ${SPRING_SHAPE.easing},opacity .2s ease}
.bt-work-fold[data-open]{grid-template-rows:1fr;opacity:1}
.bt-work-fold-in{overflow:hidden;min-height:0}
.bt-work-steps{list-style:none;margin:0 0 6px;padding:2px 0 2px 10px;border-left:.5px solid var(--bt-line-2);display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:var(--bt-ink-2)}
.bt-work-steps li{display:flex;align-items:baseline;gap:8px;min-width:0}
.bt-work-kind{flex:none;color:var(--bt-ink-3)}
.bt-work-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-work-steps li[data-kind=tool] .bt-work-text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.bt-work-steps li[data-failed] .bt-work-text{color:var(--bt-danger)}
.bt-work-all{margin:0 0 8px 10px;padding:2px 8px;border:.5px solid var(--bt-line-2);border-radius:999px;background:none;color:var(--bt-ink-2);font:inherit;font-size:12px;cursor:pointer}
.bt-work-all:hover{background:var(--bt-hover)}
.bt-process-scrim{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.18);display:flex;justify-content:flex-end;animation:bt-fade .18s ease-out}
.bt-process{width:min(480px,92vw);height:100%;display:flex;flex-direction:column;background:var(--bt-main);color:var(--bt-ink);box-shadow:-8px 0 32px rgba(0,0,0,.14);font-size:14px;animation:bt-pane-in ${PANEL_LINGER_MS}ms ${EASE_PANEL}}
@media (prefers-reduced-motion:reduce){.bt-work-fold,.bt-work-chev{transition:none}.bt-process-scrim,.bt-process{animation:none}}
.bt-process header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--bt-line-2)}
.bt-process header div{display:flex;flex-direction:column;gap:2px}
.bt-process header span{font-size:12px;color:var(--bt-ink-3)}
.bt-process-close{border:0;background:none;font-size:22px;line-height:1;color:inherit;cursor:pointer;padding:4px 8px;border-radius:6px}
.bt-process-close:hover{background:var(--bt-hover)}
.bt-process ol{list-style:none;margin:0;padding:12px 20px 24px;overflow:auto;flex:1}
.bt-process li{padding:10px 0;border-bottom:1px dashed var(--bt-line-2)}
.bt-process-tag{font-size:12px;color:var(--bt-ink-3);margin-bottom:4px}
.bt-process-tag code{font-size:12px}
.bt-process-err{color:var(--bt-danger)}
.bt-process-reply{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-process-text{white-space:pre-wrap;line-height:1.6}
.bt-process li[data-kind=reasoning] .bt-process-text{color:var(--bt-ink-2)}
.bt-process details summary{cursor:pointer;font-size:12px;color:var(--bt-ink-2);margin:4px 0}
.bt-process pre{margin:4px 0 0;padding:8px 10px;max-height:320px;overflow:auto;border-radius:8px;background:var(--bt-hover);font-size:12px;white-space:pre-wrap;word-break:break-word}
:is(.bt-work-line,.bt-work-all,.bt-process-close,.bt-process details summary):focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
`
