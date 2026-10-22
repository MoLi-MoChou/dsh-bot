// 打包产物冒烟测试（本机与 CI 都用）：用一个全新的数据目录启动打包好的应用，
// 等 Host 记下端口并真正开始服务（不带 token 访问返回 403），然后关掉应用。
// 用法：node scripts/smoke-packed.mjs <可执行文件> [额外参数...]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [exe, ...extra] = process.argv.slice(2)
if (!exe || !existsSync(exe)) { console.error(`找不到可执行文件：${exe}`); process.exit(2) }
const data = mkdtempSync(join(tmpdir(), 'dshbot-smoke-'))
const child = spawn(exe, extra, { env: { ...process.env, DSH_BOT_SHELL_DATA: data }, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
child.stdout.on('data', d => { log += d }); child.stderr.on('data', d => { log += d })
const deadline = Date.now() + 120_000
let ok = false
while (Date.now() < deadline && child.exitCode === null) {
  await new Promise(r => setTimeout(r, 1000))
  const file = join(data, 'host-port.json')
  if (!existsSync(file)) continue
  const { port } = JSON.parse(readFileSync(file, 'utf8'))
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`)
    if (res.status === 403) { ok = true; console.log(`Host 在 127.0.0.1:${port} 上运行，未带 token 的请求被拒（403）`); break }
  } catch { /* 还没开始监听 */ }
}
child.kill()
await new Promise(r => setTimeout(r, 3000))
if (!ok) console.error(log.split('\n').filter(l => !/dbus|gpu/i.test(l)).slice(-40).join('\n'))
try { rmSync(data, { recursive: true, force: true, maxRetries: 5 }) } catch { /* Windows 上可能还占着 */ }
process.exit(ok ? 0 : 1)
