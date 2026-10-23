// Parts: making room in a long conversation (a checkpoint in place, or a switch to a
// fresh Session), the handoff note and package, and earlier pages for the chat view.
//
// A Bot's conversations are long-lived, and the compaction backend's own pressure
// line does not apply to them. Once a turn ends with the context past the check line
// (a share of what the model can take), the context steward (steward.js) reads the
// latest messages and decides. Work still under way: the older messages are condensed
// in place into a checkpoint that keeps the messages to the Bot word for word, and
// the part goes on. Work at a stopping point: the part moves on to a fresh Session,
// and the old one is archived whole. For that the Bot writes a handoff note while
// idle, from the same prefix as its own requests, so the provider serves it from
// cache and nobody waits. A turn that grows past the hard line, near the window, gets
// the same decision before its next step; a context overflow moves on without a note.
// The next part opens with the handoff package: the note, the latest messages word for
// word, and where the rest is. Input that arrives meanwhile waits and moves along.
// read_own_chat searches every part, the condensed messages included.
import { randomUUID } from 'node:crypto'
import { HANDOFF_ACK, HISTORY_TIMEOUT_MS, REPLY_KIND, SOURCE_KIND } from './constants.ts'
import { linesFor } from './steward.ts'
import { createClock, estimateTokens, textOf } from './text.ts'

// An ask_user card as the user saw it. The user's reply is often just an option label,
// which means nothing without the card. Arguments the tool would refuse (no question,
// options that are not { label } objects) showed no card, so they give no text.
import { canonicalHeadings, cardText, historyEntry, questionReply, readReply, replyText, viewCardText, viewReply } from './parts-text.ts'
import { handoffPackage, noteText } from './parts-handoff.ts'

export { handoffPackage, noteText }
import { createPartSwitch } from './parts-switch.ts'
import { createPartNote } from './parts-note.ts'

export { createPartSwitch }

export { canonicalHeadings, cardText, historyEntry, questionReply, readReply, replyText, viewCardText, viewReply }

export function install(rt) {
  const { ctx, config, state } = rt

  const RECENT_TOKENS = config.handoffRecentTokens ?? 16_384
  const RECENT_LINE_MAX = 4_000
  const LIST_TOKENS = config.handoffListTokens ?? 4_096
  const LIST_LINE_MAX = 400
  const HANDOFF_READ_MS = 60_000
  const NOTE_MAX_TOKENS = 8_192
  const NOTE_TIMEOUT_MS = 600_000
  const NOTE_ATTEMPTS = 2
  // After a note fails below the hard line the part stays as it is, and tries again
  // only after a wait that grows with each failure in a row.
  const NOTE_COOLDOWN_MS = [60_000, 300_000, 900_000]
  const ORIGINAL_COMPACT = Symbol.for('ds-bot/compaction')
  const STEWARD_MAX_TOKENS = 4_096
  const STEWARD_TIMEOUT_MS = 120_000
  const STEWARD_LINES = 40

  // A broken provider adapter must not crash every turn; estimate from the
  // derived messages instead, with one warning.
  let measureWarned = false
  const tokensOf = (session) => {
    try {
      return ctx.get('tokenMeter')?.measure(session).totalTokens
    } catch (error) {
      if (!measureWarned) {
        measureWarned = true
        rt.warn('ds-bot: token measure failed; context sizes are estimated: %s', error)
      }
    }
    try {
      return estimateTokens(session.deriveMessages().map(message => textOf(message.content)).join('\n'))
    } catch {
      return undefined
    }
  }
  const clock = createClock(config.timeZone)

  // Lines for the model the Session last routed to; undefined while it has not
  // routed yet.
  async function contextLines(session) {
    const route = session.requestHeader()?.config
    if (!route?.provider || !route?.model) return undefined
    const info = await ctx.llm.resolveModelInfo(route.provider, route.model)
    return linesFor({ window: info.context?.contextWindow, reserve: route.maxTokens ?? info.defaultMaxTokens, checkRatio: config.checkRatio })
  }

  // The backend's own entry points leave Bot Sessions alone, earlier parts and group
  // records included: automatic pressure and overflow compaction do nothing, and
  // /compact and explicit ranges are refused. Only DS Bot condenses a Bot Session,
  // when the steward says so, and then the summary is DS Bot's checkpoint. Each preset
  // mount has its own compaction backend. Every other Session, subagents included, is
  // as it was.
  const adoptedEngines = new Set()
  // Sessions DS Bot itself is condensing right now.
  const condensing = new Set()
  const refuseCompaction = () => Promise.reject(new Error(
    'A Bot conversation makes room on its own, and read_own_chat searches all of it.'))
  const isBotTarget = (target) => {
    const id = target?.session?.id
    return id !== undefined && (rt.selfOf(id) !== undefined || rt.roomOf(id) !== undefined)
  }
  const ownedByBot = target => isBotTarget(target) && !condensing.has(target.session.id)
  // The engine that serves this agent, when DS Bot can condense through it.
  const engineOf = agent => [ctx.get('agentPresets')?.serviceFor(agent, 'compaction'), ctx.get('compaction')]
    .find(engine => typeof engine?.[ORIGINAL_COMPACT]?.summarize === 'function')

  // The wrapper decides per call, so it can go on before the Session is a Bot's.
  function adoptCompaction(agent) {
    adoptEngine(ctx.get('agentPresets')?.serviceFor(agent, 'compaction'))
    adoptEngine(ctx.get('compaction'))
  }
  function adoptEngine(engine) {
    // The mark lives on the engine itself, so two lookups of one engine adopt it once.
    if (engine === undefined || engine[ORIGINAL_COMPACT] !== undefined || typeof engine.compactIfNeeded !== 'function') return
    const original = engine[ORIGINAL_COMPACT] = {
      compactIfNeeded: engine.compactIfNeeded,
      compactNow: engine.compactNow,
      compactRegion: engine.compactRegion,
      // compaction-basic's one customization hook; it runs for every summary.
      ...(typeof engine.summarize === 'function' ? { summarize: engine.summarize } : {}),
    }
    engine.compactIfNeeded = function compactOutsideBots(target, trigger, signal) {
      if (ownedByBot(target)) return Promise.resolve(null)
      return original.compactIfNeeded.call(this, target, trigger, signal)
    }
    engine.compactNow = function compactNowOutsideBots(target, signal, commandId) {
      if (ownedByBot(target)) return refuseCompaction()
      return original.compactNow.call(this, target, signal, commandId)
    }
    engine.compactRegion = function compactRegionOutsideBots(start, end, target, signal) {
      if (ownedByBot(target)) return refuseCompaction()
      return original.compactRegion.call(this, start, end, target, signal)
    }
    if (original.summarize !== undefined) {
      engine.summarize = function summarizeForBots(input, agent, signal) {
        if (isBotTarget(agent)) return writeCheckpoint(input, agent, signal)
        return original.summarize.call(this, input, agent, signal)
      }
    }
    adoptedEngines.add(engine)
  }
  ctx.effect(() => () => {
    for (const engine of adoptedEngines) {
      for (const [key, method] of Object.entries(engine[ORIGINAL_COMPACT] ?? {})) {
        delete engine[key]
        if (engine[key] !== method) engine[key] = method
      }
      delete engine[ORIGINAL_COMPACT]
    }
    adoptedEngines.clear()
  }, 'ds-bot: Bot compaction')
  ctx.on('agent/created', ({ agent }) => { adoptCompaction(agent) })

  // A Bot's own chat, or its Session in one group, as numbered parts, oldest first;
  // the last one is current.
  function partsOf(botId, roomId) {
    const bot = rt.botOf(botId)
    if (bot === undefined) return []
    const room = rt.roomOf(roomId)
    const earlier = (room ? room.segments?.[botId] : bot.segments) ?? []
    const current = room ? room.sessions?.[botId] : rt.chatOf(botId)
    const parts = earlier.map((segment, index) => ({ ...segment, number: index + 1, startedAt: earlier[index - 1]?.endedAt ?? bot.createdAt }))
    if (current !== undefined) parts.push({ sessionId: current, number: parts.length + 1, startedAt: earlier.at(-1)?.endedAt ?? bot.createdAt })
    return parts
  }

  // What was said in one part, newest first: the user, other Bots, and the Bot itself.
  async function* partLines(sessionId, signal, { group = false, pages } = {}) {
    // Read backwards, a Bot's answers come before the message they answer.
    let answers = []
    for await (const event of rt.eventsBackwards(sessionId, signal, pages)) {
      const entry = historyEntry(event, group)
      if (entry === undefined) continue
      if (entry.answer) {
        answers.push({ text: `You: ${entry.text}`, time: event.time, seq: event.seq, who: 'you' })
        continue
      }
      const kept = entry.keepAnswers ? answers : []
      answers = []
      yield* kept
      if (entry.text !== '') yield { text: entry.who === 'user' ? `User: ${entry.text}` : entry.text, time: event.time, seq: event.seq, who: entry.who }
    }
  }

  // The note, the checkpoint, and the steward's one-line call: each is one request on
  // the conversation's own prefix. They live in `parts-note.ts`, which reads and
  // measures through the closures injected here; the factory is built before the
  // compaction engines are adopted, because adopting one may call `writeCheckpoint`.
  const { handoffLines, writeNote, writeCheckpoint, decide, condense } = createPartNote({
    ctx,
    rt,
    clock,
    condensing,
    engineOf,
    tokensOf,
    contextLines,
    // Bound late: the switch factory is built further down, and these are only called
    // from a turn.
    placeOf: sessionId => placeOf(sessionId),
    partsOf,
    partLines,
    setPartBase: (sessionId, tokens) => partSwitch.setPartBase(sessionId, tokens),
    limits: {
      recentTokens: RECENT_TOKENS, recentLineMax: RECENT_LINE_MAX,
      listTokens: LIST_TOKENS, listLineMax: LIST_LINE_MAX,
      handoffReadMs: HANDOFF_READ_MS, noteMaxTokens: NOTE_MAX_TOKENS,
      noteTimeoutMs: NOTE_TIMEOUT_MS, noteAttempts: NOTE_ATTEMPTS,
      stewardMaxTokens: STEWARD_MAX_TOKENS, stewardTimeoutMs: STEWARD_TIMEOUT_MS,
      stewardLines: STEWARD_LINES,
    },
  })

  // The note a part opened with, as the fresh part shows it. A note DS Bot put
  // together without the model carries the last note the model wrote.
  // A turn stopped for a switch goes on with its own source, so its reply still
  // reaches whoever asked.
  const handoffSource = (job, resume) => ({
    ...(resume && job.info ? job.info : { kind: SOURCE_KIND, form: 'relay', role: 'handoff', senderName: 'DS Bot' }),
    exchangeId: job.info?.exchangeId ?? randomUUID(),
    handoff: true,
    ...(resume ? { resume: true } : {}),
    ...(resume && job.joined?.length ? { joined: job.joined } : {}),
  })

  const placeOf = (sessionId) => {
    const botId = rt.chatOwners.get(sessionId)
    if (botId !== undefined) return { botId }
    const owner = rt.groupOwners.get(sessionId)
    return owner && { botId: owner.botId, roomId: owner.roomId }
  }

  const partSwitch = createPartSwitch({
    ctx,
    rt,
    state,
    placeOf,
    tokensOf,
    contextLines,
    condense,
    decide,
    adoptCompaction,
    // A read-only process (another dsh holds the team) neither condenses nor switches.
    readOnly: () => rt.readOnly() !== undefined,
    writeNote,
    handoffLines,
    handoffPackage,
    handoffSource,
    partsOf,
    recentTokens: RECENT_TOKENS,
    noteTimeoutMs: NOTE_TIMEOUT_MS,
    noteCooldownMs: NOTE_COOLDOWN_MS,
  })

  // The handoff package opens a part as a turn of its own, so it is the first message
  // in the part's history. When nothing is left to do, that turn's reply is a fixed
  // line instead of a model call.
  ctx.on('llm/stream', (options, next) => {
    if (options.sessionId === undefined || options.purpose !== undefined || rt.ownRequest(options)) return next()
    const messages = options.messages ?? []
    const since = messages.findLastIndex(message => message.role === 'assistant' || message.role === 'tool') + 1
    const opened = messages.slice(since).filter(message => message.role === 'user' && (message.source?.kind === 'user' || message.source?.kind === SOURCE_KIND))
    const bare = opened.length > 0 && opened.every(message => message.source.kind === SOURCE_KIND && message.source.handoff === true && message.source.resume !== true)
    if (!bare) return next()
    return (async function* acknowledge() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: HANDOFF_ACK }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: HANDOFF_ACK } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  })

  // Earlier parts of a Bot's own chat, newest page first, for the chat to show above
  // the current part as one conversation.
  const EARLIER_PAGE = 60
  function displayItems(partId, events) {
    const hidden = new Set(state.exchangeTurns[partId] ?? [])
    const items = []
    for (const event of events) {
      if (event.type === 'assistant/message') {
        if (hidden.has(event.data?.turn)) continue
        // One entry per text block: the chat shows each block in a bubble of its own.
        const content = Array.isArray(event.data?.message?.content) ? event.data.message.content : []
        for (const block of content) {
          if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') items.push({ kind: 'bot', text: block.text, time: event.time })
        }
        continue
      }
      if (event.type !== 'user/message') continue
      const source = event.data?.source
      if (source?.kind === 'user') {
        const content = Array.isArray(event.data.content) ? event.data.content : []
        const images = content.filter(block => block?.type === 'image').length
        items.push({ kind: 'user', text: textOf(content), ...(images > 0 ? { images } : {}), time: event.time })
      } else if (source?.kind === REPLY_KIND) {
        const text = textOf(event.data.content)
        const reply = readReply(text)
        if (reply?.questions !== undefined) items.push({ kind: 'answer', questions: reply.questions, answers: reply.answers, time: event.time })
        else if (reply?.views !== undefined) items.push({ kind: 'answer', text: replyText(text), views: reply.views, answers: reply.answers, time: event.time })
      } else if (source?.kind === SOURCE_KIND && source.handoff !== true && source.deferred !== true && ['request', 'reply', 'report', 'stopped'].includes(source.role)) {
        items.push({ kind: 'event', role: source.role, botId: source.senderSessionId ?? null, name: source.senderName ?? null, roomId: source.roomId ?? null, time: event.time })
      }
    }
    return items
  }

  async function partPage(parts, index, cursor) {
    const part = parts[index]
    const agent = await rt.resolveAgent(part.sessionId)
    const page = await ctx.sessionController.page({
      address: { kind: 'session', sessionId: part.sessionId },
      throughSeq: Number(agent.session.seq) - 1,
      ...(Number.isInteger(cursor?.beforeSeq) ? { beforeSeq: cursor.beforeSeq } : {}),
      maxMessages: EARLIER_PAGE,
    }, AbortSignal.timeout(HISTORY_TIMEOUT_MS))
    const events = page.records.map(record => record.event)
    const items = displayItems(part.sessionId, events)
    const more = page.hasMore && events.length > 0
    // The line above a part's first message marks where it began.
    if (!more && index > 0) items.unshift({ kind: 'divider', time: part.startedAt })
    return { items, cursor: more ? { part: index, beforeSeq: events[0].seq } : index > 0 ? { part: index - 1 } : null }
  }

  async function earlierPage(sessionId, cursor) {
    const past = rt.pastOwners.get(sessionId)
    const botId = rt.chatOwners.get(sessionId) ?? (past?.roomId === undefined ? past?.botId : undefined)
    const parts = botId === undefined ? [] : partsOf(botId)
    const at = parts.findIndex(part => part.sessionId === sessionId)
    const index = Number.isInteger(cursor?.part) ? cursor.part : at - 1
    if (at <= 0 || index < 0 || index >= at) return { items: [], cursor: null, startedAt: parts[at]?.startedAt ?? null }
    return { ...(await partPage(parts, index, cursor)), startedAt: parts[at].startedAt }
  }

  // A Bot's whole own chat, newest page first: the current part, then the earlier
  // ones, for a window that draws the conversation itself.
  async function chatPage(botId, cursor) {
    const parts = partsOf(botId)
    if (parts.length === 0) throw Object.assign(new Error('Unknown Bot'), { code: 'bot/not-found' })
    const index = Number.isInteger(cursor?.part) ? cursor.part : parts.length - 1
    if (index < 0 || index >= parts.length) return { sessionId: parts.at(-1).sessionId, items: [], cursor: null }
    return { sessionId: parts.at(-1).sessionId, ...(await partPage(parts, index, cursor)) }
  }

  Object.assign(rt, { clock, partsOf, historyEntry, partLines, noteText, earlierPage, chatPage, displayItems, followFolder: partSwitch.followFolder, heldBack: partSwitch.heldBack, switchJobs: () => partSwitch.switchJobs() })
}
