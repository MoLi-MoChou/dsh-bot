import { ACCENT_INKS, INKS, isHex, luminance } from './inks.js'
import { SHAPES, markupCache, maskCache } from './characters.js'
import { createSource } from './sources.js'

// -------------------------------------------------------------------------
// Themes. A theme names eight colors per mode; every `--bt-*` variable and the shell
// tokens derive from them, so a registered theme recolors the whole team UI.

const THEME_KEYS = ['bg', 'sidebar', 'bubble', 'card', 'text', 'user', 'userText', 'accent']
// Mochou: three themes, each light and dark. Each also sets the DeepSeek Harness
// tokens (`tokens`, light/dark pairs) and extra CSS (`css`) for corner radii, type and
// borders, so DSH's settings, OpenUI cards and dialogs follow the theme too.
const SERIF = 'ui-serif,Georgia,Cambria,"Times New Roman","Songti SC","Noto Serif CJK SC",serif'
const both = value => ({ light: value, dark: value })
const THEMES = {
  deepseek: {
    label: 'DeepSeek',
    light: { bg: '#fcfcfc', sidebar: '#f7f7f7', bubble: '#eeeeee', card: '#ffffff', text: '#141414', user: '#070707', userText: '#fcfcfc', accent: '#4d6bfe' },
    dark: { bg: '#141414', sidebar: '#1b1b1b', bubble: '#262626', card: '#1f1f1f', text: '#f2f2f2', user: '#f2f2f2', userText: '#141414', accent: '#5b7bff' },
  },
  // Warm clay on a cream surface ladder, serif headings, softer radii (after
  // open-claude-ui's cds-theme.css, MIT). Colors and feel only.
  claude: {
    label: 'Claude',
    light: { bg: '#faf9f5', sidebar: '#f3f1ea', bubble: '#f0eee6', card: '#ffffff', text: '#141413', user: '#e8e5da', userText: '#141413', accent: '#d97757' },
    dark: { bg: '#262624', sidebar: '#1f1e1d', bubble: '#30302e', card: '#2b2a27', text: '#f5f4ef', user: '#3a3935', userText: '#f5f4ef', accent: '#d97757' },
    tokens: {
      '--dsw-radius-sm': both('6px'), '--dsw-radius-md': both('10px'), '--dsw-radius-lg': both('14px'), '--dsw-radius-xl': both('20px'),
    },
    css: `
body[data-bt-theme=claude] :is(.bt-bubble,.bt-ububble){border-radius:12px}
body[data-bt-theme=claude] [class*="_card"]:has([data-composer-input]){border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,.035),inset 0 0 0 1px var(--bt-line-2)}
body[data-bt-theme=claude] [class*="_card"]:has([data-composer-input]):focus-within{box-shadow:0 4px 24px rgba(0,0,0,.08),inset 0 0 0 1px color-mix(in srgb,var(--bt-accent) 45%,var(--bt-line-2))}
body[data-bt-theme=claude] :is(.bt-set-section h3,.bt-drawer-name,.bt-process header strong,.bt-section-title,.bt-brand-name,[role=dialog] h2){font-family:${SERIF};font-weight:500;letter-spacing:-.01em}
body[data-bt-theme=claude] :is(.bt-set-section h3,.bt-section-title){font-size:15px}
body[data-bt-theme=claude] .bt-process,body[data-bt-theme=claude] .bt-menu{border-radius:12px}
body[data-bt-theme=claude] :is(.bt-work-all,.bt-retry){border-color:color-mix(in srgb,var(--bt-accent) 28%,var(--bt-line-2))}
body[data-bt-theme=claude] [data-composer-input]{caret-color:var(--bt-accent)}
`,
  },
  // Near-black / near-white, monochrome: the foreground is the accent, hairline
  // borders, pill controls, almost no shadow (after grok.com's web UI).
  grok: {
    label: 'Grok Bot',
    light: { bg: '#ffffff', sidebar: '#fafafa', bubble: '#f2f2f2', card: '#ffffff', text: '#0d0d0d', user: '#f0f0f0', userText: '#0d0d0d', accent: '#0d0d0d' },
    dark: { bg: '#030404', sidebar: '#070807', bubble: '#171717', card: '#171717', text: '#f4f4f0', user: '#202020', userText: '#f4f4f0', accent: '#f4f4f0' },
    tokens: {
      '--dsw-radius-sm': both('8px'), '--dsw-radius-md': both('14px'), '--dsw-radius-lg': both('20px'), '--dsw-radius-xl': both('24px'),
      '--dsw-shadow-lv3': both('none'),
    },
    css: `
html body[data-bt-theme=grok]{--bt-line:rgba(13,13,13,.07);--bt-line-2:rgba(13,13,13,.12)}
body[data-bt-theme=grok] :is(.bt-bubble,.bt-ububble){border-radius:20px}
body[data-bt-theme=grok] [class*="_card"]:has([data-composer-input]){border-radius:22px;box-shadow:inset 0 0 0 1px var(--bt-line-2);background:var(--bt-card)}
body[data-bt-theme=grok][data-ds-dark-theme] [class*="_card"]:has([data-composer-input]){background:#171717}
html body[data-bt-theme=grok][data-ds-dark-theme]{--bt-line:#252525;--bt-line-2:#2b2b2b;--bt-hover:#202020;--bt-active:#303030;--bt-ink-2:#a7a7a2;--bt-ink-3:#74746f}
body[data-bt-theme=grok] :is(.bt-set-section h3,.bt-drawer-name,.bt-process header strong){font-weight:600;letter-spacing:-.015em}
body[data-bt-theme=grok] :is(.bt-process,.bt-menu,.bt-update-pop){box-shadow:0 0 0 .5px var(--bt-line-2),0 12px 32px -12px rgba(0,0,0,.25)}
body[data-bt-theme=grok] .bt-work-all,body[data-bt-theme=grok] .bt-retry{border-radius:999px}
`,
  },
}
// Ids earlier versions saved, and what they became.
export const THEME_ALIASES = { mono: 'grok', paper: 'claude', moonlight: 'deepseek' }
export const resolveThemeId = (themes, id) => (themes[id] ? id : themes[THEME_ALIASES[id]] ? THEME_ALIASES[id] : 'deepseek')
// Text on the accent: near-black or white, whichever has the higher WCAG contrast.
// (L + .05)² > 1.05 × (L(#141414) + .05) is "dark ink reads better".
const DARK_INK = '#141414'
const accentInk = accent => ((luminance(accent) + 0.05) ** 2 > 1.05 * (luminance(DARK_INK) + 0.05) ? DARK_INK : '#ffffff')
const rgba = (hex, alpha) => `rgba(${[1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(',')},${alpha})`
function themeVars(mode, dark, accent = mode.accent) {
  return {
    '--bt-ink': mode.text, '--bt-ink-2': rgba(mode.text, 0.6), '--bt-ink-3': rgba(mode.text, 0.36),
    '--bt-bubble': mode.bubble, '--bt-sidebar': mode.sidebar, '--bt-main': mode.bg, '--bt-card': mode.card,
    '--bt-line': rgba(mode.text, 0.08), '--bt-line-2': rgba(mode.text, 0.15),
    '--bt-hover': dark ? 'rgba(160,160,160,.12)' : 'rgba(119,119,119,.09)',
    '--bt-active': dark ? 'rgba(160,160,160,.2)' : 'rgba(119,119,119,.17)',
    '--bt-accent': accent, '--bt-accent-ink': accentInk(accent),
    '--bt-user': mode.user, '--bt-user-ink': mode.userText,
    '--bt-tag-bg': rgba(mode.text, dark ? 0.09 : 0.06), '--bt-tag-ink': rgba(mode.text, 0.58),
  }
}
const declarations = vars => Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(';')
// A preset accent is saved as its light value; in dark mode it takes the preset's dark
// value, as Bot names do, so Charcoal does not vanish on a dark background. A custom
// accent is the same in both modes. A preset is matched the way Settings marks it.
const darkAccent = (accent) => {
  const ink = ACCENT_INKS.find(id => INKS[id][0] === accent)
  return ink === undefined ? accent : INKS[ink][1]
}
// `html body` outranks the base sheet's `body` rules without !important.
export const themeCss = (theme, accent) => `html body{${declarations(themeVars(theme.light, false, accent ?? theme.light.accent))}}
html body[data-ds-dark-theme]{${declarations(themeVars(theme.dark, true, darkAccent(accent) ?? theme.dark.accent))}}
${theme.css ?? ''}`
export const shellTokens = ({ light, dark, tokens }) => ({
  '--dsw-alias-bg-base': { light: light.bg, dark: dark.bg },
  '--dsw-alias-bg-layer-1': { light: light.card, dark: dark.card },
  '--dsw-alias-bg-layer-2': { light: light.bubble, dark: dark.bubble },
  '--dsw-alias-bg-layer-3': { light: light.sidebar, dark: dark.sidebar },
  '--dsw-alias-border-l2': { light: rgba(light.text, 0.06), dark: rgba(dark.text, 0.08) },
  '--dsw-alias-border-l3': { light: rgba(light.text, 0.1), dark: rgba(dark.text, 0.12) },
  '--dsw-alias-border-l4': { light: rgba(light.text, 0.16), dark: rgba(dark.text, 0.18) },
  '--dsw-alias-interactive-bg-hover': { light: rgba(light.text, 0.05), dark: rgba(dark.text, 0.08) },
  '--dsw-alias-brand-primary': { light: light.accent, dark: dark.accent },
  '--dsw-alias-state-business-primary': { light: light.accent, dark: dark.accent },
  '--dsw-alias-button-primary-fill': { light: light.accent, dark: dark.accent },
  '--dsw-alias-label-primary-foreground': { light: accentInk(light.accent), dark: accentInk(dark.accent) },
  '--dsw-focus-ring-color': { light: rgba(light.accent, 0.45), dark: rgba(dark.accent, 0.45) },
  '--dsw-alias-link': { light: light.accent, dark: dark.accent },
  ...(tokens ?? {}),
  '--dsw-specific-sidebar-fill': { light: light.sidebar, dark: dark.sidebar },
  '--dsw-specific-input-major': { light: light.bg, dark: dark.sidebar },
  '--dsw-alias-label-primary': { light: light.text, dark: dark.text },
  '--dsw-alias-label-secondary': { light: rgba(light.text, 0.74), dark: rgba(dark.text, 0.74) },
  '--dsw-alias-label-tertiary': { light: rgba(light.text, 0.6), dark: rgba(dark.text, 0.6) },
})

// Other plugins add character shapes and themes through `window.dshBot`, or queue
// calls on `window.dshBotQueue` before this plugin loads. A shape draws only its
// body; the eyes are cut out where `eyes.at` says, so it gets every state motion free.
const customThemes = {}
export const registry = createSource(0)
const isPoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
export function registerShape(id, shape) {
  if (typeof id !== 'string' || !/^[a-z][\w-]{0,31}$/.test(id)) throw new Error('Shape ids are lowercase words')
  if (typeof shape?.body !== 'function' || typeof shape.body('#000') !== 'string') throw new Error('A shape needs body(paint) returning SVG markup')
  const at = shape.eyes?.at
  if (!Array.isArray(at) || at.length !== 2 || !at.every(isPoint)) throw new Error('A shape needs eyes.at: two [x, y] points')
  const size = Number.isFinite(shape.size) && shape.size > 0 ? shape.size : 100
  const pick = (key, fallback) => (Number.isFinite(shape.eyes[key]) ? shape.eyes[key] : fallback)
  const eyes = at.map(([x, y]) => [x, y, pick('w', size * 0.1), pick('h', size * 0.23), pick('tilt', -27)])
  const previous = SHAPES[id]
  SHAPES[id] = {
    label: String(shape.label ?? id),
    size,
    body: shape.body,
    eyes,
    ...(typeof shape.wrap === 'string' ? { wrap: shape.wrap } : {}),
  }
  const refresh = () => {
    markupCache.clear()
    maskCache.delete(id)
    registry.set(value => value + 1)
  }
  refresh()
  return () => {
    if (previous) SHAPES[id] = previous
    else delete SHAPES[id]
    refresh()
  }
}
export function registerTheme(id, theme) {
  if (typeof id !== 'string' || !/^[a-z][\w-]{0,31}$/.test(id)) throw new Error('Theme ids are lowercase words')
  for (const mode of ['light', 'dark']) {
    for (const key of THEME_KEYS) if (!isHex(theme?.[mode]?.[key])) throw new Error(`Theme ${mode}.${key} must be a #rrggbb color`)
  }
  const previous = customThemes[id]
  customThemes[id] = { label: String(theme.label ?? id), light: theme.light, dark: theme.dark, css: typeof theme.css === 'string' ? theme.css : '' }
  registry.set(value => value + 1)
  return () => {
    if (previous) customThemes[id] = previous
    else delete customThemes[id]
    registry.set(value => value + 1)
  }
}
export const allThemes = () => ({ ...THEMES, ...customThemes })
