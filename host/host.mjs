// 宿主进程：在独立 DSH_HOME 下用 DSH 的 profile-boot 启动引擎（dsh-base + dsh-bot-engine），不打补丁。
// 写法参照 DS Bot app/src/host.mjs 与 profile.mjs（Apache-2.0），见 NOTICE。
import { fileURLToPath } from 'node:url'
import { initProfile, loadLayeredEnv, loadProfileDirectory, reportSkippedBundles, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'

import { readFileSync } from 'node:fs'
process.env.DSH_BOT_PERSONA ??= readFileSync(new URL('../engine/persona.txt', import.meta.url), 'utf8')
const PROFILE = 'dsh-bot'
const BUNDLES = ['@deepseek-ai/dsh-base', 'dsh-bot-engine']
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

const dir = resolveProfileDir(PROFILE)
initProfile(dir, BUNDLES)
const profile = loadProfileDirectory('dsh', dir, INSTALL_ANCHOR)
reportSkippedBundles('dsh', profile)
const app = await runProfile({ environment: loadLayeredEnv('dsh'), profile: PROFILE, resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR }, patchFiles: [], args: [] })
const stop = async () => { await app.shutdown.shutdown(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
