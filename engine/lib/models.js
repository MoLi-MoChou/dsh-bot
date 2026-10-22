// 模型配置：每个“配置档”是 DSH llm-pi-ai 的一条供应商路由（写进 DSH 设置），
// API key 存进 DSH 凭据库（只保存引用名，配置文件里没有明文）；默认模型写进 agent-default-model。
import { credentialRef } from '@deepseek-ai/dsh-credentials'

const NS = 'llm-pi-ai'
export const PRESETS = {
  deepseek: { name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', api: 'openai-completions', models: ['deepseek-chat', 'deepseek-reasoner'], compat: { thinkingFormat: 'deepseek' } },
  openai: { name: 'OpenAI 兼容', baseURL: '', api: 'openai-completions', models: [] },
}
const PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages']
const keyRef = id => `DSHBOT_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
const slug = text => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export function createModels(ctx) {
  const section = () => ctx.settings.describe({ redactSecrets: true }).find(d => d.ns === NS)
  const providers = () => {
    const d = section()
    const user = d?.user?.providers ?? {}
    return { all: d?.value?.providers ?? {}, user, revision: d?.revision }
  }
  const resolveKey = async (id) => (await ctx.credentials.resolve(credentialRef(keyRef(id))))?.value

  async function view() {
    const { all, user } = providers()
    const def = ctx.agentDefaultModel.currentSelection()
    let catalog = null
    try { catalog = await ctx.sessionController.modelCatalog() } catch { /* 无模型时可能失败 */ }
    const profiles = await Promise.all(Object.entries(all).map(async ([id, p]) => {
      const ref = p.apiKeyEnv ?? keyRef(id)
      const info = await ctx.credentials.describe(credentialRef(ref)).catch(() => ({ configured: false, writable: false }))
      const fail = catalog?.failures?.find(f => f.id === id)
      return {
        id, name: p.displayName ?? id, preset: p.compat?.thinkingFormat === 'deepseek' && /deepseek\.com/.test(p.baseURL ?? '') ? 'deepseek' : 'openai',
        baseURL: p.baseURL ?? '', api: p.api ?? 'openai-completions', models: (p.models ?? []).map(m => ({ id: m.id, name: m.name ?? m.id, reasoning: m.reasoningEfforts !== undefined, image: (m.input ?? []).includes('image') })),
        key: { configured: info.configured === true, writable: info.writable !== false, source: info.source ?? null },
        editable: id in user, routable: catalog?.routableProviders?.includes(id) ?? false, error: fail?.message ?? null,
      }
    }))
    // 给会话模型菜单（DS Bot 的 ModelMenu）用的扁平目录：只列能路由的服务。
    const EFFORTS = { efforts: [{ id: 'off', name: '不思考' }, { id: 'high', name: '深度思考' }] }
    const catalogModels = profiles.filter(p => p.routable).flatMap(p => p.models.map(m => ({ ref: `${p.id}/${m.id}`, name: m.name, provider: p.id, providerName: p.name, ...(m.reasoning ? { reasoning: EFFORTS } : {}) })))
    return { presets: PRESETS, protocols: PROTOCOLS, profiles, default: def ?? null, catalog: catalogModels }
  }

  async function save(body) {
    const preset = PRESETS[body.preset] ?? PRESETS.openai
    const name = String(body.name ?? '').trim() || preset.name
    const baseURL = String(body.baseURL ?? '').trim().replace(/\/+$/, '')
    if (!/^https?:\/\/\S+$/.test(baseURL)) throw new Error('请填写正确的接口地址（以 http:// 或 https:// 开头）')
    const api = PROTOCOLS.includes(body.api) ? body.api : 'openai-completions'
    const models = (body.models ?? []).map(m => (typeof m === 'string' ? { id: m } : m)).filter(m => String(m.id ?? '').trim())
    if (models.length === 0) throw new Error('至少选择或填写一个模型')
    const { all } = providers()
    let id = body.id
    if (!id) {
      const base = slug(name) || (body.preset === 'deepseek' ? 'deepseek' : 'custom')
      id = base; let n = 2
      while (id in all) id = `${base}-${n++}`
    }
    const value = {
      displayName: name, api, baseURL, apiKeyEnv: keyRef(id),
      ...(body.preset === 'deepseek' ? { compat: { thinkingFormat: 'deepseek' } } : {}),
      models: models.map(m => ({ id: String(m.id).trim(), name: String(m.name ?? m.id).trim(), ...(m.reasoning ? { reasoningEfforts: { off: null, high: 'high' } } : {}), ...(m.image ? { input: ['text', 'image'] } : {}) })),
    }
    const key = typeof body.key === 'string' ? body.key.trim() : ''
    if (key) await ctx.credentials.set(credentialRef(keyRef(id)), key)
    await ctx.settings.mutate(NS, [{ op: 'set', path: ['providers', id], value }])
    // 第一个配置档自动成为默认模型
    const def = ctx.agentDefaultModel.currentSelection()
    if (body.makeDefault || !def?.provider || !(def.provider in all)) await ctx.agentDefaultModel.saveSelection({ provider: id, model: value.models[0].id })
    return { id }
  }

  async function remove(id) {
    const { user } = providers()
    if (!(id in user)) throw new Error('这个配置档不是在这里添加的，不能删除')
    await ctx.settings.mutate(NS, [{ op: 'unset', path: ['providers', id] }])
    await ctx.credentials.unset(credentialRef(keyRef(id))).catch(() => {})
    const def = ctx.agentDefaultModel.currentSelection()
    if (def?.provider === id) {
      const next = Object.entries(providers().all)[0]
      if (next) await ctx.agentDefaultModel.saveSelection({ provider: next[0], model: next[1].models?.[0]?.id })
    }
  }

  async function endpoint(body) {
    const stored = body.id ? providers().all[body.id] : undefined
    const baseURL = String(body.baseURL ?? stored?.baseURL ?? '').trim().replace(/\/+$/, '')
    if (!/^https?:\/\/\S+$/.test(baseURL)) throw new Error('请先填写接口地址')
    const typed = typeof body.key === 'string' ? body.key.trim() : ''
    const apiKey = typed || (body.id ? await resolveKey(body.id) : undefined)
    return { baseURL, apiKey, api: PROTOCOLS.includes(body.api) ? body.api : stored?.api ?? 'openai-completions' }
  }

  async function fetchModels(body) {
    const { baseURL, apiKey, api } = await endpoint(body)
    const list = await ctx.llm.discoverModels(NS, { baseURL, api, ...(apiKey ? { apiKey } : {}) }, AbortSignal.timeout(20_000))
    return list.map(m => ({ id: m.id, name: m.name ?? m.id, image: (m.inputModalities ?? []).includes('image') }))
  }

  // 测试连接：用这把 key 真实发一次最小的对话请求（1 个 token），返回耗时或服务端的报错原文。
  async function test(body) {
    const { baseURL, apiKey, api } = await endpoint(body)
    const model = String(body.model ?? '').trim()
    if (!model) throw new Error('请先选择一个模型')
    if (!apiKey) return { ok: false, message: '还没有填写 API key' }
    const started = Date.now()
    const anthropic = api === 'anthropic-messages'
    const url = anthropic ? `${baseURL.replace(/\/v1$/, '')}/v1/messages` : `${baseURL}/chat/completions`
    const headers = anthropic ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } : { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }
    const payload = anthropic ? { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] } : { model, max_tokens: 1, stream: false, messages: [{ role: 'user', content: 'ping' }] }
    if (api === 'openai-responses') {
      const res = await fetch(`${baseURL}/responses`, { method: 'POST', headers, body: JSON.stringify({ model, input: 'ping', max_output_tokens: 16 }), signal: AbortSignal.timeout(30_000) }).catch(e => ({ ok: false, status: 0, text: async () => String(e.message) }))
      return res.ok ? { ok: true, ms: Date.now() - started } : { ok: false, message: await describe(res) }
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) }).catch(e => ({ ok: false, status: 0, text: async () => `无法连接：${e.cause?.code ?? e.message}` }))
    return res.ok ? { ok: true, ms: Date.now() - started } : { ok: false, message: await describe(res) }
  }
  async function describe(res) {
    const raw = await res.text().catch(() => '')
    let msg = raw
    try { const j = JSON.parse(raw); msg = j.error?.message ?? j.message ?? raw } catch { /* 原文 */ }
    const hint = res.status === 401 || res.status === 403 ? 'API key 无效或没有权限' : res.status === 404 ? '地址或模型不存在' : res.status === 402 ? '余额不足' : res.status === 429 ? '请求太频繁或额度用完' : ''
    return [res.status ? `HTTP ${res.status}` : '', hint, String(msg).slice(0, 300)].filter(Boolean).join(' · ')
  }

  async function setDefault(body) {
    const { all } = providers()
    const p = all[body.provider]
    if (!p) throw new Error('没有这个配置档')
    if (!(p.models ?? []).some(m => m.id === body.model)) throw new Error('这个配置档里没有该模型')
    await ctx.agentDefaultModel.saveSelection({ provider: body.provider, model: body.model, ...(body.reasoningEffort ? { reasoningEffort: body.reasoningEffort } : {}) })
  }

  async function setKey(body) {
    if (!providers().all[body.id]) throw new Error('没有这个配置档')
    const ref = credentialRef(keyRef(body.id))
    if (body.key) await ctx.credentials.set(ref, String(body.key).trim())
    else await ctx.credentials.unset(ref)
  }

  return { view, save, remove, fetchModels, test, setDefault, setKey }
}
