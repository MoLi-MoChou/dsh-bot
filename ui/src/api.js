// 和原生宿主（engine/index.js）通信：POST /api/*，以及 SSE 实时流 /api/feed。
export async function call(path, body) {
  const res = await fetch(`api/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error?.message ?? '请求失败')
  return json.value
}
const EVENTS = ['hello', 'item', 'stream', 'status', 'approval', 'approval-done', 'conversation', 'removed', 'prefs']
export function openFeed(onEvent) {
  const source = new EventSource('api/feed')
  for (const name of EVENTS) source.addEventListener(name, e => onEvent(name, JSON.parse(e.data)))
  return () => source.close()
}
