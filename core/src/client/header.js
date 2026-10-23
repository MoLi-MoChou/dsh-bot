import { createElement as h, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { currentPart, latestMemoryChange } from './text.ts'
import { ArrowUpIcon, CloseIcon, ArrowDownIcon, MemoryIcon, SidePanelIcon } from './icons.ts'
import { botState, BotAvatar, RoomAvatar } from './mark.ts'
import { ActivityIndicator } from './activity-row.js'
import { clockLabel, openingTurn, unseenSince } from './cells.js'
import { t } from './i18n.js'

// -------------------------------------------------------------------------
// Conversation header

// The pill's tail: a → that springs in on hover, flipping to ← while details are open.
const GoArrow = () => h('svg', { width: 14, height: 14, viewBox: '-12 -12 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M-7 0H7M2 -5L7 0L2 5' }))

// How long the pill says "Memory updated" after the change reaches this window.
const MEMORY_NOTICE_MS = 3_200
const noNews = select => select({})

// True while the latest memory change of the Bots in this conversation is news.
function useMemoryNotice(ids, useMemoryNews) {
  const seen = useMemoryNews(map => Math.max(0, ...ids.map(id => map?.[id]?.seen ?? 0)))
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const left = seen + MEMORY_NOTICE_MS - Date.now()
    setShown(seen > 0 && left > 0)
    if (seen === 0 || left <= 0) return undefined
    const timer = setTimeout(() => setShown(false), left)
    return () => clearTimeout(timer)
  }, [seen])
  return shown
}

// The notice the pill stretches to show. Its width is measured, so the pill's spring
// runs between two real widths.
function MemoryNotice({ shown }) {
  const inner = useRef(null)
  const [width, setWidth] = useState(0)
  const label = t('Memory updated')
  useLayoutEffect(() => { if (shown) setWidth(inner.current?.scrollWidth ?? 0) }, [label, shown])
  return h('span', { className: 'bt-pill-mem', 'aria-hidden': true, style: { '--bt-mem-w': `${width}px` } },
    h('span', { className: 'bt-pill-mem-in', ref: inner }, h('span', { className: 'bt-pill-mem-ico' }, h(MemoryIcon)), label))
}

export function HeaderPill({ sessionId, useRoster, useSessions, useSessionStatus, useSession, useActivity, useMemoryNews, useTurnClock, useUi, useLive, useWork, useStore, useConversationViews, selectView, actions }) {
  const roster = useRoster(value => value)
  const selectedView = useStore?.(state => state.view)
  const away = useConversationViews?.(views => views.some(view => view.id === selectedView && view.id !== 'chat')) === true
    && typeof selectView === 'function'
  const title = useSessions(list => list.byId[sessionId]?.displayTitle ?? list.byId[sessionId]?.title ?? '')
  const firstTurns = useSessions((list) => {
    const outline = list.projectionsBySession?.[sessionId]?.values?.turnOutline ?? list.byId[sessionId]?.projectionValues?.turnOutline
    return Array.isArray(outline) ? outline.slice(0, 8).map(entry => entry.turn).join(',') : ''
  })
  const hiddenTurns = roster.exchangeTurns?.[sessionId]
  const visit = useUi(state => state.visits?.[sessionId])
  // The opening separator has no turn before it, so the transcript column draws it,
  // unless the opening is unread: then the first trigger draws it under the divider.
  const opening = useTurnClock((state) => {
    const first = openingTurn(state[sessionId], firstTurns, hiddenTurns)
    return first && !unseenSince(visit, first.start) ? clockLabel(first.start) : ''
  })
  useEffect(() => {
    if (opening) document.body.style.setProperty('--bt-first-sep', JSON.stringify(opening))
    else document.body.style.removeProperty('--bt-first-sep')
    return () => document.body.style.removeProperty('--bt-first-sep')
  }, [opening])
  const running = useSessionStatus(map => map.get(sessionId)?.running === true)
  const owner = roster.byId[sessionId]?.id ?? sessionId
  const doing = useActivity(map => map[owner])
  const bot = roster.byId[sessionId]
  const room = roster.roomsById[sessionId]
  const detailsOpen = useUi(state => state.details === sessionId)
  const name = bot?.name ?? room?.name ?? ''
  const useNews = useMemoryNews ?? noNews
  const memoryIds = bot ? [bot.id] : room ? [room.id, ...room.members] : []
  const notice = useMemoryNotice(memoryIds, useNews)
  // While the notice shows, the pill opens the memory that changed: a Bot's, or the group's.
  const changed = useNews(map => latestMemoryChange(map, memoryIds))
  // The composer placeholder is not localizable per Session, so CSS reads it from here.
  useEffect(() => {
    document.body.style.setProperty('--bt-placeholder', JSON.stringify(name ? t('Message {name}', { name }) : t('Message')))
  }, [name, t('Message')])
  useEffect(() => {
    actions.beginVisit(sessionId)
    return () => actions.endVisit(sessionId)
  }, [sessionId])
  // Group chats have no voice mode, so the composer CSS needs to know the Session kind.
  useEffect(() => {
    if (room) document.body.dataset.btRoom = ''
    else delete document.body.dataset.btRoom
    return () => { delete document.body.dataset.btRoom }
  }, [Boolean(room)])
  const memoryNotice = !away && notice && changed !== null && roster.memory !== false
  return h('div', { className: 'bt-head' },
    h('button', {
      type: 'button', className: 'bt-pill', 'aria-expanded': away ? undefined : detailsOpen, 'data-memory': memoryNotice ? 'updated' : undefined,
      'aria-label': away ? t('Back to chat') : memoryNotice ? t('Memory updated. Open {name}\'s memory', { name: roster.byId[changed]?.name ?? name }) : t('View conversation details'),
      title: away ? name : undefined,
      onClick: () => (away ? selectView('chat') : memoryNotice ? actions.openMemory(changed) : actions.toggleDetails(sessionId)),
    },
    bot ? h(BotAvatar, { bot, size: 24, state: botState(running, doing, roster.questions?.[currentPart(bot)] !== undefined), badge: false })
      : room ? h(RoomAvatar, { room, roster, size: 24 }) : null,
    h('span', { className: 'bt-pill-name' }, away ? t('Back to chat') : bot?.name ?? room?.name ?? (title || t('New chat'))),
    h(MemoryNotice, { shown: memoryNotice }),
    h('span', { className: 'bt-pill-go', 'aria-hidden': true }, h(GoArrow))),
    h('span', { className: 'bt-sr', role: 'status' }, memoryNotice ? t('Memory updated') : ''),
    h(NewMessagePills, { key: sessionId, sessionId, useSessions, useUi, useTurnClock }),
    h(ActivityIndicator, { key: `activity:${sessionId}`, sessionId, useRoster, useSessionStatus, useSession, useLive, useWork, actions }),
    // DSH's way into its right sidebar sits in the session header this pill replaces.
    actions.hasRightSidebar?.()
      ? h('button', { type: 'button', className: 'bt-icon-btn bt-head-side', 'data-bt-right-sidebar': '', 'aria-label': t('Show or hide the right sidebar'), title: t('Right sidebar'), onClick: () => actions.toggleRightSidebar() }, h(SidePanelIcon))
      : null)
}

// New-message pills. "N new messages ↓" takes Back to bottom's place when
// replies land while the user is scrolled up; "N new messages ↑" points at an unread
// divider above the viewport until it has been seen. The shell shows Back to bottom
// only while unpinned, so its presence is the pinned signal.
export const OFF_BOTTOM_PX = 120

export function isOffBottom(scroller, threshold = OFF_BOTTOM_PX) {
  if (!scroller) return false
  const sh = Number(scroller.scrollHeight)
  const st = Number(scroller.scrollTop)
  const ch = Number(scroller.clientHeight)
  if (Number.isFinite(sh) && Number.isFinite(st) && Number.isFinite(ch) && sh > ch && ch > 0) {
    return sh - st - ch > threshold
  }
  return scroller.querySelector?.('[class*="_toBottomSlot"]>button') !== null
}

export function scrollToBottom(scroller) {
  if (!scroller) return
  const back = scroller.querySelector?.('[class*="_toBottomSlot"]>button')
  if (back) back.click()
  scroller.scrollTo?.({ top: scroller.scrollHeight, behavior: 'smooth' })
}

export function followBottom(scroller, wasPinned) {
  if (!scroller || !wasPinned) return false
  const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
  if (Number.isFinite(distance) && distance > 2) {
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' })
    else scroller.scrollTop = scroller.scrollHeight
    return true
  }
  return false
}

function useTranscriptView() {
  const [view, setView] = useState(null)
  useEffect(() => {
    let frame = 0
    let watched = null
    let composerHeight = 152
    const readComposer = (scroller) => {
      if (!scroller || typeof getComputedStyle !== 'function') return
      composerHeight = parseFloat(getComputedStyle(scroller).getPropertyValue('--dsh-composer-height')) || 152
    }
    const observer = new MutationObserver(() => schedule())
    const measure = () => {
      frame = 0
      const scroller = document.querySelector('[data-conversation-scroll]')
      const flow = scroller?.querySelector('[data-chat-flow]') ?? scroller
      if (flow !== watched) {
        observer.disconnect()
        watched = flow
        readComposer(scroller)
        if (flow) observer.observe(flow, { childList: true })
      }
      if (!scroller) { setView(null); return }
      const box = scroller.getBoundingClientRect()
      const headerBottom = document.querySelector('header[class*="_header"]')?.getBoundingClientRect().bottom ?? box.top + 50
      const sep = scroller.querySelector('.bt-new-sep')
      let divider = null
      if (sep) {
        const at = sep.getBoundingClientRect()
        divider = at.bottom <= headerBottom ? 'above' : at.top >= box.bottom ? 'below' : 'in-view'
      }
      const next = {
        unpinned: isOffBottom(scroller),
        divider,
        center: Math.round(box.left + box.width / 2),
        top: Math.round(headerBottom + 8),
        bottom: Math.round(window.innerHeight - box.bottom + composerHeight + 8),
      }
      setView(prev => (prev && Object.keys(next).every(key => prev[key] === next[key]) ? prev : next))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const onResize = () => { readComposer(document.querySelector('[data-conversation-scroll]')); schedule() }
    document.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', onResize)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return view
}

function NewMessagePills({ sessionId, useSessions, useUi, useTurnClock }) {
  const replies = useSessions((list) => {
    const outline = list.projectionsBySession?.[sessionId]?.values?.turnOutline ?? list.byId[sessionId]?.projectionValues?.turnOutline
    return Array.isArray(outline) ? outline.reduce((count, entry) => count + (entry.response ? 1 : 0), 0) : 0
  })
  const visit = useUi(state => state.visits?.[sessionId])
  const unread = useTurnClock((state) => {
    if (typeof visit?.seen !== 'number') return 0
    let count = 0
    for (const entry of Object.values(state[sessionId] ?? {})) {
      if (entry.first !== undefined && entry.first > visit.seen && entry.first <= visit.entered) count += 1
    }
    return count
  })
  const view = useTranscriptView()
  const unpinned = view?.unpinned === true
  const pinnedRef = useRef(true)
  pinnedRef.current = !unpinned
  const [release, setRelease] = useState({ base: null, dismissed: false })
  const [above, setAbove] = useState({ seen: false, dismissed: false })
  useEffect(() => { setRelease({ base: unpinned ? replies : null, dismissed: false }) }, [unpinned])
  useEffect(() => {
    if (pinnedRef.current) followBottom(document.querySelector('[data-conversation-scroll]'), true)
  }, [replies])
  useEffect(() => { if (view?.divider === 'in-view') setAbove(state => (state.seen ? state : { ...state, seen: true })) }, [view?.divider])
  const fresh = release.base === null ? 0 : replies - release.base
  const showDown = unpinned && fresh > 0 && !release.dismissed
  const showBack = unpinned && !showDown
  const showUp = view?.divider === 'above' && !above.seen && !above.dismissed
  useEffect(() => {
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (!scroller) return undefined
    scroller.toggleAttribute('data-bt-news', showDown || showBack)
    return () => scroller.removeAttribute('data-bt-news')
  }, [showDown, showBack])
  if (!view || (!showDown && !showBack && !showUp)) return null
  const label = count => (count === 1 ? t('1 new message') : count > 0 ? t('{count} new messages', { count }) : t('New messages'))
  const pill = (direction, count, style, onJump, onDismiss) => h('div', { className: 'bt-news', 'data-direction': direction, style },
    h('button', { type: 'button', className: 'bt-news-jump', onClick: onJump },
      h('span', { className: 'bt-news-ico' }, h(direction === 'up' ? ArrowUpIcon : ArrowDownIcon)), label(count)),
    h('button', {
      type: 'button', className: 'bt-news-x', 'aria-label': t('Dismiss new messages'),
      onClick: (event) => { event.stopPropagation(); onDismiss() },
    }, h(CloseIcon)))
  const toLatest = () => scrollToBottom(document.querySelector('[data-conversation-scroll]'))
  const toDivider = () => document.querySelector('[data-conversation-scroll] .bt-new-sep')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return createPortal(h(Fragment, null,
    showUp ? pill('up', unread, { left: view.center, top: view.top }, toDivider, () => setAbove(state => ({ ...state, dismissed: true }))) : null,
    showDown ? pill('down', fresh, { left: view.center, bottom: view.bottom }, toLatest, () => setRelease(state => ({ ...state, dismissed: true }))) : null,
    showBack ? h('div', { className: 'bt-to-bottom', style: { left: view.center, bottom: view.bottom } },
      h('button', { type: 'button', className: 'bt-to-bottom-btn', 'aria-label': t('Back to bottom'), onClick: toLatest },
        h('span', { className: 'bt-news-ico' }, h(ArrowDownIcon)), t('Back to bottom'))) : null),
  document.body)
}
