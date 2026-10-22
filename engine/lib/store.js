// 会话索引与每个会话的界面条目（我们自己存一份已转换好的条目，DSH 保存权威的会话日志）。
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const writeJson = (path, value) => { const tmp = `${path}.tmp`; writeFileSync(tmp, JSON.stringify(value)); renameSync(tmp, path) }
const readJson = (path, fallback) => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback } }

export function createStore(home) {
  const dir = join(home, 'conversations')
  mkdirSync(dir, { recursive: true })
  const indexPath = join(home, 'conversations.json')
  let index = readJson(indexPath, null)
  if (!index) {
    index = { list: [], current: null }
    // spike 的单会话 state.json 迁移成第一条会话
    const legacy = readJson(join(home, 'state.json'), null)
    if (legacy?.sessionId) {
      const first = legacy.items?.find(i => i.kind === 'user')?.text ?? ''
      index.list.push({ id: legacy.sessionId, title: first.slice(0, 40) || '新对话', updatedAt: legacy.items?.at(-1)?.time ?? Date.now(), createdAt: legacy.items?.[0]?.time ?? Date.now(), preview: '' })
      index.current = legacy.sessionId
      writeJson(join(dir, `${safe(legacy.sessionId)}.json`), legacy.items ?? [])
    }
    writeJson(indexPath, index)
  }
  const cache = new Map()
  const saveIndex = () => writeJson(indexPath, index)
  function safe(id) { return String(id).replace(/[^\w.-]/g, '_') }
  const itemsPath = id => join(dir, `${safe(id)}.json`)
  return {
    list: () => [...index.list].sort((a, b) => b.updatedAt - a.updatedAt),
    get: id => index.list.find(c => c.id === id),
    has: id => index.list.some(c => c.id === id),
    get current() { return index.current },
    set current(id) { index.current = id; saveIndex() },
    add(row) { index.list.push(row); saveIndex(); return row },
    edit(id, patch) { const row = index.list.find(c => c.id === id); if (row) { Object.assign(row, patch); saveIndex() } return row },
    remove(id) {
      index.list = index.list.filter(c => c.id !== id)
      if (index.current === id) index.current = this.list()[0]?.id ?? null
      saveIndex(); cache.delete(id); rmSync(itemsPath(id), { force: true })
    },
    items(id) {
      if (!cache.has(id)) cache.set(id, existsSync(itemsPath(id)) ? readJson(itemsPath(id), []) : [])
      return cache.get(id)
    },
    push(id, item) { const list = this.items(id); list.push(item); writeJson(itemsPath(id), list) },
  }
}
