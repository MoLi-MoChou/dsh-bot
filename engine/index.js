// dsh-bot 的原生宿主插件：在 DSH 引擎内部运行，对外只暴露一个很小的 HTTP + SSE 接口给我们自己的界面。
// 所有直接用到 DSH 接口的地方都集中在 engine/ 下（index.js 与 lib/*.js）。
// 事件名参照 DS Bot ds-bot/src/host/feed.js、approvals.js、channel.js（Apache-2.0，见 NOTICE）。
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore } from './lib/store.js'
import { createModels } from './lib/models.js'
import { createMemory } from './lib/memory.js'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-bot-engine'
export const inject = ['sessionController', 'sessions', 'settings', 'credentials', 'llm', 'agentDefaultModel', 'systemPrompt', 'permissionPresets', 'fileUploads', 'tools']

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const MAX_BODY = 40 * 1024 * 1024

export function apply(ctx, config = {}) {
  const home = join(process.env.DSH_HOME ?? '.', 'dsh-bot')
  mkdirSync(home, { recursive: true })
  const store = createStore(home)
  const models = createModels(ctx)
  // 会话会沿用自己上次请求时的模型；界面里只有一个“默认模型”，所以发送前让会话跟上当前默认。
  const applied = new Map()
  const followDefault = async (sessionId) => {
    const own = store.get(sessionId)?.model
    const want = own ?? ctx.agentDefaultModel.currentSelection()
    const key = `${want.provider}/${want.model}/${want.reasoningEffort ?? ''}`
    if (applied.get(sessionId) === key) return
    // DSH 的 selectModel 会顺手把选择存成全局默认；会话自己的选择不该改默认，所以存完再还原。
    const before = ctx.agentDefaultModel.currentSelection()
    try {
      await ctx.sessionController.selectModel({ sessionId, ...want })
      applied.set(sessionId, key)
      if (own) { await new Promise(r => setTimeout(r, 30)); await ctx.agentDefaultModel.saveSelection(before) }
    } catch (e) { ctx.logger?.warn?.(`dsh-bot: 切换会话模型失败：${e?.message ?? e}`) }
  }
  const memory = createMemory(join(home, 'memory'))
  const prefsPath = join(home, 'prefs.json')
  const prefs = { theme: 'deepseek', accent: null, motion: 'normal', cwd: process.env.DSH_BOT_CWD ?? join(home, 'work'), ...(existsSync(prefsPath) ? JSON.parse(readFileSync(prefsPath, 'utf8')) : {}) }
  const savePrefs = () => writeFileSync(prefsPath, JSON.stringify(prefs, null, 2))
  const debug = process.env.DSH_BOT_DEBUG ? (k, v) => appendFileSync(join(home, 'events.log'), JSON.stringify({ k, v }, (key, val) => (key === 'agent' || key === 'session' || key === 'signal' ? undefined : val)) + '\n') : () => {}

  // 记忆作为运行时上下文注入每一步
  // 记忆专用工具：直接写 dsh-bot 自己的两个记忆文件，不经过文件沙箱，所以不会弹审批。
  ctx.tools.register(defineTool({
    name: 'memory_write',
    description: 'Update your long-term memory about the user. file "profile" holds stable facts and preferences (use mode "replace" with the full new text); file "journal" holds dated notes (use mode "append" with one short line). Never store secrets.',
    parameters: {
      file: { type: 'string', enum: ['profile', 'journal'], required: true, description: 'Which memory file to update.' },
      mode: { type: 'string', enum: ['append', 'replace'], required: true, description: 'append a line, or replace the whole file.' },
      content: { type: 'string', required: true, description: 'Text to write.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { file: { type: 'string', required: true }, mode: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `已更新记忆：${value.file}（${value.mode}）` }],
    },
    async execute(args) { const r = memory.update(args.file, args.mode, args.content); publish('memory', memory.read()); return r },
  }))
  ctx.effect(() => ctx.systemPrompt.context({ name: 'dsh-bot:memory', order: 900, interpolate: false, text: () => memory.context() }), 'dsh-bot: memory context')

  const clients = new Set()
  const publish = (event, data) => { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
  const running = new Map() // sessionId -> 开始时间
  const sidOf = agent => agent?.session?.id ?? agent?.id

  function push(sid, item) {
    store.push(sid, item)
    const text = item.kind === 'bot' || item.kind === 'user' ? item.text : ''
    const row = store.edit(sid, { updatedAt: item.time ?? Date.now(), ...(text ? { preview: text.replace(/```[\s\S]*?(```|$)/g, '[卡片]').replace(/\s+/g, ' ').slice(0, 80) } : {}) })
    publish('item', { sessionId: sid, item })
    if (row) publish('conversation', row)
  }

  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    const sid = sidOf(agent)
    if (!store.has(sid)) return
    if (frame.type === 'start') publish('stream', { sessionId: sid, phase: 'start', attemptId: frame.attemptId })
    else if (frame.type === 'end') publish('stream', { sessionId: sid, phase: 'end', attemptId: frame.attemptId })
    else if (frame.type === 'chunk') {
      const c = frame.chunk ?? {}
      if (c.type === 'text-delta') publish('stream', { sessionId: sid, attemptId: frame.attemptId, text: c.text })
      else if (/reason|think/i.test(c.type ?? '')) publish('stream', { sessionId: sid, attemptId: frame.attemptId, reasoning: c.text ?? c.delta ?? '' })
    }
  })

  const setRunning = (sid, on) => {
    if (on) running.set(sid, running.get(sid) ?? Date.now()); else running.delete(sid)
    publish('status', { sessionId: sid, running: on, since: running.get(sid) ?? null })
  }

  ctx.on('session/event', (session, event) => {
    debug('event', { sid: session.id, event })
    const sid = session.id
    if (!store.has(sid)) return
    if (event.type === 'turn/start') setRunning(sid, true)
    if (event.type === 'turn/end') {
      setRunning(sid, false)
      const r = event.data?.reason
      if (r?.kind === 'error') push(sid, { kind: 'error', text: errorText(r.error), time: event.time ?? Date.now() })
      else if (r?.kind === 'aborted') push(sid, { kind: 'notice', text: '已停止', time: event.time ?? Date.now() })
      else if (r?.kind === 'max-tokens') push(sid, { kind: 'notice', text: '回复太长，被截断了', time: event.time ?? Date.now() })
    }
    if (event.type === 'session/title' && event.data?.title) {
      const row = store.get(sid)
      if (row && !row.renamed) { store.edit(sid, { title: String(event.data.title).slice(0, 60) }); publish('conversation', store.get(sid)) }
    }
    for (const item of toItems(sid, event)) push(sid, item)
  })

  const errorText = (e) => {
    const code = e?.code ?? e?.kind ?? ''
    const msg = e?.message ?? (typeof e === 'string' ? e : JSON.stringify(e ?? {}))
    const hint = /MISSING_CREDENTIAL|credential/i.test(code + msg) ? '（还没有配置 API key，去“设置 → 模型”填一下）'
      : /UNKNOWN_MODEL|unknown model|no.*route|not registered/i.test(code + msg) ? '（还没有可用的模型，去“设置 → 模型”添加一个）' : ''
    return `模型请求失败：${msg}${hint}`
  }

  // 审批：DSH 的审批请求交给界面回答
  const pending = new Map()
  ctx.on('approval/request', (request) => {
    const sid = sidOf(request.agent)
    if (!store.has(sid)) return undefined
    const id = randomUUID()
    const entry = { id, sessionId: sid, tool: String(request.toolName ?? ''), reason: String(request.reason ?? ''), callId: request.callId, input: lastCalls.get(request.callId) ?? [...lastCalls.values()].at(-1) ?? null }
    return new Promise((resolveOutcome) => {
      const done = (outcome) => { if (!pending.has(id)) return; pending.delete(id); publish('approval-done', { id, sessionId: sid, outcome }); resolveOutcome(outcome) }
      pending.set(id, { ...entry, done })
      publish('approval', entry)
      request.signal?.addEventListener('abort', () => done('cancelled'), { once: true })
    })
  }, { prepend: true })

  const lastCalls = new Map()
  function toItems(sid, event) {
    const out = []
    const d = event.data ?? {}
    const time = event.time ?? Date.now()
    const text = content => (content ?? []).filter(p => p.type === 'text').map(p => p.text).join('')
    if (event.type === 'user/message' && d.source?.kind === 'user') {
      const files = (d.content ?? []).filter(p => p.type === 'image' || p.type === 'file').map(p => ({
        kind: p.type, id: p.attachment?.attachmentId ?? null, name: p.attachment?.name ?? p.name ?? (p.type === 'image' ? '图片' : '文件'),
        mediaType: p.attachment?.mediaType ?? p.mediaType ?? null, size: p.attachment?.bytes ?? null, width: p.attachment?.width ?? null, height: p.attachment?.height ?? null,
      }))
      out.push({ kind: 'user', text: text(d.content), time, ...(files.length ? { files } : {}) })
    }
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

  async function createConversation() {
    mkdirSync(prefs.cwd, { recursive: true })
    const { sessionId } = await ctx.sessionController.create({ cwd: prefs.cwd })
    if (!store.has(sessionId)) store.add({ id: sessionId, title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), preview: '', cwd: prefs.cwd })
    store.current = sessionId
    publish('conversation', store.get(sessionId))
    return store.get(sessionId)
  }
  const need = (id) => { if (!store.has(id)) throw new Error('这个对话不存在了'); return id }
  const sessionOf = id => ctx.sessions.get?.(id)

  async function permission(id) {
    const catalog = ctx.permissionPresets.catalog()
    const session = id ? sessionOf(id) : undefined
    return { catalog, current: session ? ctx.permissionPresets.current(session) : ctx.permissionPresets.defaultPreset, default: ctx.permissionPresets.defaultPreset }
  }

  const state = () => ({
    conversations: store.list(), current: store.current,
    running: Object.fromEntries(running), approvals: [...pending.values()].map(({ done, ...e }) => e),
    prefs, memoryPaths: memory.files,
  })

  const routes = {
    'GET /api/state': async () => state(),
    'POST /api/chat': async ({ id }) => ({ id: need(id), items: store.items(id), approvals: [...pending.values()].filter(a => a.sessionId === id).map(({ done, ...e }) => e), running: running.has(id) ? running.get(id) : null }),
    'POST /api/open': async ({ id }) => { store.current = need(id); return true },
    'POST /api/new': async () => {
      // 当前对话还是空的就直接复用，不会堆出一串空对话
      const cur = store.current && store.get(store.current)
      if (cur && store.items(cur.id).length === 0 && cur.cwd === prefs.cwd) return cur
      return await createConversation()
    },
    'POST /api/conversation/model': async ({ id, ref, effort }) => {
      need(id)
      const def = ctx.agentDefaultModel.currentSelection()
      const [provider, ...rest] = String(ref ?? '').split('/')
      const model = rest.join('/')
      const followsDefault = !ref || (provider === def.provider && model === def.model && !effort)
      store.edit(id, { model: followsDefault ? null : { provider, model, ...(effort ? { reasoningEffort: effort } : {}) } })
      publish('conversation', store.get(id)); return store.get(id)
    },
    'POST /api/rename': async ({ id, title }) => {
      const value = String(title ?? '').trim().slice(0, 60)
      if (!value) throw new Error('标题不能为空')
      need(id)
      await ctx.sessionController.rename({ sessionId: id, title: value }).catch(() => {})
      store.edit(id, { title: value, renamed: true }); publish('conversation', store.get(id)); return true
    },
    'POST /api/delete': async ({ id }) => {
      need(id)
      if (running.has(id)) { try { ctx.sessionController.cancel({ sessionId: id }) } catch { /* */ } }
      store.remove(id); publish('removed', { id, current: store.current }); return { current: store.current }
    },
    'POST /api/send': async ({ id, text, files }) => {
      const body = String(text ?? '').trim()
      const list = Array.isArray(files) ? files : []
      if (!body && list.length === 0) throw new Error('空消息')
      const sessionId = id && store.has(id) ? id : (await createConversation()).id
      const content = []
      for (const f of list) {
        const data = Buffer.from(String(f.data ?? ''), 'base64')
        if (IMAGE_TYPES.has(f.type)) content.push({ type: 'image', mediaType: f.type, data: data.toString('base64'), name: f.name })
        else {
          async function* bytes() { yield new Uint8Array(data) }
          const receipt = await ctx.fileUploads.uploadStream({ sessionId, data: bytes(), name: String(f.name ?? 'file') })
          content.push({ type: 'file', receiptId: receipt.receiptId ?? receipt.id })
        }
      }
      if (body) content.push({ type: 'text', text: body })
      store.current = sessionId
      try {
        await followDefault(sessionId)
        await ctx.sessionController.prompt({ requestId: randomUUID(), sessionId, mode: 'queue', content, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, AbortSignal.timeout(60_000))
      } catch (error) {
        const msg = String(error?.message ?? error)
        if (/does not support image input/i.test(msg)) throw new Error('当前模型不支持图片。去“设置 → 模型”给这个模型打开“图片”，或换一个支持图片的模型。')
        if (/credential|api key/i.test(msg)) throw new Error('当前模型还没有可用的 API key，去“设置 → 模型”配置一下。')
        throw error
      }
      return { id: sessionId }
    },
    'POST /api/cancel': async ({ id }) => { ctx.sessionController.cancel({ sessionId: need(id) }); return true },
    'POST /api/approve': async ({ id, choice }) => {
      const p = pending.get(id)
      if (!p) throw new Error('这个审批已经结束')
      p.done(choice === 'allow' ? 'allowed-once' : 'rejected')
      return true
    },
    // 模型配置
    'GET /api/models': async () => models.view(),
    'POST /api/models/save': async body => { const r = await models.save(body); return { ...r, view: await models.view() } },
    'POST /api/models/remove': async ({ id }) => { await models.remove(id); return models.view() },
    'POST /api/models/fetch': async body => models.fetchModels(body),
    'POST /api/models/test': async body => models.test(body),
    'POST /api/models/default': async (body) => { await models.setDefault(body); return models.view() },
    'POST /api/models/key': async (body) => { await models.setKey(body); return models.view() },
    // 偏好、工作目录、权限
    'POST /api/prefs': async (patch) => {
      for (const k of ['theme', 'accent', 'motion']) if (k in patch) prefs[k] = patch[k]
      if ('cwd' in patch) {
        const dir = resolve(String(patch.cwd ?? '').trim())
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        if (!statSync(dir).isDirectory()) throw new Error('这不是一个文件夹')
        prefs.cwd = dir
      }
      savePrefs(); publish('prefs', prefs); return prefs
    },
    'POST /api/permission': async ({ id }) => permission(id),
    'POST /api/permission/set': async ({ id, preset, scope }) => {
      if (!ctx.permissionPresets.names.includes(preset)) throw new Error('没有这个权限档位')
      if (scope === 'default' || !id) await ctx.settings.update('permission', { defaultPreset: preset })
      if (id) {
        const session = sessionOf(need(id))
        if (session) ctx.permissionPresets.set(session, preset)
      }
      return permission(id)
    },
    // 记忆
    'GET /api/memory': async () => memory.read(),
    'POST /api/memory': async ({ kind, text }) => { memory.write(kind, text); return memory.read() },
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const path = url.pathname
    if (path === '/api/feed') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      res.write('event: hello\ndata: {}\n\n')
      clients.add(res)
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
      req.on('close', () => { clearInterval(ping); clients.delete(res) })
      return
    }
    if (path === '/api/attachment') {
      try {
        const v = await ctx.sessionController.attachment({ sessionId: url.searchParams.get('sid'), attachmentId: url.searchParams.get('aid') })
        res.writeHead(200, { 'content-type': v.attachment?.mediaType ?? 'application/octet-stream', 'cache-control': 'private, max-age=86400' })
        res.end(Buffer.from(v.data, 'base64'))
      } catch (error) { debug('attachment-error', String(error?.stack ?? error)); res.writeHead(404); res.end() }
      return
    }
    const route = routes[`${req.method} ${path}`]
    if (route) {
      const chunks = []
      let size = 0
      for await (const c of req) { size += c.length; if (size > MAX_BODY) { res.writeHead(413); res.end(); return } chunks.push(c) }
      const raw = Buffer.concat(chunks).toString('utf8')
      res.writeHead(200, { 'content-type': 'application/json' })
      try { res.end(JSON.stringify({ ok: true, value: await route(raw ? JSON.parse(raw) : {}) })) }
      catch (error) { debug('route-error', { path, message: String(error?.stack ?? error) }); res.end(JSON.stringify({ ok: false, error: { message: String(error?.message ?? error) } })) }
      return
    }
    const file = join(UI_DIR, path === '/' ? 'index.html' : decodeURIComponent(path))
    if (file.startsWith(UI_DIR) && existsSync(file) && statSync(file).isFile()) { res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }); res.end(readFileSync(file)); return }
    res.writeHead(404); res.end()
  })
  const host = config.host ?? process.env.DSH_BOT_HOST ?? '127.0.0.1'
  const port = config.port ?? 8787
  server.listen(port, host, () => console.log(`dsh-bot on http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`))
  ctx.effect(() => () => server.close(), 'dsh-bot: http server')
}
