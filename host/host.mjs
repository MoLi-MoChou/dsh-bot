// 宿主进程：在独立 DSH_HOME 下用 DSH 的 profile-boot 启动引擎（dsh-base + dsh-bot-engine），不打补丁。
// 写法参照 DS Bot app/src/host.mjs 与 profile.mjs（Apache-2.0），见 NOTICE。
import { fileURLToPath } from 'node:url'
import { initProfile, loadLayeredEnv, loadProfileDirectory, reportSkippedBundles, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'

import { readFileSync } from 'node:fs'
process.env.DSH_BOT_UI_DIR ??= fileURLToPath(new URL('../dist', import.meta.url))
process.env.DSH_BOT_PERSONA ??= readFileSync(new URL('../engine/persona.txt', import.meta.url), 'utf8')
const PROFILE = 'dsh-bot'
const BUNDLES = ['@deepseek-ai/dsh-base', 'dsh-bot-engine']
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

const dir = resolveProfileDir(PROFILE)
initProfile(dir, BUNDLES)
const profile = loadProfileDirectory('dsh', dir, INSTALL_ANCHOR)
reportSkippedBundles('dsh', profile)
// 桌面版由 Electron 用 ELECTRON_RUN_AS_NODE 起这个文件（与 DSH Desktop / DS Bot 的 Host 子进程相同），
// 引擎监听好后经 IPC 发 {type:'ready', url}；壳发 {type:'shutdown'} 或断开 IPC 时干净退出。
let app
try {
  app = await runProfile({ environment: loadLayeredEnv('dsh'), profile: PROFILE, resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR }, patchFiles: [], args: [] })
} catch (error) {
  console.error(error)
  if (process.send) await new Promise(r => process.send({ type: 'fatal', message: String(error?.message ?? error) }, r))
  process.exit(1)
}
let stopping
const stop = () => stopping ??= (async () => {
  await app.shutdown.shutdown(0).catch(e => console.error(e))
  if (process.connected) process.disconnect()
  process.exit(0)
})()
process.on('SIGINT', stop); process.on('SIGTERM', stop)
process.on('message', (m) => { if (m?.type === 'shutdown') void stop() })
process.once('disconnect', () => { void stop() })
