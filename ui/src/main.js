// 入口：装上 DS Bot 自己的样式表和中文文案，然后渲染界面。参照 DS Bot app/ui/src/main.js（Apache-2.0）。
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { FEEDBACK_CSS } from '../../vendor/ds-bot/client/feedback.js'
import { installLocale } from '../../vendor/ds-bot/client/i18n.js'
import { MODEL_CSS } from '../../vendor/ds-bot/client/model-menu.js'
import { PROVIDERS_CSS } from '../../vendor/ds-bot/client/providers-page.js'
import { SECRET_CSS } from '../../vendor/ds-bot/client/secret-card.js'
import { SIDEBAR_CSS } from '../../vendor/ds-bot/client/sidebar.js'
import { CONVERSATION_CSS, SHELL_CSS, installStyles } from '../../vendor/ds-bot/client/styles.js'
import { createLocale } from './locale.js'
import { App } from './app.js'
import './app.css'
import './bot.css'

const lang = new URLSearchParams(location.search).get('lang') ?? 'zh-CN'
installLocale(createLocale(lang))
document.documentElement.lang = lang
for (const [tag, text] of [['shell', SHELL_CSS], ['sidebar', SIDEBAR_CSS], ['conversation', CONVERSATION_CSS], ['secrets', SECRET_CSS], ['providers', PROVIDERS_CSS], ['models', MODEL_CSS], ['feedback', FEEDBACK_CSS]]) installStyles(text, tag)

// DS Bot 的配色看 body[data-ds-dark-theme]：跟随系统，或 ?theme=dark / ?theme=light 指定。
const forced = new URLSearchParams(location.search).get('theme')
const dark = matchMedia('(prefers-color-scheme: dark)')
const paint = () => { document.body.toggleAttribute('data-ds-dark-theme', forced ? forced === 'dark' : dark.matches) }
paint()
dark.addEventListener('change', paint)

createRoot(document.getElementById('root')).render(h(App))
