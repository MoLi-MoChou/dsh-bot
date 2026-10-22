// 窗口框架：DS Bot 桌面版的 dsb-frame / dsb-side / dsb-main 结构（参照 DS Bot app/ui/src/app.js，Apache-2.0），
// 头部用 DS Bot 原版 HeaderPill（含活动指示），语音用 DS Bot 原版 VoiceMode。
import { Component, createElement as h, Fragment, useEffect, useMemo } from 'react'
import { HeaderPill } from '../../vendor/ds-bot/client/header.js'
import { CloseIcon } from '../../vendor/ds-bot/client/icons.js'
import { allThemes, themeCss } from '../../vendor/ds-bot/client/themes.js'
import { VoiceMode } from '../../vendor/ds-bot/client/voice.js'
import { Chat } from './chat.js'
import { SettingsDialog } from './settings.js'
import { Sidebar, SidebarFoot } from './sidebar.js'
import { createTeam } from './team.js'

function useTheme(prefs) {
  useEffect(() => {
    const theme = allThemes()[prefs?.theme] ?? allThemes().deepseek
    const style = document.createElement('style')
    style.textContent = themeCss(theme, prefs?.accent ?? undefined)
    document.head.append(style)
    if (prefs?.motion) document.body.dataset.btMotion = prefs.motion
    return () => style.remove()
  }, [prefs?.theme, prefs?.accent, prefs?.motion])
}

class Contain extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { this.props.onError(error); setTimeout(() => this.setState({ failed: false }), 0) }
  render() { return this.state.failed ? null : this.props.children }
}

function Toast({ hooks, actions }) {
  const toast = hooks.useUi(s => s.toast)
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => actions.clearToast(), 5000); return () => clearTimeout(t) }, [toast?.at])
  if (!toast) return null
  return h('div', { className: 'bt-toast', role: 'alert' },
    h('span', { className: 'bt-toast-text' }, toast.text),
    h('button', { type: 'button', className: 'bt-icon-btn bt-toast-close', 'aria-label': '关闭', onClick: () => actions.clearToast() }, h(CloseIcon)))
}

export function App() {
  const team = useMemo(createTeam, [])
  useEffect(() => team.start(), [team])
  const { hooks, actions } = team
  const views = { ...hooks, actions }
  const shown = hooks.useShown(id => id)
  const settings = hooks.useUi(s => s.settings)
  const voice = hooks.useUi(s => s.voice)
  const roster = hooks.useRoster(v => v)
  useTheme(hooks.usePrefs(v => v))
  return h('div', { className: 'dsb-frame' },
    h('aside', { className: 'dsb-side' },
      h('div', { className: 'dsb-band' }),
      h('div', { className: 'dsb-side-list' }, h(Sidebar, { hooks, actions })),
      h(SidebarFoot, { actions })),
    h('main', { className: 'dsb-main dsb_centerCol' },
      h('div', { className: 'dsb-band' }),
      shown ? h(Fragment, { key: shown },
        h('div', { className: 'dsb-head' }, h(HeaderPill, { ...views, sessionId: shown, useSession: team.sessionHook(shown) })),
        h(Chat, { sessionId: shown, team })) : null),
    h(Contain, { onError: (e) => { actions.closeSettings(); actions.closeVoice(); actions.reportError(e) } },
      settings ? h(SettingsDialog, { page: settings.page, hooks, actions }) : null,
      voice ? h(VoiceMode, { sessionId: voice, roster, actions, useSessions: hooks.useSessions, useSessionStatus: hooks.useSessionStatus }) : null),
    h(Toast, { hooks, actions }))
}
