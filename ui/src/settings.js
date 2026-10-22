// 设置对话框：DS Bot settings.js 的外框与样式（bt-settings、bt-settings-nav、SetSection、SetRow，Apache-2.0），
// 页面只保留这个 bot 需要的：通用、模型、权限、记忆、关于。
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { ACCENT_INKS, INKS } from '../../vendor/ds-bot/client/inks.js'
import { allThemes } from '../../vendor/ds-bot/client/themes.js'
import { CloseIcon, FolderIcon, GearIcon, InfoIcon, MemoryIcon, SlidersIcon } from '../../vendor/ds-bot/client/icons.js'
import { KeyIcon } from '../../vendor/ds-bot/client/secret-card.js'
import { useEscape } from '../../vendor/ds-bot/client/overlay-hooks.js'
import { Segmented, useGlide } from '../../vendor/ds-bot/client/motion.js'
import { PermissionPicker } from '../../vendor/ds-bot/client/permission-picker.js'
import { t } from '../../vendor/ds-bot/client/i18n.js'
import { call } from './api.js'
import { ModelsPage } from './models-page.js'

const PAGES = [['general', '通用', GearIcon], ['models', '模型', SlidersIcon], ['permissions', '权限', KeyIcon], ['memory', '记忆', MemoryIcon], ['about', '关于', InfoIcon]]

function SetSection({ title, className = '', children }) {
  return h('section', { className: `bt-set-section ${className}`.trim() }, h('h3', null, title), h('div', { className: 'bt-set-card' }, children))
}
function SetRow({ label, hint, children }) {
  return h('div', { className: 'bt-set-row' },
    h('div', { className: 'bt-set-copy' }, h('span', null, label), hint ? h('span', { className: 'bt-set-hint' }, hint) : null),
    children ? h('div', { className: 'bt-set-control' }, children) : null)
}

const capitalize = w => w[0].toUpperCase() + w.slice(1)
const MOTIONS = [['quiet', '安静'], ['normal', '正常'], ['lively', '活泼']]
function GeneralPage({ hooks, actions, run }) {
  const prefs = hooks.usePrefs(v => v)
  const themes = allThemes()
  const current = themes[prefs.theme] ? prefs.theme : 'deepseek'
  const [cwd, setCwd] = useState(prefs.cwd ?? '')
  useEffect(() => setCwd(prefs.cwd ?? ''), [prefs.cwd])
  const motion = prefs.motion === 'quiet' || prefs.motion === 'lively' ? prefs.motion : 'normal'
  return [
    h(SetSection, { key: 'look', title: '外观' },
      h(SetRow, { label: '主题' },
        h('select', { className: 'bt-select', 'aria-label': '主题', value: current, onChange: e => run(actions.setPrefs({ theme: e.target.value })) },
          Object.entries(themes).map(([id, theme]) => h('option', { key: id, value: id }, t(theme.label))))),
      h(SetRow, { label: '强调色', hint: '未读标记、按钮和品牌标志的颜色。' },
        h('div', { className: 'bt-swatches' },
          h('button', { type: 'button', className: 'bt-swatch bt-swatch-default', title: '主题默认', 'aria-label': '主题默认', 'aria-pressed': !prefs.accent, onClick: () => run(actions.setPrefs({ accent: null })) }),
          ACCENT_INKS.map(ink => h('button', { key: ink, type: 'button', className: 'bt-swatch', title: t(capitalize(ink)), 'aria-label': t(capitalize(ink)), 'aria-pressed': prefs.accent === INKS[ink][0], style: { background: INKS[ink][0] }, onClick: () => run(actions.setPrefs({ accent: INKS[ink][0] })) })))),
      h(SetRow, { label: 'Bot 动画' },
        h(Segmented, { label: 'Bot 动画', value: motion, className: 'bt-motion-seg' }, MOTIONS.map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': motion === id, onClick: () => { if (motion !== id) run(actions.setPrefs({ motion: id })) } }, label))))),
    h(SetSection, { key: 'cwd', title: '工作目录' },
      h(SetRow, { label: '新对话在这个文件夹里工作', hint: 'Bot 读写文件、运行命令默认在这里。已有对话保持原来的目录。' }),
      h('div', { className: 'bt-set-row dsb-cwd' }, h(FolderIcon),
        h('input', { className: 'bt-input', 'aria-label': '工作目录', value: cwd, spellCheck: false, onChange: e => setCwd(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') void run(actions.setPrefs({ cwd })) } }),
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: !cwd.trim() || cwd === prefs.cwd, onClick: () => run(actions.setPrefs({ cwd })) }, '保存'))),
  ]
}

function PermissionsPage({ hooks, run }) {
  const shown = hooks.useShown(v => v)
  const [view, setView] = useState(null)
  useEffect(() => { void run(call('permission', { id: shown }).then(setView)) }, [shown])
  if (!view) return null
  const pick = (scope) => value => run(call('permission/set', { id: scope === 'session' ? shown : undefined, preset: value, scope }).then(setView))
  const desc = value => view.catalog.options.find(o => o.value === value)?.description ?? ''
  return [
    h(SetSection, { key: 'now', title: '当前对话' },
      h(SetRow, { label: '权限', hint: desc(view.current) || '改文件、跑命令时 bot 能做到哪一步。' }, h(PermissionPicker, { catalog: view.catalog, saved: view.current, onPick: pick('session') }))),
    h(SetSection, { key: 'def', title: '新对话默认' },
      h(SetRow, { label: '默认权限', hint: desc(view.default) }, h(PermissionPicker, { catalog: view.catalog, saved: view.default, onPick: pick('default') }))),
    h('p', { key: 'note', className: 'bt-set-hint dsb-page-note' }, '“工作区”档位下，bot 在工作目录外写文件或联网等操作会先弹出审批卡；“完全访问”不再询问，请谨慎使用。'),
  ]
}

function MemoryEditor({ kind, title, hint, data, run, onSaved }) {
  const [text, setText] = useState(data[kind])
  const [saved, setSaved] = useState(false)
  useEffect(() => setText(data[kind]), [data[kind]])
  const dirty = text !== data[kind]
  return h(SetSection, { title },
    h('div', { className: 'bt-set-row dsb-mem' },
      h('span', { className: 'bt-set-hint' }, hint, h('code', null, data.paths[kind])),
      h('textarea', { className: 'bt-input dsb-mem-text', 'aria-label': title, value: text, spellCheck: false, onChange: (e) => { setText(e.target.value); setSaved(false) } }),
      h('div', { className: 'bt-secret-row-actions' },
        saved ? h('span', { className: 'bt-set-hint bt-secret-ok' }, '已保存') : null,
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: !dirty, onClick: () => setText(data[kind]) }, '还原'),
        h('button', { type: 'button', className: 'bt-fb-primary', disabled: !dirty, onClick: () => void run(call('memory', { kind, text }).then((v) => { onSaved(v); setSaved(true) })) }, '保存'))))
}
function MemoryPage({ run }) {
  const [data, setData] = useState(null)
  useEffect(() => { void run(call('memory').then(setData)) }, [])
  if (!data) return null
  return [
    h('p', { key: 'n', className: 'bt-set-hint dsb-page-note' }, '这两份文件会在每次对话时提供给 bot。你让它“记住”什么，它会自己写进来；你也可以在这里直接改。'),
    h(MemoryEditor, { key: 'p', kind: 'profile', title: '关于我', hint: '稳定的事实和偏好，比如称呼、常用语言、工作习惯。', data, run, onSaved: setData }),
    h(MemoryEditor, { key: 'j', kind: 'journal', title: '笔记', hint: '按日期追加的笔记。', data, run, onSaved: setData }),
  ]
}

function AboutPage() {
  return h(SetSection, { title: 'DSH Bot' },
    h(SetRow, { label: '引擎', hint: 'DeepSeek Harness 0.2.1-rc.2（MIT）' }),
    h(SetRow, { label: '界面', hint: '界面模块来自 DS Bot（Fei2411/DeepSeek-Bot，Apache-2.0），富消息由 OpenUI（MIT）渲染。' }),
    h(SetRow, { label: '许可', hint: 'Apache-2.0，第三方声明见 NOTICE。' }))
}

export function SettingsDialog({ page, hooks, actions }) {
  const [error, setError] = useState('')
  const close = useCallback(() => actions.closeSettings(), [])
  useEscape(close)
  const run = promise => Promise.resolve(promise).then(() => { setError(''); return true }).catch((f) => { setError(f?.message ?? String(f)); return false })
  const shown = PAGES.some(([k]) => k === page) ? page : 'general'
  const nav = useGlide(shown, { axis: 'y' })
  const label = PAGES.find(([k]) => k === shown)[1]
  const last = useRef(shown)
  useEffect(() => { last.current = shown; setError('') }, [shown])
  return h('div', { className: 'bt-settings-layer' },
    h('div', { className: 'bt-scrim', onMouseDown: close }),
    h('div', { className: 'bt-settings', role: 'dialog', 'aria-modal': true, 'aria-label': '设置' },
      h('nav', { ref: nav.box, className: 'bt-settings-nav', 'aria-label': '设置页' },
        h('span', { ref: nav.thumb, className: 'bt-thumb', 'aria-hidden': true }),
        PAGES.map(([key, text, Icon]) => h('button', { key, type: 'button', className: 'bt-settings-item', 'aria-current': shown === key ? 'page' : undefined, onClick: () => actions.openSettings(key) }, h(Icon), text))),
      h('div', { className: 'bt-settings-main' },
        h('div', { className: 'bt-settings-head' }, h('h2', { key: shown }, label)),
        h('div', { key: shown, className: 'bt-settings-scroll bt-settings-page', 'data-move': 'up' },
          error ? h('div', { className: 'bt-error', role: 'alert', style: { padding: 0 } }, error) : null,
          shown === 'general' ? h(GeneralPage, { hooks, actions, run }) : null,
          shown === 'models' ? h(ModelsPage, { Section: SetSection, Row: SetRow, run }) : null,
          shown === 'permissions' ? h(PermissionsPage, { hooks, run }) : null,
          shown === 'memory' ? h(MemoryPage, { run }) : null,
          shown === 'about' ? h(AboutPage) : null)),
      h('button', { type: 'button', className: 'bt-settings-close', 'aria-label': '关闭设置', onClick: close }, h(CloseIcon))))
}
