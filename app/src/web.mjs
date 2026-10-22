// Mochou web mode: the same Host and UI, served to a normal browser without Electron.
//
//   MOCHOU_PASSWORD=… node src/web.mjs     (npm run web)
//
// The Host listens on loopback only. This process listens on MOCHOU_WEB_HOST:MOCHOU_WEB_PORT
// (default 127.0.0.1:8290) and puts a password page in front of it: the right password is
// exchanged for the Host's launch token, which makes DSH mint its own signed session cookie;
// from then on DSH authenticates every request itself. Without a password set, the page
// is skipped only on loopback (a local `npm run web`); on any other address it refuses to start.
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash, timingSafeEqual } from 'node:crypto'
import { HostProcess } from './host-process.mjs'
import { PROFILE } from './profile.mjs'
import { loginPage } from './web-login.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const env = process.env
// MOCHOU_* settings; the DSH_BOT_* names from before the Mochou rename still work.
const setting = name => env[`MOCHOU_${name}`] ?? env[`DSH_BOT_${name}`]
// New installs keep their data in ~/.mochou; one made before the rename keeps ~/.dsh-bot.
const defaultData = () => {
  const fresh = join(homedir(), '.mochou')
  const legacy = join(homedir(), '.dsh-bot')
  return !existsSync(fresh) && existsSync(legacy) ? legacy : fresh
}
const dataDir = setting('DATA') ?? defaultData()
const bind = setting('WEB_HOST') ?? '127.0.0.1'
const port = Number(setting('WEB_PORT') ?? 8290)
const password = setting('PASSWORD') ?? ''
const loopback = ['127.0.0.1', '::1', 'localhost'].includes(bind)
if (!password && !loopback) {
  console.error('mochou web: set MOCHOU_PASSWORD to listen on a non-loopback address.')
  process.exit(1)
}

const digest = value => createHash('sha256').update(String(value)).digest()
const passwordOk = value => password !== '' && timingSafeEqual(digest(value), digest(password))

// Slow down guessing: per client address, at most 5 wrong tries per 10 minutes.
const failures = new Map()
const blocked = (ip) => {
  const now = Date.now()
  const recent = (failures.get(ip) ?? []).filter(at => now - at < 10 * 60_000)
  failures.set(ip, recent)
  return recent.length >= 5
}

async function main() {
  const profileDir = join(dataDir, 'profiles', PROFILE)
  mkdirSync(profileDir, { recursive: true })
  const pnpm = join(here, '..', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
  const host = new HostProcess({
    entry: join(here, 'host.mjs'), cwd: profileDir, pnpm,
    // The access password stays in this process; the Host never sees it.
    env: { ...Object.fromEntries(Object.entries(env).filter(([name]) => name !== 'MOCHOU_PASSWORD' && name !== 'DSH_BOT_PASSWORD')), DSH_HOME: dataDir, DS_BOT_PORT: setting('HOST_PORT') ?? '0', DS_BOT_WEB: '1', ...(setting('WORKSPACE') ? { DS_BOT_WORKSPACE: setting('WORKSPACE') } : {}) },
    onFailure: (error) => { console.error(`mochou web: the Host stopped: ${error.message}`); process.exit(1) },
  })
  const ready = await host.start()
  const launch = new URL(ready.url)
  const token = launch.searchParams.get('token')
  const target = { host: launch.hostname, port: Number(launch.port) }

  const forward = (req, res) => {
    const upstream = httpRequest({ ...target, method: req.method, path: req.url, headers: req.headers }, (answer) => {
      // An unauthenticated page load gets the password page instead of DSH's bare 401.
      if (answer.statusCode === 401 && req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
        answer.resume()
        res.writeHead(302, { location: '/login' }).end()
        return
      }
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    })
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502).end('Host unavailable') })
    req.pipe(upstream)
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/login' && req.method === 'GET') {
      if (!password) { res.writeHead(302, { location: `/?token=${token}` }).end(); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(loginPage({ error: url.searchParams.has('wrong'), wait: url.searchParams.has('wait') }))
      return
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress ?? '?'
      let body = ''
      req.on('data', (chunk) => { body += chunk; if (body.length > 4096) req.destroy() })
      req.on('end', () => {
        if (blocked(ip)) { res.writeHead(303, { location: '/login?wait' }).end(); return }
        const given = new URLSearchParams(body).get('password') ?? ''
        if (!passwordOk(given)) { failures.get(ip).push(Date.now()); res.writeHead(303, { location: '/login?wrong' }).end(); return }
        failures.delete(ip)
        // DSH exchanges the launch token for its signed cookie and redirects to a clean URL.
        res.writeHead(303, { location: `/?token=${token}` }).end()
      })
      return
    }
    // The token is only handed out after the password; a guessed ?token= still has to match.
    forward(req, res)
  })
  // WebSockets (DSH's live connection) go straight through; DSH checks the cookie.
  server.on('upgrade', (req, socket, head) => {
    const upstream = connect(target.port, target.host, () => {
      upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map(item => `${k}: ${item}`)).join('\r\n')}\r\n\r\n`)
      if (head?.length) upstream.write(head)
      upstream.pipe(socket).pipe(upstream)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })
  server.listen(port, bind, () => {
    console.log(`mochou web: http://${bind.includes(':') ? `[${bind}]` : bind}:${port}/${password ? 'login' : `login (no password: loopback only)`}`)
  })
  const stop = async () => { server.close(); await host.stop().catch(() => {}); process.exit(0) }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

main().catch((error) => { console.error(error); process.exit(1) })
