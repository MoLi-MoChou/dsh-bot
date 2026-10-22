// 界面状态：DS Bot 界面模块读的那些数据源（roster、ui、sessions、status、live…）和 actions，
// 由我们的宿主接口 /api/state 与 /api/feed 喂数据。写法参照 DS Bot app/ui/src/team.js（Apache-2.0）。
import { useRef, useSyncExternalStore } from 'react'
import { createSource } from '../../vendor/ds-bot/client/sources.js'
import { registry } from '../../vendor/ds-bot/client/themes.js'
import { call, openFeed } from './api.js'

// 唯一的 bot：DS Bot 的主 bot 外观（鲸鱼）。每个会话在 roster 里都指向它，DS Bot 的头部、活动行、语音才认得出来。
export const BOT = Object.freeze({ id: 'bot', name: 'DSH Bot', role: '助手', color: 'deepseek', avatar: { shape: 'whale' } })

function useSelect(source, selector) {
  const kept = useRef(null)
  const read = () => {
    const snapshot = source.getSnapshot()
    const last = kept.current
    if (last?.snapshot === snapshot && last.selector === selector) return last.value
    const value = selector(snapshot)
    kept.current = { snapshot, selector, value: last && Object.is(last.value, value) ? last.value : value }
    return kept.current.value
  }
  return useSyncExternalStore(source.subscribe, read)
}

function createBus() {
  const listeners = new Set()
  return { on(l) { listeners.add(l); return () => { listeners.delete(l) } }, emit(e, d) { for (const l of listeners) l(e, d) } }
}

const rosterFor = (ids, prefs) => {
  const byId = { [BOT.id]: BOT }
  for (const id of ids) byId[id] = { ...BOT, sessionId: id }
  return { revision: 0, mainBotId: BOT.id, mainBotIds: [BOT.id], bots: [BOT], rooms: [], agents: [], exchangeTurns: {}, questions: {}, prefs: prefs ?? {}, byId, roomsById: {}, agentsById: {}, agentOf: {}, memory: false, ready: true }
}

export function createTeam() {
  const roster = createSource(rosterFor([], {}))
  const ui = createSource({ settings: null, voice: null, palette: null, menu: null, quote: null, toast: null, details: null, visits: {}, unread: {}, renaming: null })
  const sessions = createSource({ ids: [], byId: {} })
  const status = createSource(new Map())
  const live = createSource({})
  const work = createSource({ bots: {}, approvals: [] })
  const turnClock = createSource({})
  const empty = createSource({})
  const shown = createSource(null)
  const prefs = createSource({})
  const sent = createSource({})
  const approvals = createSource([])
  const chat = createBus()

  const setRows = (list) => {
    const byId = {}
    for (const row of list) byId[row.id] = { ...row, displayTitle: row.title, projectionValues: { turnOutline: row.outline ?? [] } }
    sessions.set({ ids: list.map(r => r.id), byId })
    roster.set(rosterFor(list.map(r => r.id), prefs.getSnapshot()))
  }
  const editRow = (row) => {
    const cur = sessions.getSnapshot()
    const prev = cur.byId[row.id]
    const outline = prev?.projectionValues?.turnOutline ?? []
    const byId = { ...cur.byId, [row.id]: { ...prev, ...row, displayTitle: row.title, projectionValues: { turnOutline: outline } } }
    const ids = cur.ids.includes(row.id) ? cur.ids : [row.id, ...cur.ids]
    sessions.set({ ids, byId })
    if (!cur.ids.includes(row.id)) roster.set(rosterFor(ids, prefs.getSnapshot()))
  }
  const setStatus = (id, patch) => status.set((map) => {
    const entry = map.get(id) ?? {}
    if (Object.entries(patch).every(([k, v]) => (entry[k] ?? false) === v)) return map
    return new Map(map).set(id, { ...entry, ...patch })
  })
  const syncWork = () => work.set({ bots: {}, approvals: approvals.getSnapshot().map(a => ({ botId: BOT.id, sessionId: a.sessionId })) })

  const show = (id) => {
    if (shown.getSnapshot() === id) return
    const before = shown.getSnapshot()
    shown.set(id)
    const cur = sessions.getSnapshot()
    const byId = { ...cur.byId }
    if (before && byId[before]) byId[before] = { ...byId[before], retainedBy: { mainView: 0 } }
    if (id && byId[id]) byId[id] = { ...byId[id], retainedBy: { mainView: 1 } }
    sessions.set({ ...cur, byId })
    if (id) { setStatus(id, { completionUnread: false }); void call('open', { id }).catch(() => {}) }
  }

  const actions = new Proxy({
    // 会话
    openSession: id => show(id),
    newChat: async () => { const row = await call('new', {}); editRow(row); show(row.id); return row },
    rename: async (id, title) => { await call('rename', { id, title }) },
    remove: async (id) => { const r = await call('delete', { id }); if (shown.getSnapshot() === id) show(r.current) },
    send: async (sessionId, text, files) => {
      sent.set(s => ({ ...s, [sessionId]: [...(s[sessionId] ?? []), { placement: 'transcript', time: Date.now() }] }))
      const r = await call('send', { id: sessionId, text, files })
      if (r.id !== sessionId) show(r.id)
      return r
    },
    cancel: id => call('cancel', { id }),
    approve: (id, choice) => call('approve', { id, choice }),
    // 设置
    openSettings: (page = 'general') => ui.set(s => ({ ...s, settings: { page } })),
    closeSettings: () => ui.set(s => ({ ...s, settings: null })),
    setPrefs: async (patch) => { const next = await call('prefs', patch); prefs.set(next); roster.set(r => ({ ...r, prefs: next })) },
    // DS Bot 头部胶囊：打开设置
    toggleDetails: () => ui.set(s => ({ ...s, settings: s.settings ? null : { page: 'general' } })),
    openMemory: () => ui.set(s => ({ ...s, settings: { page: 'memory' } })),
    // 语音（浏览器自带的语音识别与朗读）
    openVoice: id => ui.set(s => ({ ...s, voice: id })),
    closeVoice: () => ui.set(s => ({ ...s, voice: null })),
    speech: () => undefined,
    voiceSetup: () => null,
    // 搜索
    openPalette: () => ui.set(s => ({ ...s, palette: true })),
    closePalette: () => ui.set(s => ({ ...s, palette: null })),
    clearQuote: () => ui.set(s => ({ ...s, quote: null })),
    quote: (sessionId, text) => ui.set(s => ({ ...s, quote: { sessionId, text, token: Date.now() } })),
    // DS Bot 活动行要的会话细节
    noteLive: (sessionId, key, value) => live.set((state) => {
      const entry = { ...(state[sessionId] ?? {}) }
      if (value) entry[key] = { at: Date.now(), ...value }; else delete entry[key]
      return { ...state, [sessionId]: entry }
    }),
    clearLive: sessionId => live.set(state => { if (!state[sessionId]) return state; const next = { ...state }; delete next[sessionId]; return next }),
    beginVisit: id => ui.set(s => ({ ...s, visits: { ...s.visits, [id]: { seen: Date.now(), entered: Date.now() } } })),
    endVisit: id => ui.set((s) => { const visits = { ...s.visits }; delete visits[id]; return { ...s, visits } }),
    hasRightSidebar: () => false,
    canReferenceChat: () => false,
    reportError: (error) => ui.set(s => ({ ...s, toast: { text: String(error?.message ?? error), at: Date.now() } })),
    clearToast: () => ui.set(s => ({ ...s, toast: null })),
  }, {
    // DS Bot 界面里我们没有的功能（多 bot、群聊、定时任务…）不会出现入口；万一被调用就什么都不做。
    get: (target, key) => (key in target ? target[key] : () => undefined),
  })

  const onFeed = (event, data) => {
    if (event === 'conversation') editRow(data)
    if (event === 'removed') {
      const cur = sessions.getSnapshot()
      const ids = cur.ids.filter(id => id !== data.id)
      const byId = { ...cur.byId }; delete byId[data.id]
      sessions.set({ ids, byId }); roster.set(rosterFor(ids, prefs.getSnapshot()))
    }
    if (event === 'status') {
      setStatus(data.sessionId, { running: data.running })
      if (!data.running) actions.noteLive(data.sessionId, 'reply', null)
      if (!data.running && shown.getSnapshot() !== data.sessionId) setStatus(data.sessionId, { completionUnread: true })
    }
    if (event === 'item') {
      const { sessionId, item } = data
      if (item.kind === 'user') sent.set(s => (s[sessionId]?.length ? { ...s, [sessionId]: s[sessionId].slice(1) } : s))
      if (item.kind === 'bot' || item.kind === 'user') {
        const cur = sessions.getSnapshot()
        const row = cur.byId[sessionId]
        if (row) {
          const outline = [...(row.projectionValues?.turnOutline ?? [])]
          if (item.kind === 'user') outline.push({ turn: outline.length + 1, prompt: item.text })
          else if (outline.length) outline[outline.length - 1] = { ...outline.at(-1), response: item.text }
          else outline.push({ turn: 1, response: item.text })
          sessions.set({ ...cur, byId: { ...cur.byId, [sessionId]: { ...row, projectionValues: { turnOutline: outline } } } })
        }
      }
      if (item.kind === 'tool') actions.noteLive(sessionId, 'tool', { label: item.name, state: 'working' })
      if (item.kind === 'tool-result') actions.noteLive(sessionId, 'tool', null)
    }
    if (event === 'stream' && data.sessionId) actions.noteLive(data.sessionId, 'reply', data.phase === undefined && data.text ? { text: true } : null)
    if (event === 'approval') { approvals.set(list => [...list, data]); syncWork() }
    if (event === 'approval-done') { approvals.set(list => list.filter(a => a.id !== data.id)); syncWork() }
    if (event === 'prefs') { prefs.set(data); roster.set(r => ({ ...r, prefs: data })) }
    chat.emit(event, data)
  }

  const pull = async () => {
    const value = await call('state')
    prefs.set(value.prefs)
    setRows(value.conversations)
    status.set(new Map(Object.entries(value.running).map(([id]) => [id, { running: true }])))
    approvals.set(value.approvals); syncWork()
    const want = shown.getSnapshot() ?? value.current ?? value.conversations[0]?.id ?? null
    if (want && value.conversations.some(c => c.id === want)) show(want)
    else if (value.conversations.length === 0) await actions.newChat()
  }

  const start = () => {
    let stopped = false
    const read = () => { void pull().catch((error) => { if (!stopped) actions.reportError(error) }) }
    const close = openFeed((event, data) => { if (event === 'hello') read(); else onFeed(event, data) })
    return () => { stopped = true; close() }
  }

  const use = source => selector => useSelect(source, selector)
  const hooks = {
    useRoster: use(roster), useUi: use(ui), useSessions: use(sessions), useSessionStatus: use(status), useLive: use(live),
    useWork: use(work), useActivity: use(empty), useMemoryNews: use(empty), useTurnClock: use(turnClock), useRegistry: use(registry),
    useSessionRetainInfo: (id, selector) => useSelect(sessions, list => selector(list.byId[id])),
    useShown: use(shown), usePrefs: use(prefs), useApprovals: use(approvals),
  }
  const sessionHook = sessionId => selector => useSelect(sent, state => selector({ pendingSubmissions: state[sessionId] ?? [] }))
  return { actions, hooks, sessionHook, chat, start }
}
