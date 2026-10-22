// Settings → About DS Bot: the version, updates for DS Bot and DSH, and the links to
// the repository. The sidebar's cloud button shows the same update state.
import { createElement as h, useEffect, useState } from 'react'
import { GitHubMark } from './connectors.js'
import { whenText } from './feedback.js'
import { dateLocale, hostText, t } from './i18n.js'
import { StarLineIcon } from './icons.js'
import { SPRING_POP } from './motion.js'
import { BotMark } from './mark.js'
import { MAIN_LOOK } from './characters.js'
import { showsDshRow } from './dsh-offer.js'

// The length of the mark's `done` hop (bt-done in styles.js).
const CHEER_MS = 1800

const starCount = count => new Intl.NumberFormat(dateLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(count)

function botHint(update) {
  if (update.phase === 'installing') return t('Updating DS Bot…')
  if (update.phase === 'installed') return t('Restart DSH to start using DS Bot {version}.', { version: update.installed ?? update.latest })
  if (update.phase === 'failed') return t('The update did not finish: {reason}', { reason: hostText(update.error ?? '') })
  if (update.available) return t('DS Bot {version} is available', { version: update.latest })
  if (update.source === 'app') return t('Updates come with the DeepSeek Bot app.')
  if (update.enabled === false) return t('Update checks are off.')
  if (update.source === 'path') return t('Installed from a local folder; update it there.')
  if (!update.checkedAt) return null
  if (!update.latest && update.source !== 'registry') return t('Updates are not offered for this install.')
  const checked = t('Checked {time}', { time: whenText(update.checkedAt) })
  return `${update.latest ? t('Up to date') : t('Could not check for updates.')} · ${checked}`
}

function dshHint(dsh, shown) {
  if (dsh.phase === 'installing') return t('Updating DSH…')
  if (dsh.phase === 'installed') return t('Restart DSH to start using DSH {version}.', { version: dsh.installed ?? dsh.verified })
  if (dsh.phase === 'failed') return t('The update did not finish: {reason}', { reason: hostText(dsh.error ?? '') })
  if (dsh.available === false && dsh.blockedBy) return t('Update DS Bot {version} first.', { version: dsh.blockedBy })
  if (shown) return t('DSH {version} is available', { version: dsh.verified })
  return t('Version {version}', { version: dsh.current })
}

// DSH Bot patch: the desktop app's own updater (electron-updater in the app's main
// process): checks at launch and every few hours, downloads only the changed blocks,
// then installs silently on restart. This row lets the user check, watch, and restart.
const RELEASES_PAGE = 'https://github.com/MoLi-MoChou/dsh-bot/releases'
const appBridge = () => (typeof window === 'undefined' ? null : window.dsBotApp?.updates ?? null)

function useAppUpdate() {
  const bridge = appBridge()
  const [state, setState] = useState(null)
  useEffect(() => {
    if (!bridge) return undefined
    let live = true
    bridge.state().then((value) => { if (live) setState(value) }, () => {})
    const off = bridge.onChange((value) => { if (live) setState(value) })
    return () => { live = false; off?.() }
  }, [bridge])
  return [bridge, state, setState]
}

function appHint(state) {
  if (!state) return null
  switch (state.phase) {
    case 'checking': return t('Checking for updates…')
    case 'downloading': return t('Downloading {version} · {percent}%', { version: state.version ?? '', percent: Math.floor(state.percent ?? 0) })
    case 'downloaded': return t('{version} is ready. Restart to update; nothing to reinstall.', { version: state.version })
    case 'latest': return t('Up to date') + (state.checkedAt ? ` · ${t('Checked {time}', { time: whenText(state.checkedAt) })}` : '')
    case 'error': return t('Could not check for updates.') + (state.error ? ` ${state.error}` : '')
    case 'unsupported': return state.reason === 'portable' ? t('The portable exe does not update itself: download the new one from the releases page and replace this file. Your data stays.') : state.reason === 'dev' ? t('Updates work in the installed app.') : state.reason === 'package' ? t('This package updates through its package manager; the AppImage and Windows installer update themselves.') : t('Update checks are off.')
    default: return state.current ? t('Version {version}', { version: state.current }) : null
  }
}

function AppUpdateRow({ Row, run }) {
  const [bridge, state, setState] = useAppUpdate()
  if (!bridge) return null
  const phase = state?.phase ?? 'idle'
  const control = phase === 'downloaded'
    ? h('button', { type: 'button', className: 'bt-fb-primary', onClick: () => run(bridge.install()) }, t('Restart to update'))
    : phase === 'downloading'
      ? h('span', { className: 'bt-app-progress', role: 'progressbar', 'aria-valuenow': Math.floor(state.percent ?? 0), 'aria-valuemin': 0, 'aria-valuemax': 100 },
          h('span', { style: { width: `${Math.max(2, Math.min(100, state.percent ?? 0))}%` } }))
      : phase === 'unsupported' ? (state.reason === 'portable' ? h('a', linkProps(RELEASES_PAGE), t('Open')) : null)
        : h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: phase === 'checking', onClick: () => run(bridge.check().then(setState)) }, phase === 'checking' ? t('Checking…') : t('Check for updates'))
  return h(Row, { label: 'DSH Bot', hint: appHint(state) }, control)
}

const linkProps = href => ({ className: 'bt-soft bt-soft-sm bt-about-link', href, target: '_blank', rel: 'noopener noreferrer' })

export function AboutPage({ useUpdate, actions, run, Section, Row }) {
  const update = useUpdate(value => value) ?? {}
  // DSH Bot patch: in the app, the version shown is the app's.
  const [appVersion, setAppVersion] = useState('')
  useEffect(() => { appBridge()?.state().then(value => setAppVersion(value?.current ?? ''), () => {}) }, [])
  const [checking, setChecking] = useState(false)
  const [stars, setStars] = useState(null)
  useEffect(() => {
    let live = true
    actions.repoStars().then((count) => { if (live && Number.isInteger(count)) setStars(count) }, () => {})
    return () => { live = false }
  }, [])
  // The whale hops when the page opens, after a check, and when an update is in.
  const [cheer, setCheer] = useState(true)
  useEffect(() => {
    if (!cheer) return undefined
    const timer = setTimeout(() => setCheer(false), CHEER_MS)
    return () => clearTimeout(timer)
  }, [cheer])
  const check = () => {
    setChecking(true)
    void run(actions.checkUpdate()).then((done) => { setChecking(false); if (done) setCheer(true) })
  }
  const phase = update.phase ?? 'idle'
  const dsh = update.dsh
  const dshPhase = dsh?.phase ?? 'idle'
  useEffect(() => { if (phase === 'installed' || dshPhase === 'installed') setCheer(true) }, [phase, dshPhase])
  const markState = checking ? 'searching' : phase === 'installing' || dshPhase === 'installing' ? 'working' : cheer ? 'done' : 'idle'
  // Same rule as the sidebar card.
  const dshNew = showsDshRow(dsh, update.app)
  const dshShown = dshNew && dsh.available
  const botControl = phase === 'installed' || update.source === 'app' ? null
    : update.available || phase === 'installing'
      ? h('button', { type: 'button', className: 'bt-fb-primary', disabled: phase === 'installing', onClick: () => run(actions.installUpdate()) },
          phase === 'installing' ? t('Updating…') : phase === 'failed' ? t('Try again') : t('Update'))
      : h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: checking || update.enabled === false, onClick: check }, checking ? t('Checking…') : t('Check for updates'))
  const dshControl = !dshNew || dshPhase === 'installed' ? null
    : dsh.kind === 'app'
      ? dsh.available ? h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => run(actions.openAppUpdates(dsh.verified)) }, t('Open updates')) : null
      : dsh.available || dshPhase !== 'idle'
        ? h('button', { type: 'button', className: 'bt-fb-primary', disabled: dshPhase === 'installing', onClick: () => run(actions.installDshUpdate()) },
            dshPhase === 'installing' ? t('Updating…') : dshPhase === 'failed' ? t('Try again') : t('Update'))
        : null
  const repo = update.repoUrl
  return [
    h('div', { key: 'hero', className: 'bt-about-hero' },
      h('span', { className: 'bt-about-mark' }, h(BotMark, { look: MAIN_LOOK, bot: { id: 'about' }, size: 52, state: markState, live: true, gaze: true, pokeable: true })),
      h('div', { className: 'bt-about-copy' },
        h('span', { className: 'bt-about-name' }, 'DSH Bot'),
        appVersion || update.current ? h('span', { className: 'bt-about-version' }, t('Version {version}', { version: appVersion || update.current })) : null),
      repo ? h('a', {
        className: 'bt-star', href: repo, target: '_blank', rel: 'noopener noreferrer', title: t('Star DS Bot on GitHub'),
        'aria-label': stars === null ? t('Star DS Bot on GitHub') : `${t('Star DS Bot on GitHub')} · ${t('{count} stars', { count: stars })}`,
      },
      h('span', { className: 'bt-star-main' }, h('span', { className: 'bt-star-icon' }, h(StarLineIcon)), 'Star'),
      stars === null ? null : h('span', { className: 'bt-star-count' }, starCount(stars))) : null),
    repo ? h('p', { key: 'ask', className: 'bt-about-ask' }, t('If DS Bot helps you, a star on GitHub helps more people find it.')) : null,
    h(Section, { key: 'updates', title: t('Updates') },
      appBridge() ? h(AppUpdateRow, { Row, run }) : null,
      appBridge() ? null : h(Row, { label: 'DS Bot', hint: botHint(update) }, botControl, update.available && update.notesUrl ? h('a', linkProps(update.notesUrl), t("What's new")) : null),
      dsh?.current ? h(Row, { label: 'DeepSeek Harness', hint: dshHint(dsh, dshShown) }, dshControl) : null),
    h(Section, { key: 'links', title: t('Links') },
      repo ? h(Row, { label: t('Source code'), hint: repo.replace(/^https:\/\//, '') }, h('a', linkProps(repo), h(GitHubMark), t('Open'))) : null,
      update.notesUrl ? h(Row, { label: t('Release notes') }, h('a', linkProps(update.notesUrl), t('Open'))) : null,
      // DSH Bot patch: credit the project this app is built on.
      h(Row, { label: t('Based on DS Bot'), hint: 'github.com/Fei2411/DeepSeek-Bot · Apache-2.0' }, h('a', linkProps('https://github.com/Fei2411/DeepSeek-Bot'), h(GitHubMark), t('Open'))),
      h(Row, { label: t('Report a problem') }, h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => actions.openSettings('feedback') }, t('Open')))),
  ]
}

export const ABOUT_CSS = `
.bt-app-progress{display:inline-block;width:140px;height:6px;border-radius:999px;background:var(--bt-line);overflow:hidden}
.bt-app-progress>span{display:block;height:100%;background:var(--bt-accent);transition:width .3s}
.bt-about-hero{display:flex;align-items:center;gap:14px;padding:16px;border:1px solid var(--bt-line);border-radius:12px;background:var(--bt-card)}
.bt-about-mark{flex:none;display:inline-flex;position:relative}
.bt-about-mark::before{content:'';position:absolute;inset:-20%;border-radius:50%}
body:not([data-bt-motion=quiet]) .bt-about-mark:hover .bt-mark[data-live][data-state=idle]:not(.bt-mark-poke) .bt-b{rotate:8deg;translate:5% -1%;animation:bt-nuzzle .78s ease-in-out .32s infinite}
body:not([data-bt-motion=quiet]) .bt-about-mark:hover .bt-mark[data-live][data-state=idle] .bt-eye{scale:1 0;animation:none}
body:not([data-bt-motion=quiet]) .bt-about-mark:hover .bt-mark[data-live][data-state=idle] .bt-eye-happy{opacity:1;transition-delay:.1s}
.bt-about-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.bt-about-name{font-size:16px;line-height:22px;font-weight:600}
.bt-about-version{font-size:12px;line-height:16px;color:var(--bt-ink-2);font-variant-numeric:tabular-nums}
.bt-about-ask{margin:-10px 4px 0;font-size:12px;line-height:16px;color:var(--bt-ink-3)}
.bt-star{flex:none;display:inline-flex;align-items:stretch;height:30px;border-radius:999px;border:1px solid var(--bt-line-2,var(--bt-line));overflow:hidden;color:var(--bt-ink);text-decoration:none;font-size:12px;line-height:28px;transition:transform .12s ease,border-color .15s ease}
.bt-star:hover{border-color:color-mix(in srgb,#e3a008 55%,var(--bt-line))}
.bt-star:active{transform:scale(.96)}
.bt-star-main{display:inline-flex;align-items:center;gap:6px;padding:0 12px 0 10px;background:var(--bt-hover);font-weight:500}
.bt-star-icon{display:inline-flex;color:var(--bt-ink-2);transition:color .15s ease}
.bt-star-icon path{transition:fill .15s ease}
.bt-star:hover .bt-star-icon{color:#e3a008;animation:bt-star-pop ${SPRING_POP.duration}ms ${SPRING_POP.easing}}
.bt-star:hover .bt-star-icon path{fill:currentColor}
.bt-star-count{display:inline-flex;align-items:center;padding:0 11px;border-left:1px solid var(--bt-line-2,var(--bt-line));color:var(--bt-ink-2);font-variant-numeric:tabular-nums;animation:bt-star-count-in ${SPRING_POP.duration}ms ${SPRING_POP.easing},bt-veil-in .2s ease-out}
@keyframes bt-star-pop{from{scale:.6;rotate:-30deg}}
@keyframes bt-star-count-in{from{translate:-6px 0}}
.bt-about-link{display:inline-flex;align-items:center;gap:6px;text-decoration:none}
.bt-about-link svg{width:14px;height:14px}
.bt-fb-primary:disabled{opacity:.6;cursor:default;filter:none}
@media (prefers-reduced-motion:reduce){.bt-star:hover .bt-star-icon,.bt-star-count{animation:none}}
`
