// dsh-bot 的原生宿主插件：在 DSH 引擎内部运行，对外只暴露一个很小的 HTTP + SSE 接口给我们自己的界面。
// 不依赖 DSH Web 的插槽；事件名参照 DS Bot ds-bot/src/host/feed.js、approvals.js、channel.js（Apache-2.0）。
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-bot-engine'
export const inject = ['sessionController', 'sessions']

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }

export function apply(ctx, config = {}) {
  const home = join(process.env.DSH_HOME ?? '.', 'dsh-bot')
  mkdirSync(home, { recursive: true })
  const statePath = join(home, 'state.json')
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { sessionId: null, items: [] }
  const save = () => writeFileSync(statePath, JSON.stringify(state))
  const debug = process.env.DSH_BOT_DEBUG ? (k, v) => appendFileSync(join(home, 'events.log'), JSON.stringify({ k, v }, (key, val) => (key === 'agent' || key === 'session' || key === 'signal' ? undefined : val)) + '\n') : () => {}

  const clients = new Set()
  const publish = (event, data) => { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
  const push = (item) => { state.items.push(item); save(); publish('item', item) }

  // 流式：文字、推理增量
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    debug('stream', { id: agent.id, sid: agent.session?.id, frame })
    if (agent.id !== state.sessionId && agent.session?.id !== state.sessionId) return
    if (frame.type === 'start') publish('stream', { phase: 'start', attemptId: frame.attemptId })
    else if (frame.type === 'end') publish('stream', { phase: 'end', attemptId: frame.attemptId })
    else if (frame.type === 'chunk') {
      const c = frame.chunk ?? {}
      if (c.type === 'text-delta') publish('stream', { attemptId: frame.attemptId, text: c.text })
      else if (/reason|think/i.test(c.type ?? '')) publish('stream', { attemptId: frame.attemptId, reasoning: c.text ?? c.delta ?? '' })
    }
  })

  // 已提交的会话事件：用户消息、助手消息、工具调用与结果
  ctx.on('session/event', (session, event) => {
    debug('event', { sid: session.id, event })
    if (session.id !== state.sessionId) return
    for (const item of toItems(event)) push(item)
  })
  ctx.on('agent/status', ({ agent }) => {
    if (agent.id === state.sessionId) publish('status', { status: agent.status ?? null })
  })

  // 审批：所有请求都交给我们的界面回答
  const pending = new Map()
  ctx.on('approval/request', (request) => {
    const sid = request.agent?.session?.id ?? request.agent?.id
    if (sid !== state.sessionId) return undefined
    const id = randomUUID()
    const entry = { id, tool: String(request.toolName ?? ''), reason: String(request.reason ?? ''), callId: request.callId, input: lastCalls.get(request.callId) ?? [...lastCalls.values()].at(-1) ?? null }
    debug('approval', { entry, keys: Object.keys(request) })
    return new Promise((resolve) => {
      const done = (outcome) => { if (!pending.has(id)) return; pending.delete(id); publish('approval-done', { id, outcome }); resolve(outcome) }
      pending.set(id, { ...entry, done })
      publish('approval', entry)
      request.signal?.addEventListener('abort', () => done('cancelled'), { once: true })
    })
  }, { prepend: true })

  const lastCalls = new Map()
  function toItems(event) {
    const out = []
    const d = event.data ?? {}
    const time = event.time ?? Date.now()
    const text = content => (content ?? []).filter(p => p.type === 'text').map(p => p.text).join('')
    if (event.type === 'user/message' && d.source?.kind === 'user') out.push({ kind: 'user', text: text(d.content), time })
    if (event.type === 'assistant/message') {
      for (const part of d.message?.content ?? []) {
        if (part.type === 'reasoning' && part.text?.trim()) out.push({ kind: 'reasoning', text: part.text, time })
        if (part.type === 'text' && part.text?.trim()) out.push({ kind: 'bot', text: part.text, time })
        if (part.type === 'tool-call') { lastCalls.set(part.id, part.arguments); out.push({ kind: 'tool', id: part.id, name: part.name, input: part.arguments, time }) }
      }
    }
    if (event.type === 'tool/result') out.push({ kind: 'tool-result', id: d.message?.toolCallId, output: text(d.message?.content).slice(0, 4000), error: d.message?.isError === true, time })
    return out
  }
  const summarize = v => (typeof v === 'string' ? v : JSON.stringify(v ?? '')).slice(0, 4000)

  async function ensureSession() {
    if (state.sessionId) return state.sessionId
    const cwd = process.env.DSH_BOT_CWD ?? join(home, 'work')
    mkdirSync(cwd, { recursive: true })
    const { sessionId } = await ctx.sessionController.create({ cwd })
    state.sessionId = sessionId; state.items = []; save()
    return sessionId
  }

  const routes = {
    'GET /api/chat': async () => ({ sessionId: await ensureSession(), items: state.items, approvals: [...pending.values()].map(({ done, ...e }) => e) }),
    'POST /api/send': async (body) => {
      const text = String(body.text ?? '').trim()
      if (!text) throw new Error('空消息')
      const sessionId = await ensureSession()
      await ctx.sessionController.prompt({ requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }] }, AbortSignal.timeout(30_000))
      return true
    },
    'POST /api/approve': async (body) => {
      const p = pending.get(body.id)
      if (!p) throw new Error('这个审批已经结束')
      p.done(body.choice === 'allow' ? 'allowed-once' : 'rejected')
      return true
    },
    'POST /api/reset': async () => { state.sessionId = null; save(); return await ensureSession() },
  }

  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    if (path === '/api/feed') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      res.write('event: hello\ndata: {}\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    const route = routes[`${req.method} ${path}`]
    if (route) {
      let raw = ''
      for await (const c of req) raw += c
      try { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, value: await route(raw ? JSON.parse(raw) : {}) })) }
      catch (error) { res.end(JSON.stringify({ ok: false, error: { message: String(error?.message ?? error) } })) }
      return
    }
    // 静态界面（vite build 输出）
    const file = join(UI_DIR, path === '/' ? 'index.html' : path)
    if (file.startsWith(UI_DIR) && existsSync(file)) { res.writeHead(200, { 'content-type': MIME[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream' }); res.end(readFileSync(file)); return }
    res.writeHead(404); res.end()
  })
  server.listen(config.port ?? 8787, '127.0.0.1', () => console.log(`dsh-bot host on http://127.0.0.1:${config.port ?? 8787}`))
  ctx.effect(() => () => server.close(), 'dsh-bot: http server')
}
