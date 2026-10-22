// 入口：装上 DS Bot 自己的样式表和中文文案，然后渲染单 bot 界面。参照 DS Bot app/ui/src/main.js（Apache-2.0）。
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { installLocale } from '../../vendor/ds-bot/client/i18n.js'
import { MODEL_CSS } from '../../vendor/ds-bot/client/model-menu.js'
import { SIDEBAR_CSS } from '../../vendor/ds-bot/client/sidebar.js'
import { CONVERSATION_CSS, SHELL_CSS, installStyles } from '../../vendor/ds-bot/client/styles.js'
import { createLocale } from './locale.js'
import { App } from './app.js'
import './app.css'
import './bot.css'

const lang = new URLSearchParams(location.search).get('lang') ?? 'zh-CN'
installLocale(createLocale(lang))
document.documentElement.lang = lang
for (const [tag, text] of [['shell', SHELL_CSS], ['sidebar', SIDEBAR_CSS], ['conversation', CONVERSATION_CSS], ['models', MODEL_CSS]]) installStyles(text, tag)
createRoot(document.getElementById('root')).render(h(App))
