// 侧栏：DS Bot 侧栏的结构与类名（bt-side、bt-side-top、主 bot 方块 bt-tile、会话行 bt-agent-sub-row、
// 底部设置头像），列出的是这个 bot 的会话。改写自 DS Bot ds-bot/src/client/sidebar.js（Apache-2.0）。
import { createElement as h, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrandMark, YouAvatar } from '../../vendor/ds-bot/client/sidebar.js'
import { BotAvatar } from '../../vendor/ds-bot/client/mark.js'
import { CloseIcon, PlusIcon, SearchIcon, TrashIcon } from '../../vendor/ds-bot/client/icons.js'
import { relativeShort } from '../../vendor/ds-bot/client/text.js'
import { useLinger } from '../../vendor/ds-bot/client/motion.js'
import { BOT } from './team.js'

function RowMenu({ menu, onClose, onRename, onDelete }) {
  const box = useRef(null)
  const [shown, leaving] = useLinger(menu, 120)
  useEffect(() => {
    if (!menu) return undefined
    const down = (e) => { if (!box.current?.contains(e.target)) onClose() }
    const key = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true) }
  }, [menu])
  if (!shown) return null
  return createPortal(h('div', { ref: box, className: 'bt-menu bt-plus-menu', role: 'menu', style: { left: shown.x, top: shown.y }, 'data-leaving': leaving || undefined },
    h('button', { type: 'button', role: 'menuitem', onClick: () => { onClose(); onRename(shown.id) } }, h('span', { className: 'bt-menu-label' }, '重命名')),
    h('button', { type: 'button', role: 'menuitem', className: 'bt-menu-danger', onClick: () => { onClose(); onDelete(shown.id) } }, h(TrashIcon), h('span', { className: 'bt-menu-label' }, '删除对话'))), document.body)
}

function ConvRow({ row, active, running, unread, renaming, index, actions, onMenu, onDone }) {
  const input = useRef(null)
  useLayoutEffect(() => { if (renaming) { input.current?.focus(); input.current?.select() } }, [renaming])
  if (renaming) {
    const commit = (keep) => {
      const value = input.current?.value.trim() ?? ''
      onDone()
      if (keep && value && value !== row.title) void actions.rename(row.id, value).catch(actions.reportError)
    }
    return h('div', { className: 'bt-agent-sub-row bt-agent-edit' },
      h('input', { ref: input, defaultValue: row.title, 'aria-label': '重命名', onBlur: () => commit(true),
        onKeyDown: (e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false) } }))
  }
  return h('button', {
    type: 'button', className: 'bt-agent-sub-row dsb-conv', 'aria-current': active ? 'page' : undefined, style: { '--i': index }, 'data-conv-id': row.id,
    title: row.preview || row.title, onClick: () => actions.openSession(row.id),
    onContextMenu: (e) => { e.preventDefault(); onMenu({ id: row.id, x: e.clientX, y: e.clientY }) },
  },
  running ? h('span', { className: 'dsb-conv-run', 'aria-label': '工作中' }) : unread ? h('span', { className: 'bt-unread dsb-conv-dot', 'aria-hidden': true }) : null,
  h('span', { className: 'bt-agent-sub-title' }, row.title || '新对话'),
  h('span', { className: 'bt-agent-sub-time' }, row.updatedAt ? relativeShort(row.updatedAt) : ''))
}

export function Sidebar({ hooks, actions }) {
  const list = hooks.useSessions(v => v)
  const status = hooks.useSessionStatus(v => v)
  const shown = hooks.useShown(v => v)
  const approvals = hooks.useApprovals(v => v.length)
  const [query, setQuery] = useState(null)
  const [menu, setMenu] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const rows = useMemo(() => list.ids.map(id => list.byId[id]).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt), [list])
  const q = (query ?? '').trim().toLowerCase()
  const visible = q ? rows.filter(r => `${r.title} ${r.preview ?? ''}`.toLowerCase().includes(q)) : rows
  const anyRunning = [...status.values()].some(s => s.running)
  const state = approvals ? 'alert' : anyRunning ? 'working' : 'idle'
  const del = (id) => { if (window.confirm('删除这个对话？删除后不能恢复。')) void actions.remove(id).catch(actions.reportError) }
  return h('div', { className: 'bt-side' },
    h('div', { className: 'bt-side-top' },
      h('span', { className: 'bt-brand' }, h(BrandMark, { size: 22 }), h('span', { style: { fontWeight: 600, fontSize: 14 } }, BOT.name)),
      h('button', { type: 'button', className: 'bt-round', 'aria-label': '搜索对话', title: '搜索对话', 'aria-pressed': query !== null, onClick: () => setQuery(query === null ? '' : null) }, h(SearchIcon)),
      h('button', { type: 'button', className: 'bt-round', 'aria-label': '新对话', title: '新对话', onClick: () => { setQuery(null); void actions.newChat().catch(actions.reportError) } }, h(PlusIcon))),
    h('div', { className: 'bt-list', role: 'region', 'aria-label': '对话列表' },
      h('div', { className: 'bt-tile-wrap' }, h('button', {
        type: 'button', className: 'bt-tile', 'aria-current': 'page', 'aria-label': BOT.name, 'data-bot-id': BOT.id, title: BOT.name,
        onClick: () => { if (rows[0]) actions.openSession(rows[0].id) },
      }, h(BotAvatar, { bot: BOT, size: 60, state, main: true }), h('span', { className: 'bt-tile-name' }, BOT.name), h('span', { className: 'bt-chip' }, BOT.role))),
      query !== null ? h('div', { className: 'dsb-search' },
        h(SearchIcon), h('input', { className: 'dsb-search-input', autoFocus: true, placeholder: '搜索对话标题和内容', value: query, onChange: e => setQuery(e.target.value), onKeyDown: (e) => { if (e.key === 'Escape') setQuery(null) } }),
        h('button', { type: 'button', className: 'bt-icon-btn', 'aria-label': '关闭搜索', onClick: () => setQuery(null) }, h(CloseIcon))) : null,
      h('div', { className: 'dsb-conv-head' }, q ? `找到 ${visible.length} 个对话` : '对话'),
      h('div', { className: 'dsb-convs' },
        visible.map((row, i) => h(ConvRow, {
          key: row.id, row, index: i, actions, active: row.id === shown, renaming: renaming === row.id,
          running: status.get(row.id)?.running === true, unread: status.get(row.id)?.completionUnread === true,
          onMenu: setMenu, onDone: () => setRenaming(null),
        })),
        q && visible.length === 0 ? h('div', { className: 'bt-hint' }, '没有匹配的对话') : null)),
    h(RowMenu, { menu, onClose: () => setMenu(null), onRename: setRenaming, onDelete: del }))
}

export function SidebarFoot({ actions }) {
  return h('div', { className: 'dsb-side-foot' },
    h('button', { type: 'button', className: 'dsb-settings', title: '设置', 'aria-label': '设置', onClick: () => actions.openSettings('general') }, h(YouAvatar)),
    h('button', { type: 'button', className: 'dsb-foot-link', onClick: () => actions.openSettings('models') }, '模型设置'))
}
