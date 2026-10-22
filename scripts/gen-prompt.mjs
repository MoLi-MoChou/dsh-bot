// 生成 bot 的身份 + OpenUI 组件库提示词，宿主启动时注入 DSH 的 persona。
import { writeFileSync } from 'node:fs'
import { libraryPrompt } from '../ui/src/openui.js'
const identity = 'You are DSH Bot, a personal assistant bot. Reply in the user\'s language. You can chat, read and write files in your working folder, and run commands (the user approves risky ones).'
writeFileSync(new URL('../engine/persona.txt', import.meta.url), `${identity}\n\n${libraryPrompt()}\n`)
console.log('ok')
