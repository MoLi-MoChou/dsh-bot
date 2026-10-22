// 本地 OpenAI 兼容的模拟模型：仅用于 spike，在没有真实模型 key 时验证 DSH 的流式、推理、工具调用、审批和 OpenUI 链路。
import http from 'node:http'
import { writeFileSync } from 'node:fs'

const PORT = Number(process.env.MOCK_PORT ?? 4010)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const chunks = (s, n = 6) => s.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g')) ?? []

const OPENUI = [
  '下面是本周的任务概览，可以直接在卡片里勾选或提交：',
  '',
  '```openui',
  'root = Card([title, status, progress, table, facts, note, pri, done, actions, quick])',
  'title = CardHeader("本周任务", "3 项进行中 · 更新于今天")',
  'status = Stack([t1, t2], "row", "s")',
  't1 = Tag("进行中", "accent")',
  't2 = Tag("按计划", "success")',
  'progress = Progress(62, "整体进度")',
  'table = Table(["任务", "负责人", "状态"], [["接入 DSH 引擎", "我", "已完成"], ["复用 DS Bot 界面", "我", "进行中"], ["OpenUI 富消息", "我", "进行中"]])',
  'facts = KeyValue([["截止", "周五"], ["风险", "DSH 仍是预发布版"]])',
  'note = TextArea("note", "给 bot 留句话…", $note, "备注")',
  'pri = Select("pri", ["高", "中", "低"], $pri, "优先级")',
  'done = Checkbox("done", "本周目标已确认", $done)',
  'actions = Buttons([later, send])',
  'later = Button("稍后再说", @ToAssistant("稍后再说"), "secondary")',
  'send = Button("发给 Bot", @ToAssistant("我的备注：" + $note + "（优先级 " + $pri + "）"))',
  'quick = Choices(["看看风险", "排一下下周"])',
  '$note = ""',
  '$pri = "中"',
  '$done = false',
  '```',
].join('\n')

function plan(body) {
  const msgs = body.messages ?? []
  const last = msgs[msgs.length - 1]
  const lastUser = [...msgs].reverse().find(m => m.role === 'user')
  const text = typeof lastUser?.content === 'string' ? lastUser.content : (lastUser?.content ?? []).map(c => c.text ?? '').join('')
  const tools = (body.tools ?? []).map(t => t.function?.name)
  if (!tools.length) return { text: 'DSH Bot 演示会话' } // 标题生成等辅助请求
  const lastCall = [...msgs].reverse().find(m => m.tool_calls?.length)?.tool_calls?.[0]?.function?.name
  if (last?.role === 'tool' && lastCall === 'memory_write') return { text: '记住了，下次会按这个来。' }
  if (last?.role === 'tool') return { reasoning: '命令已经执行完，把结果整理给用户。', text: `命令执行完成，输出如下：\n\n\`\`\`\n${String(last.content).slice(0, 400)}\n\`\`\`\n\n还需要我做什么？` }
  if (/坏卡片/.test(text)) return { text: '这是一张写坏了的卡片：\n\n```openui\nroot = Card(oops\n  this is not openui ((\n```' }
  if (/^记住/.test(text)) return { reasoning: '用户希望我记住一个偏好，写进长期记忆。', text: '好的。', tool: { name: 'memory_write', args: { file: 'journal', mode: 'append', content: text.replace(/^记住[:：，,\s]*/, '') } } }
  if (/^(我的备注|稍后再说|看看风险|排一下)/.test(text)) return { text: `收到：“${text.slice(0, 40)}”。我会把它记在本周任务里。` }
  if (/表格|卡片|openui|任务/i.test(text)) return { reasoning: '用户想看结构化的内容，用 OpenUI 组件输出一张卡片。', text: OPENUI }
  if (/命令|shell|运行|执行/i.test(text)) {
    const bash = tools.find(n => /bash/i.test(n)) ?? tools[0]
    return { reasoning: '需要在工作目录里跑一条 shell 命令，先列出文件再统计。', text: '好，我来运行一条命令看看。', tool: { name: bash, args: { description: '查看系统信息并写一个演示文件', command: 'uname -sr && date > /tmp/dsh-bot-demo.txt && cat /tmp/dsh-bot-demo.txt', sandbox_permissions: 'danger-full-access', justification: '需要在工作目录外写一个演示文件 /tmp/dsh-bot-demo.txt。' } } }
  }
  return { reasoning: '这是普通的问候，简单介绍自己能做什么即可。', text: '你好！我是 DSH Bot，运行在 DeepSeek Harness 引擎上。我可以聊天、读写工作目录里的文件、运行命令（需要你批准），也能用卡片、表格、表单回复你。试试说“运行一条命令”或“给我一张任务卡片”。' }
}

http.createServer(async (req, res) => {
  if (req.url.endsWith('/models')) {
    if (req.headers.authorization !== 'Bearer ' + (process.env.MOCK_KEY ?? 'sk-mock')) { res.writeHead(401); res.end(JSON.stringify({ error: { message: 'Invalid API key' } })); return }
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-chat', object: 'model' }, { id: 'mock-reasoner', object: 'model' }, { id: 'mock-mini', object: 'model' }] })); return
  }
  let raw = ''
  for await (const c of req) raw += c
  const body = JSON.parse(raw || '{}')
  writeFileSync('/tmp/mock-last-request.json', JSON.stringify(body, null, 2))
  if (req.headers.authorization !== 'Bearer ' + (process.env.MOCK_KEY ?? 'sk-mock')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Invalid API key' } })); return }
  if (body.stream === false) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: 'p' }, finish_reason: 'length' }] })); return }
  const p = plan(body)
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const base = { id: 'c' + Date.now(), object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model }
  const send = (delta, finish = null) => res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
  send({ role: 'assistant' })
  for (const c of chunks(p.reasoning ?? '', 4)) { send({ reasoning_content: c }); await sleep(30) }
  for (const c of chunks(p.text ?? '', 5)) { send({ content: c }); await sleep(25) }
  if (p.tool) {
    send({ tool_calls: [{ index: 0, id: 'call_' + Date.now(), type: 'function', function: { name: p.tool.name, arguments: JSON.stringify(p.tool.args) } }] })
    send({}, 'tool_calls')
  } else send({}, 'stop')
  res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } })}\n\n`)
  res.end('data: [DONE]\n\n')
}).listen(PORT, '127.0.0.1', () => console.log('mock llm on', PORT))
