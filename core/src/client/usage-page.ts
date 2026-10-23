import { createElement as h, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react'
import { colorOf, MAIN_LOOK } from './characters.ts'
import type { LookBot } from './characters.ts'
import { GRADIENTS, paintCss } from './inks.ts'
import { BotAvatar, BotMark, RoomAvatar } from './mark.ts'
import { CalendarIcon, ChatsIcon, ChevronLeftIcon, ChevronRightIcon } from './icons.ts'
import { reducedMotion, useGlide } from './motion.js'
import { EmptyState } from './empty-state.ts'
import { dateLocale, t } from './i18n.js'
import { DAY_MS, HOUR, HOUR_MS, MODEL, OWNER, RANGES, compact, dayKey, hourMs, mondayOf, percent, spanRange, summarize, tokensOf } from './usage-data.ts'
import type { UsageBucket, UsageRange, UsageRow, UsageSum, UsageSummary } from './usage-data.ts'

// Usage page: the host's ledger as hourly rows, summed here by hour, day, week, or
// month, over a preset range or days picked on a calendar. The overview stacks the
// chart by Bot or by model and ranks both; a Bot, a group chat, the other sessions, or
// a model opens on its own (the settings route's id is `owner:<key>` or
// `model:<key>`), with its tokens split by kind.

const HEAT_WEEKS = 53
const TOP_SERIES = 7
const RING_R = 42
const RING = 2 * Math.PI * RING_R

type PageRange = UsageRange & { readonly ends?: boolean | undefined }
type UsageFocus = { readonly kind: 'owner' | 'model'; readonly key: string }
type Glyph = () => ReactElement

type UsageOwner =
  | { readonly key: string; readonly kind: 'other' }
  | { readonly key: string; readonly kind: 'room' | 'agent' | 'bot'; readonly id: string; readonly name: string; readonly deleted?: boolean | undefined }

interface UsageModel {
  readonly key: string
  readonly provider: string
  readonly model: string
  readonly name: string
  readonly providerName?: string | undefined
}

interface UsagePageView {
  readonly owners: readonly UsageOwner[]
  readonly models: readonly UsageModel[]
  readonly kinds: readonly string[]
  readonly rows: readonly UsageRow[]
  readonly now: string
  readonly scanning: boolean
}

interface UsageBot extends LookBot {
  id?: string
  name?: string
  role?: string | null
}

interface UsageRoom {
  readonly members: readonly string[]
}

interface UsageRoster {
  readonly byId: Record<string, UsageBot | undefined>
  readonly roomsById: Record<string, UsageRoom | undefined>
}

interface UsageActions {
  usage: () => Promise<UsagePageView>
  openSettings: (page: string, id?: string | null) => void
}

const rangeLabel = (id: string): string | undefined => {
  const labels: Record<string, string> = { '24h': t('24 hours'), '7d': t('7 days'), '30d': t('30 days'), '12w': t('12 weeks'), '12m': t('12 months') }
  return labels[id]
}
const unitLabel = (unit: string): string | undefined => {
  const labels: Record<string, string> = { hour: t('Per hour'), day: t('Per day'), week: t('Per week'), month: t('Per month') }
  return labels[unit]
}
const MODEL_INKS: readonly string[] = ['deepseek', 'tangerine', 'green', 'violet', 'sky', 'rose', 'yellow', 'cyan', 'magenta', 'brown']
// Token kinds, from the solid output to the faint cache hits.
type PartKey = 'output' | 'input' | 'cacheRead'
const PARTS: readonly (readonly [PartKey, number])[] = [['output', 1], ['input', 0.6], ['cacheRead', 0.32]]
const partLabel = (part: string): string | undefined => {
  const labels: Record<string, string> = { output: t('Output'), input: t('Input'), cacheRead: t('Cache hit') }
  return labels[part]
}
// A color a step softer than the Bot's own, mixed into the card so stacks stay opaque.
// A gradient softens stop by stop.
const soften = (paint: string, strength = 1): string => {
  const mix = (color: string): string => `color-mix(in srgb, ${color} ${Math.round(88 * strength)}%, var(--bt-card))`
  return paint.startsWith('linear-gradient(') ? paint.replace(/#[0-9a-f]{6}/gi, mix) : mix(paint)
}

const full = (count: number): string => new Intl.NumberFormat(dateLocale()).format(Math.round(count))
const hitRate = (sum: UsageSum): string => percent(sum.cacheRead, sum.input + sum.cacheRead)

const dates = (options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => new Intl.DateTimeFormat(dateLocale(), { timeZone: 'UTC', ...options })
const hourText = (ms: number): string => `${String(new Date(ms).getUTCHours()).padStart(2, '0')}:00`
const yearOf = (ms: number): number => new Date(ms).getUTCFullYear()
// Day keys `from` to `to` as one short phrase, with the year only when it is not this one.
function spanText(from: string, to: string): string {
  const start = hourMs(from)
  const end = hourMs(to)
  const year = new Date().getFullYear()
  const format = dates(yearOf(start) !== year || yearOf(end) !== year ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })
  // Not formatRange: in Chinese it falls back to numbers like 10/1 – 10/9.
  return from === to ? format.format(start) : `${format.format(start)} – ${format.format(end)}`
}
const daysText = (count: number): string => (count === 1 ? t('1 day') : t('{count} days', { count }))
const lastText = (range: PageRange): string => (range.from ? spanText(range.from, range.to!) : t('Last {range}', { range: rangeLabel(range.id) }))
function compareText(range: PageRange): string {
  if (!range.from) return t('Compared with the {range} before', { range: rangeLabel(range.id) })
  return range.days === 1 ? t('Compared with the day before') : t('Compared with the {count} days before', { count: range.days })
}

function tickOf(range: PageRange, bucket: UsageBucket): string {
  if (range.unit === 'hour') {
    // Over two picked days, midnight names its day.
    return range.days !== undefined && range.days > 1 && new Date(bucket.start).getUTCHours() === 0 ? dates({ month: 'numeric', day: 'numeric' }).format(bucket.start) : hourText(bucket.start)
  }
  if (range.unit === 'month') return dates({ month: 'short' }).format(bucket.start)
  return dates({ month: 'numeric', day: 'numeric' }).format(bucket.start)
}
function titleOf(range: PageRange, bucket: UsageBucket): string {
  if (range.unit === 'hour') return `${dates({ month: 'short', day: 'numeric' }).format(bucket.start)} ${hourText(bucket.start)}–${hourText(bucket.start + HOUR_MS)}`
  if (range.unit === 'day') return dates({ month: 'long', day: 'numeric', weekday: 'short' }).format(bucket.start)
  if (range.unit === 'week') return spanText(dayKey(bucket.start), dayKey((bucket.end ?? bucket.start + 7 * DAY_MS) - DAY_MS))
  // A picked span can cut its first or last month short.
  if (bucket.end && (new Date(bucket.start).getUTCDate() !== 1 || new Date(bucket.end).getUTCDate() !== 1)) return spanText(dayKey(bucket.start), dayKey(bucket.end - DAY_MS))
  return dates({ year: 'numeric', month: 'long' }).format(bucket.start)
}

// The number eases to each new value.
function useTween(value: number): number {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') {
      from.current = value
      setShown(value)
      return undefined
    }
    const begin = from.current
    const started = performance.now()
    let frame = 0
    const step = (now: number): void => {
      const progress = Math.min(1, (now - started) / 650)
      from.current = begin + (value - begin) * (1 - (1 - progress) ** 3)
      setShown(from.current)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return shown
}

const glyphBox = (size: number, icon: Glyph): ReactElement => h('span', { className: 'bt-us-glyph', style: { width: size, height: size } }, h(icon))
interface ModelGlyphProps { name: string; paint: string; size: number }
function ModelGlyph({ name, paint, size }: ModelGlyphProps): ReactElement {
  return h('span', {
    className: 'bt-us-model', 'aria-hidden': true,
    style: { width: size, height: size, fontSize: Math.round(size * 0.42), background: `color-mix(in srgb, ${paint} 20%, var(--bt-card))`, color: `color-mix(in srgb, ${paint} 72%, var(--bt-ink))` },
  }, (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase())
}

interface Face {
  readonly kind: string
  readonly name: string
  readonly sub: string
  readonly paint: string
  readonly stops?: readonly (readonly [number, string])[] | undefined
  readonly glyph: (size: number) => ReactElement
}

// A Bot shows in its own color and character; a group chat and the other sessions in gray.
function ownerFace(owner: UsageOwner, roster: UsageRoster): Face {
  if (owner.kind === 'bot') {
    const bot = roster.byId[owner.id] ?? { id: owner.id, name: owner.name }
    const name = bot.name || owner.name || t('Deleted Bot')
    const role = bot.role?.trim() ?? ''
    return {
      kind: 'bot', name, sub: owner.deleted ? t('Deleted') : role.toLowerCase() === name.toLowerCase() ? '' : role,
      paint: paintCss(colorOf(bot)), stops: GRADIENTS[colorOf(bot)], glyph: size => h(BotAvatar, { bot, size, badge: false, live: false }),
    }
  }
  if (owner.kind === 'room') {
    const room = roster.roomsById[owner.id]
    return {
      kind: 'room', name: owner.name || t('Deleted group chat'), sub: owner.deleted ? t('Deleted') : t('Group chat'),
      paint: 'var(--bt-us-rest)', glyph: size => (room ? h(RoomAvatar, { room, roster, size }) : glyphBox(size, ChatsIcon)),
    }
  }
  if (owner.kind === 'agent') {
    return {
      kind: 'agent', name: owner.name || 'DSH Agent', sub: owner.deleted ? t('Deleted') : '',
      paint: 'var(--bt-us-rest)', glyph: size => glyphBox(size, ChatsIcon),
    }
  }
  return { kind: 'other', name: t('Other'), sub: '', paint: 'var(--bt-us-rest)', glyph: size => glyphBox(size, ChatsIcon) }
}

function kindLabel(kind: string | undefined, botFocus: boolean): string | undefined {
  const labels: Record<string, string> = { chat: botFocus ? t('Own chat') : t('Conversations'), group: t('Group chats'), compaction: t('Compaction and handoff'), image: t('Image reading'), memory: t('Memory'), 'session-title': t('Titles'), other: t('Other') }
  return labels[kind ?? ''] ?? kind
}

// Buttons on a track; a thumb slides to the chosen one.
type TabOption = readonly [id: string, text: ReactNode, icon?: Glyph | undefined]
interface TabsProps {
  label: string
  value: string
  options: readonly TabOption[]
  onChange: (id: string) => void
  boxRef?: RefObject<HTMLElement | null> | undefined
}
function Tabs({ label, value, options, onChange, boxRef }: TabsProps): ReactElement {
  const names = options.map(([, text]) => text).join('\n')
  const glide = useGlide(`${value}\n${names}`, { box: boxRef })
  return h('div', { ref: glide.box, className: 'bt-us-tabs', role: 'group', 'aria-label': label },
    h('span', { ref: glide.thumb, className: 'bt-thumb', 'aria-hidden': true }),
    options.map(([id, text, icon]) => h('button', { key: id, type: 'button', 'aria-pressed': value === id, onClick: () => onChange(id) }, icon ? h(icon) : null, text)))
}

interface StatsProps { range: PageRange; total: UsageSum; previous: number }
function Stats({ range, total, previous }: StatsProps): ReactElement {
  const shown = useTween(total.total)
  const change = previous > 0 ? Math.round(((total.total - previous) / previous) * 100) : null
  const cell = (label: ReactNode, value: ReactNode): ReactElement => h('div', { className: 'bt-us-stat' }, h('span', { className: 'bt-us-stat-label' }, label), h('span', { className: 'bt-us-stat-value' }, value))
  return h('section', { className: 'bt-us-stats', style: { '--i': 0 } },
    h('div', { className: 'bt-us-stat bt-us-stat-main' },
      h('span', { className: 'bt-us-stat-label' }, lastText(range)),
      h('span', { className: 'bt-us-stat-value' }, compact(shown), h('small', null, t('tokens')),
        change === null ? null : h('span', { className: 'bt-us-delta', title: compareText(range) },
          `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}%`))),
    cell(t('Cache hit rate'), `${hitRate(total)}%`),
    cell(t('Output'), compact(total.output)),
    cell(t('Calls'), full(total.calls)))
}

function niceTop(max: number): number {
  if (!(max > 0)) return 1
  const step = 10 ** Math.floor(Math.log10(max))
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(scale => scale * step).find(value => value >= max) ?? 10 * step
}

type StackPart = readonly [key: string, value: number]
interface ChartColumn {
  readonly key: string
  readonly tick: string
  readonly title: string
  readonly total: number
  readonly parts: StackPart[]
  readonly tip: StackPart[]
}
interface ChartSeries {
  readonly key: string
  readonly name: string | undefined
  fill?: string | undefined
  readonly pick?: UsageFocus | undefined
}
interface ChartProps {
  range: PageRange
  columns: ChartColumn[]
  series: ChartSeries[]
  tipSeries: ChartSeries[]
  by?: string | undefined
  onBy?: ((value: string) => void) | undefined
  onPick?: ((pick: UsageFocus) => void) | undefined
}
// Stacked bars, one per bucket, each stack a column of rounded pieces. Hovering a bar
// dims the others and lists its `tip` rows (named by `tipSeries`) beside it.
function Chart({ range, columns, series, tipSeries, by, onBy, onPick }: ChartProps): ReactElement {
  const [hover, setHover] = useState<number | null>(null)
  const top = niceTop(Math.max(0, ...columns.map(column => column.total)))
  const count = columns.length
  const fillOf = new Map(series.map(entry => [entry.key, entry.fill]))
  const tipOf = new Map(tipSeries.map(entry => [entry.key, entry]))
  const tip = hover === null ? null : columns[hover]
  const tipSide: CSSProperties = hover === null ? {}
    : hover >= count / 2
      ? { right: `calc(${((count - hover) / count) * 100}% + 8px)` }
      : { left: `calc(${((hover + 1) / count) * 100}% + 8px)` }
  return h('section', { className: 'bt-us-card bt-us-chart', style: { '--i': 1 } },
    h('div', { className: 'bt-us-card-head' },
      h('h3', null, t('Tokens over time'), h('span', null, unitLabel(range.unit))),
      onBy ? h(Tabs, { label: t('Group usage by'), value: by ?? '', onChange: onBy, options: [['bot', t('By Bot')], ['model', t('By model')]] }) : null),
    h('div', { className: 'bt-us-chart-body' },
      h('div', { className: 'bt-us-plot', 'data-hover': hover === null ? undefined : '', onMouseLeave: () => setHover(null) },
        [1, 0.5].map(level => h('div', { key: level, className: 'bt-us-grid', style: { bottom: `${level * 100}%` } }, h('span', null, compact(top * level)))),
        h('div', { className: 'bt-us-grid bt-us-base', style: { bottom: 0 } }, h('span', null, '0')),
        h('div', { className: 'bt-us-cols' },
          columns.map((column, at) => h('div', {
            key: `${range.from ? `${range.from}~${range.to}` : range.id}:${column.key}`, className: 'bt-us-col', 'data-on': hover === at ? '' : undefined, onMouseEnter: () => setHover(at),
          }, column.total > 0
            ? h('div', { className: 'bt-us-stack', style: { height: `${(column.total / top) * 100}%`, '--i': at } },
                column.parts.map(([key, value]) => (value > 0 ? h('i', { key, style: { flexGrow: value, background: fillOf.get(key) } }) : null)))
            : h('div', { className: 'bt-us-stub' })))),
        tip ? h('div', { className: 'bt-us-tip', style: tipSide },
          h('div', { className: 'bt-us-tip-title' }, tip.title),
          h('div', { className: 'bt-us-tip-total' }, t('{count} tokens', { count: full(tip.total) })),
          tip.tip.filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => h('div', { key, className: 'bt-us-tip-row' },
            h('i', { className: 'bt-us-dot', style: { background: tipOf.get(key)?.fill } }),
            h('span', null, tipOf.get(key)?.name),
            h('b', null, compact(value))))) : null),
      h('div', { className: 'bt-us-ticks', 'aria-hidden': true },
        // A preset counts its labels back from now; a picked span forward from its first day.
        columns.map((column, at) => h('span', { key: column.key, 'data-now': at === count - 1 && range.ends !== false ? '' : undefined },
          (range.from ? at : count - 1 - at) % range.stride === 0 ? column.tick : '')))),
    series.length > 1 || series[0]?.pick ? h('div', { className: 'bt-us-legend' },
      series.map(entry => h(entry.pick ? 'button' : 'span', {
        key: entry.key, className: 'bt-us-key', ...(entry.pick ? { type: 'button', onClick: () => onPick?.(entry.pick!) } : {}),
      }, h('i', { className: 'bt-us-dot', style: { background: entry.fill } }), entry.name))) : null)
}

interface RowProps {
  kind?: string | undefined
  glyph?: ReactNode
  name: ReactNode
  sub?: ReactNode
  sum: UsageSum
  whole: number
  fill?: string | undefined
  index: number
  onClick?: (() => void) | undefined
}
function Row({ kind, glyph, name, sub, sum, whole, fill, index, onClick }: RowProps): ReactElement {
  const width = whole > 0 ? Math.max(sum.total > 0 ? 2 : 0, (sum.total / whole) * 100) : 0
  return h(onClick ? 'button' : 'div', {
    className: 'bt-us-row', 'data-kind': kind, style: { '--i': index },
    title: t('{tokens} tokens · {calls} calls', { tokens: full(sum.total), calls: full(sum.calls) }),
    ...(onClick ? { type: 'button', onClick } : {}),
  },
  glyph ? h('span', { className: 'bt-us-row-glyph' }, glyph) : null,
  h('span', { className: 'bt-us-row-body' },
    h('span', { className: 'bt-us-row-line' },
      h('span', { className: 'bt-us-row-name' }, name),
      sub ? h('span', { className: 'bt-us-row-sub' }, sub) : null),
    h('span', { className: 'bt-us-track' }, h('span', { style: { width: `${width}%`, background: fill } }))),
  h('span', { className: 'bt-us-row-num' }, h('b', null, compact(sum.total)), h('small', null, `${percent(sum.total, whole)}%`)))
}

interface ListCardProps { title: ReactNode; count?: ReactNode; index: number; children?: ReactNode }
function ListCard({ title, count, index, children }: ListCardProps): ReactElement {
  return h('section', { className: 'bt-us-card', style: { '--i': index } },
    h('div', { className: 'bt-us-card-head' }, h('h3', null, title, count === undefined ? null : h('span', null, count))),
    h('div', { className: 'bt-us-rows' }, children))
}

interface ProfileProps { face: Face; share: number; range: PageRange }
// One Bot, group chat, or model: its face inside a ring as long as its share of the range.
function Profile({ face, share, range }: ProfileProps): ReactElement {
  const arc = Math.max(0, Math.min(1, share)) * RING
  return h('section', { className: 'bt-us-profile' },
    h('span', { className: 'bt-us-ring' },
      h('svg', { viewBox: '0 0 96 96', 'aria-hidden': true },
        face.stops ? h('defs', null, h('linearGradient', { id: 'bt-us-ring-paint', x1: 0, y1: 1, x2: 1, y2: 0 },
          face.stops.map(([offset, color]) => h('stop', { key: offset, offset, stopColor: color })))) : null,
        h('circle', { className: 'bt-us-ring-track', cx: 48, cy: 48, r: RING_R }),
        arc > 0 ? h('circle', { className: 'bt-us-ring-arc', cx: 48, cy: 48, r: RING_R, style: { stroke: face.stops ? 'url(#bt-us-ring-paint)' : face.paint, strokeDasharray: `${arc} ${RING}` } }) : null),
      h('span', { className: 'bt-us-ring-face' }, face.glyph(64))),
    h('div', { className: 'bt-us-profile-copy' },
      h('h3', null, face.name),
      face.sub ? h('span', { className: 'bt-us-profile-sub' }, face.sub) : null,
      h('span', { className: 'bt-us-profile-share' }, range.from
        ? t('{share}% of all usage from {span}', { share: percent(share, 1), span: spanText(range.from, range.to!) })
        : t('{share}% of all usage in the last {range}', { share: percent(share, 1), range: rangeLabel(range.id) }))))
}

const monthOf = (ms: number): number => Date.UTC(yearOf(ms), new Date(ms).getUTCMonth(), 1)
const addMonths = (ms: number, count: number): number => Date.UTC(yearOf(ms), new Date(ms).getUTCMonth() + count, 1)

interface Span { readonly from: string; readonly to: string }
interface SpanPickerProps {
  span: Span | null
  today: string
  oldest: number
  active: ReadonlySet<string>
  near: RefObject<HTMLElement | null>
  onPick: (from: string, to: string) => void
  onClose: () => void
}
// Two months of days under the time range. The first press picks one end of the span,
// the second the other; days with usage carry a dot.
function SpanPicker({ span, today, oldest, active, near, onPick, onClose }: SpanPickerProps): ReactElement {
  const box = useRef<HTMLDivElement | null>(null)
  const todayMs = hourMs(today)
  const thisMonth = monthOf(todayMs)
  const [right, setRight] = useState<number>(() => Math.max(addMonths(oldest, 1), monthOf(hourMs(span?.to ?? today))))
  const [anchor, setAnchor] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node) || ![box, near].some(ref => ref.current?.contains(target))) onClose()
    }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [])
  let low: string | null = null
  let high: string | null = null
  if (anchor) {
    low = hover !== null && hover < anchor ? hover : anchor
    high = hover !== null && hover > anchor ? hover : anchor
  } else if (span) {
    low = span.from
    high = span.to
  }
  const press = (key: string): void => {
    if (!anchor) {
      setAnchor(key)
      return
    }
    const from = anchor < key ? anchor : key
    const to = anchor < key ? key : anchor
    onPick(from, to)
  }
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, at) => dates({ weekday: 'narrow' }).format(Date.UTC(2024, 0, 1 + at))), [])
  const month = (start: number, side: 'left' | 'right'): ReactElement => {
    const length = new Date(addMonths(start, 1) - DAY_MS).getUTCDate()
    const lead = (new Date(start).getUTCDay() + 6) % 7
    const cells: ReactElement[] = Array.from({ length: lead }, (_, at) => h('span', { key: `b${at}` }))
    for (let day = 1; day <= length; day += 1) {
      const ms = start + (day - 1) * DAY_MS
      const key = dayKey(ms)
      const weekday = (lead + day - 1) % 7
      const flag = (on: boolean): '' | undefined => (on ? '' : undefined)
      cells.push(h('button', {
        key, type: 'button', className: 'bt-us-day', disabled: ms > todayMs,
        'aria-label': dates({ year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(ms),
        'aria-pressed': key === low || key === high,
        'data-in': flag(low !== null && high !== null && key >= low && high >= key), 'data-start': flag(key === low), 'data-end': flag(key === high),
        'data-l': flag(weekday === 0 || day === 1), 'data-r': flag(weekday === 6 || day === length),
        'data-today': flag(key === today), 'data-has': flag(active.has(key)),
        onMouseEnter: () => setHover(key), onClick: () => press(key),
      }, h('b', null, day)))
    }
    const nav = side === 'left'
      ? h('button', { type: 'button', className: 'bt-us-month-nav', 'data-side': 'left', 'aria-label': t('Previous month'), disabled: start <= oldest, onClick: () => setRight(addMonths(right, -1)) }, h(ChevronLeftIcon))
      : h('button', { type: 'button', className: 'bt-us-month-nav', 'data-side': 'right', 'aria-label': t('Next month'), disabled: start >= thisMonth, onClick: () => setRight(addMonths(right, 1)) }, h(ChevronRightIcon))
    return h('div', { key: start, className: 'bt-us-month' },
      h('div', { className: 'bt-us-month-head' }, nav, h('span', null, dates({ year: 'numeric', month: 'long' }).format(start))),
      h('div', { className: 'bt-us-weekdays', 'aria-hidden': true }, weekdays.map((name, at) => h('span', { key: at }, name))),
      h('div', { className: 'bt-us-days', onMouseLeave: () => setHover(null) }, cells))
  }
  const shortcuts: [string, string, string, string][] = [
    ['month', t('This month'), dayKey(thisMonth), today],
    ['last', t('Last month'), dayKey(addMonths(thisMonth, -1)), dayKey(thisMonth - DAY_MS)],
    ['year', t('This year'), `${today.slice(0, 4)}-01-01`, today],
  ]
  const count = low === null || high === null ? 0 : Math.round((hourMs(high) - hourMs(low)) / DAY_MS) + 1
  return h('div', { ref: box, className: 'bt-us-pick', role: 'dialog', 'aria-label': t('Custom range') },
    h('div', { className: 'bt-us-pick-quick' },
      shortcuts.map(([id, label, from, to]) => h('button', {
        key: id, type: 'button', 'aria-pressed': span?.from === from && span?.to === to, onClick: () => onPick(from, to),
      }, label))),
    h('div', { className: 'bt-us-pick-months' }, month(addMonths(right, -1), 'left'), month(right, 'right')),
    h('div', { className: 'bt-us-pick-foot', role: 'status' },
      h('span', null, anchor ? t('Pick the last day') : t('Pick the first day')),
      low === null || high === null ? null : h('span', null, h('b', null, spanText(low, high)), ` · ${daysText(count)}`)))
}

interface HeatProps { view: UsagePageView; keep: (row: UsageRow) => boolean; paint: string; index: number }
// Each day of the last year, shaded by its tokens.
function Heat({ view, keep, paint, index }: HeatProps): ReactElement {
  const [hover, setHover] = useState<{ ms: number; week: number; day: number } | null>(null)
  const today = hourMs(`${view.now.slice(0, 10)} 00`)
  const first = mondayOf(today) - (HEAT_WEEKS - 1) * 7 * DAY_MS
  const from = dayKey(first)
  const daily = new Map<string, number>()
  for (const row of view.rows) {
    const day = row[HOUR].slice(0, 10)
    if (day >= from && keep(row)) daily.set(day, (daily.get(day) ?? 0) + tokensOf(row))
  }
  const most = Math.max(0, ...daily.values())
  const levels = [0.3, 0.52, 0.76, 1]
  const months: ReactElement[] = []
  const cells: ReactElement[] = []
  for (let week = 0; week < HEAT_WEEKS; week += 1) {
    const monday = first + week * 7 * DAY_MS
    if (week > 0 && new Date(monday).getUTCMonth() !== new Date(monday - 7 * DAY_MS).getUTCMonth()) {
      months.push(h('span', { key: week, style: { gridColumn: week + 1 } }, dates({ month: 'short' }).format(monday)))
    }
    for (let day = 0; day < 7; day += 1) {
      const ms = monday + day * DAY_MS
      const value = daily.get(dayKey(ms)) ?? 0
      const level = value > 0 ? Math.max(1, Math.ceil(4 * Math.sqrt(value / most))) : 0
      cells.push(h('span', {
        key: ms, className: 'bt-us-cell', style: { '--w': week },
        'data-on': hover?.ms === ms ? '' : undefined,
        'data-future': ms > today ? '' : undefined, 'data-today': ms === today ? '' : undefined,
        onMouseEnter: ms > today ? undefined : () => setHover({ ms, week, day }),
      }, level > 0 ? h('i', { style: { background: soften(paint, levels[level - 1]) } }) : null))
    }
  }
  const tipSide: CSSProperties | undefined = hover ? {
    ...(hover.week >= HEAT_WEEKS / 2
      ? { right: `calc(${((HEAT_WEEKS - hover.week) / HEAT_WEEKS) * 100}% + 8px)` }
      : { left: `calc(${((hover.week + 1) / HEAT_WEEKS) * 100}% + 8px)` }),
    ...(hover.day < 4
      ? { top: `calc(${(hover.day / 7) * 100}% - 2px)` }
      : { top: 'auto', bottom: `calc(${((6 - hover.day) / 7) * 100}% - 2px)` }),
  } : undefined
  const active = [...daily.values()].filter(value => value > 0).length
  const summary = active === 1 ? t('Active on 1 day in the last year') : t('Active on {count} days in the last year', { count: active })
  return h('section', { className: 'bt-us-card bt-us-heat', style: { '--i': index } },
    h('div', { className: 'bt-us-card-head' }, h('h3', null, t('Activity')), h('span', { className: 'bt-us-head-note' }, summary)),
    h('div', { className: 'bt-us-heat-months', 'aria-hidden': true }, months),
    h('div', { className: 'bt-us-heat-plot', onMouseLeave: () => setHover(null) },
      h('div', { className: 'bt-us-heat-grid', role: 'img', 'aria-label': summary }, cells),
      hover ? h('div', { className: 'bt-us-tip bt-us-heat-tip', style: tipSide },
        h('div', { className: 'bt-us-tip-title' }, dates({ month: 'long', day: 'numeric', weekday: 'short' }).format(hover.ms)),
        h('div', { className: 'bt-us-tip-total' }, t('{count} tokens', { count: full(daily.get(dayKey(hover.ms)) ?? 0) }))) : null),
    h('div', { className: 'bt-us-heat-scale', 'aria-hidden': true }, t('Light'),
      levels.map(level => h('span', { key: level, className: 'bt-us-cell' }, h('i', { style: { background: soften(paint, level) } }))),
      t('Heavy')))
}

function Skeleton(): ReactElement {
  return h('div', { className: 'bt-us', 'aria-busy': true },
    h('div', { className: 'bt-us-skel', style: { height: 32, width: 320, borderRadius: 999 } }),
    h('div', { className: 'bt-us-sheet bt-us-skel-sheet' },
      h('div', { className: 'bt-us-skel', style: { height: 94 } }),
      h('div', { className: 'bt-us-skel', style: { height: 318 } }),
      h('div', { className: 'bt-us-pair' },
        h('div', { className: 'bt-us-skel', style: { height: 200 } }),
        h('div', { className: 'bt-us-skel', style: { height: 200 } }))))
}

const focusOf = (id: string | null | undefined): UsageFocus | null => (id === null || id === undefined ? null
  : id.startsWith('model:') ? { kind: 'model', key: id.slice('model:'.length) }
  : id.startsWith('owner:') ? { kind: 'owner', key: id.slice('owner:'.length) }
  : null)

interface Series {
  readonly key: string
  readonly name: string | undefined
  readonly paint?: string | undefined
  fill?: string | undefined
  readonly pick?: UsageFocus | undefined
}
type PaintedSeries = Series & { paint: string }

interface Shaped {
  faces: Face[]
  models: Face[]
  ownerAt: number
  modelAt: number
  face: Face | null
  keep: (row: UsageRow) => boolean
  all: UsageSummary
  part: UsageSummary
  series: Series[]
  tipSeries: ChartSeries[]
  fillOf: Map<string, string | undefined>
  columns: ChartColumn[]
  ranked: (map: Map<string, UsageSum>) => [string, UsageSum][]
  isBot: (at: string | number) => boolean
  activeDays: Set<string>
  oldest: number
}

export interface UsagePageProps {
  roster: UsageRoster
  actions: UsageActions
  focusId?: string | null
}

export function UsagePage({ roster, actions, focusId }: UsagePageProps): ReactElement | null {
  const [view, setView] = useState<UsagePageView | null>(null)
  const [error, setError] = useState('')
  const [rangeId, setRangeId] = useState('7d')
  const [span, setSpan] = useState<Span | null>(null)
  const [picking, setPicking] = useState(false)
  const [by, setBy] = useState('bot')
  const tabs = useRef<HTMLDivElement | null>(null)
  const focus = focusOf(focusId)
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async (): Promise<void> => {
      try {
        const value = await actions.usage()
        if (stopped) return
        // A large render: as a transition it yields to the browser while it runs.
        startTransition(() => setView(value))
        setError('')
        // While older chats are still being read, totals catch up quickly.
        timer = setTimeout(load, value.scanning ? 3000 : 20000)
      } catch (failure) {
        if (stopped) return
        setError((failure as { message?: string } | null)?.message ?? String(failure))
        timer = setTimeout(load, 10000)
      }
    }
    void load()
    return () => { stopped = true; clearTimeout(timer) }
  }, [])

  const today = view?.now.slice(0, 10) ?? ''
  const range: PageRange = rangeId === 'custom' && span
    ? { ...spanRange(span.from, span.to), ends: span.to >= today }
    : RANGES.find(item => item.id === rangeId)!
  const shaped = useMemo<Shaped | null>(() => {
    if (!view) return null
    const faces = view.owners.map(owner => ownerFace(owner, roster))
    // A model keeps its color in every range: colors go by all-time tokens.
    const lifetime = new Map<string | number, number>()
    for (const row of view.rows) lifetime.set(row[MODEL], (lifetime.get(row[MODEL]) ?? 0) + tokensOf(row))
    const modelPaint = new Map<string | number, string>([...lifetime].sort((a, b) => b[1] - a[1]).map(([model], rank): [string | number, string] => [model, `var(--bt-ink-${MODEL_INKS[rank % MODEL_INKS.length]})`]))
    const models = view.models.map((model, at): Face => {
      const name = model.name || model.model || t('Unknown model')
      const paint = modelPaint.get(at) ?? 'var(--bt-us-rest)'
      return { kind: 'model', name, sub: model.providerName ?? model.provider, paint, glyph: size => h(ModelGlyph, { name, paint, size }) }
    })
    const ownerAt = focus?.kind === 'owner' ? view.owners.findIndex(owner => owner.key === focus.key) : -1
    const modelAt = focus?.kind === 'model' ? view.models.findIndex(model => model.key === focus.key) : -1
    // The DSH Agent stacks with the Bots; only rooms and outside sessions lump into the rest.
    const isBot = (at: string | number): boolean => ['bot', 'agent'].includes(view.owners[Number(at)]?.kind ?? '')
    const all = summarize(view, range, undefined, row => (by === 'bot' ? (isBot(row[OWNER]) ? `o${row[OWNER]}` : 'rest') : `m${row[MODEL]}`))
    const keep: (row: UsageRow) => boolean = ownerAt >= 0 ? row => Number(row[OWNER]) === ownerAt : modelAt >= 0 ? row => Number(row[MODEL]) === modelAt : () => true
    const face: Face | null = ownerAt >= 0 ? faces[ownerAt] ?? null : modelAt >= 0 ? models[modelAt] ?? null : null
    const part = face ? summarize(view, range, keep) : all
    // The calendar dots the days with usage and opens back to the first of them, or a year.
    const activeDays = new Set<string>()
    let first = view.now
    for (const row of view.rows) {
      if (row[HOUR] < first) first = row[HOUR]
      if (keep(row) && tokensOf(row) > 0) activeDays.add(row[HOUR].slice(0, 10))
    }
    const oldest = Math.min(monthOf(hourMs(first)), addMonths(monthOf(hourMs(view.now)), -12))
    const ranked = (map: Map<string, UsageSum>): [string, UsageSum][] => [...map].filter(([, sum]) => sum.total > 0).sort((a, b) => b[1].total - a[1].total)
    // One Bot or model draws solid bars in its color; the token kinds show on hover.
    let series: Series[]
    if (face) {
      series = [{ key: 'all', name: face.name, fill: soften(face.paint) }]
    } else {
      let painted: PaintedSeries[]
      if (by === 'bot') {
        const bots = ranked(all.owners).filter(([at]) => isBot(at))
        painted = bots.slice(0, TOP_SERIES).map(([at]): PaintedSeries => {
          const entry = faces[Number(at)]!
          return { key: `o${at}`, name: entry.name, paint: entry.paint, pick: { kind: 'owner', key: view.owners[Number(at)]!.key } }
        })
        if (bots.length > TOP_SERIES) painted.push({ key: 'more', name: t('More Bots'), paint: 'var(--bt-us-more)' })
        if (ranked(all.owners).some(([at]) => !isBot(at))) painted.push({ key: 'rest', name: t('Other'), paint: 'var(--bt-us-rest)' })
      } else {
        const used = ranked(all.models)
        painted = used.slice(0, TOP_SERIES).map(([at]): PaintedSeries => {
          const entry = models[Number(at)]!
          return { key: `m${at}`, name: entry.name, paint: entry.paint, pick: { kind: 'model', key: view.models[Number(at)]!.key } }
        })
        if (used.length > TOP_SERIES) painted.push({ key: 'more', name: t('More models'), paint: 'var(--bt-us-more)' })
      }
      // Bots or models that share a color stay apart: each repeat is lighter.
      const repeats = new Map<string, number>()
      for (const entry of painted) {
        const seen = repeats.get(entry.paint) ?? 0
        repeats.set(entry.paint, seen + 1)
        entry.fill = soften(entry.paint, [1, 0.6, 0.36][seen % 3])
      }
      series = painted
    }
    const tipSeries: ChartSeries[] = face ? PARTS.map(([key, strength]) => ({ key, name: partLabel(key), fill: soften(face.paint, strength) })) : series
    const fillOf = new Map(series.map((entry): [string, string | undefined] => [entry.key, entry.fill]))
    const shownKeys = new Set(series.map(entry => entry.key))
    const columns: ChartColumn[] = part.buckets.map((bucket) => {
      const parts: StackPart[] = face
        ? [['all', bucket.sum.total]]
        : series.map((entry): StackPart => [entry.key, entry.key === 'more'
          ? [...bucket.stacks].filter(([key]) => key !== 'rest' && !shownKeys.has(key)).reduce((sum, [, value]) => sum + value, 0)
          : bucket.stacks.get(entry.key) ?? 0])
      const tip: StackPart[] = face ? PARTS.map(([key]): StackPart => [key, bucket.sum[key]]) : parts
      return { key: bucket.key, tick: tickOf(range, bucket), title: titleOf(range, bucket), total: bucket.sum.total, parts, tip }
    })
    return { faces, models, ownerAt, modelAt, face, keep, all, part, series, tipSeries, fillOf, columns, ranked, isBot, activeDays, oldest }
  }, [view, rangeId, span, by, focusId, roster])
  // A Bot or model opens at the top of its page, and so does the way back.
  const root = useRef<HTMLDivElement | null>(null)
  useEffect(() => { root.current?.closest<HTMLElement>('.bt-settings-scroll')?.scrollTo?.({ top: 0 }) }, [focusId])

  if (!view) {
    return error ? h('div', { className: 'bt-error', role: 'alert', style: { padding: 0 } }, error) : h(Skeleton)
  }
  if (view.rows.length === 0) {
    return h('div', { className: 'bt-us' },
      h(EmptyState, {
        art: h(BotMark, { look: MAIN_LOOK, size: 56, live: true }),
        title: view.scanning ? t('Reading your chats…') : t('No usage yet.'),
        hint: t('Token usage shows up here after a model is called.'),
      }))
  }
  if (!shaped) return null
  const { faces, models, ownerAt, face, keep, all, part, series, tipSeries, fillOf, columns, ranked, isBot, activeDays, oldest } = shaped
  const pick = (next: UsageFocus): void => actions.openSettings('usage', `${next.kind}:${next.key}`)
  const chooseRange = (id: string): void => {
    if (id !== 'custom') {
      setRangeId(id)
      setPicking(false)
      return
    }
    if (span) setRangeId('custom')
    setPicking(open => !open)
  }
  const pickSpan = (from: string, to: string): void => {
    setSpan({ from, to })
    setRangeId('custom')
    setPicking(false)
  }
  const rangeOptions: TabOption[] = [
    ...RANGES.map((item): TabOption => [item.id, rangeLabel(item.id)]),
    ['custom', rangeId === 'custom' && span ? spanText(span.from, span.to) : t('Custom'), CalendarIcon],
  ]
  const whole = part.total.total
  const ownerRow = ([at, sum]: readonly [string, UsageSum], index: number, total = whole): ReactElement => {
    const entry = faces[Number(at)]!
    return h(Row, {
      key: `o${at}`, kind: entry.kind, glyph: entry.glyph(32), name: entry.name, sub: entry.sub, sum, whole: total, index,
      fill: face ? soften(face.paint, 0.8) : fillOf.get(`o${at}`) ?? soften(entry.paint),
      onClick: () => pick({ kind: 'owner', key: view.owners[Number(at)]!.key }),
    })
  }
  const modelRow = ([at, sum]: readonly [string, UsageSum], index: number): ReactElement => {
    const entry = models[Number(at)]!
    return h(Row, {
      key: `m${at}`, kind: 'model', glyph: entry.glyph(32), name: entry.name, sub: entry.sub, sum, whole, index,
      fill: face ? soften(face.paint, 0.8) : fillOf.get(`m${at}`) ?? soften(entry.paint),
      onClick: () => pick({ kind: 'model', key: view.models[Number(at)]!.key }),
    })
  }
  const nothing = h('div', { className: 'bt-us-none' }, t('Nothing in this range.'))

  let body: ReactElement[]
  if (face) {
    const kinds = ranked(part.kinds)
    const usedModels = ranked(part.models)
    const owners = ranked(part.owners)
    body = [
      h(Profile, { key: 'profile', face, range, share: all.total.total > 0 ? whole / all.total.total : 0 }),
      h('div', { key: 'sheet', className: 'bt-us-sheet' },
        h(Stats, { key: 'stats', range, total: part.total, previous: part.previous }),
        h(Chart, { key: 'chart', range, columns, series, tipSeries, onPick: pick }),
        h('div', { key: 'pair', className: 'bt-us-pair' },
          ownerAt >= 0
            ? h(ListCard, { title: t('Models'), count: usedModels.length, index: 2 }, usedModels.length > 0 ? usedModels.map(modelRow) : nothing)
            : h(ListCard, { title: t('Who used it'), count: owners.length, index: 2 }, owners.length > 0 ? owners.map((entry, index) => ownerRow(entry, index)) : nothing),
          h(ListCard, { title: t('What for'), index: 3 },
            kinds.length > 0
              ? kinds.map(([at, sum], index) => h(Row, { key: at, name: kindLabel(view.kinds[Number(at)], ownerAt >= 0 && isBot(ownerAt)), sum, whole, index, fill: soften(face.paint, 0.8) }))
              : nothing)),
        h(Heat, { key: 'heat', view, keep, paint: face.paint, index: 4 })),
    ]
  } else {
    const owners = ranked(all.owners)
    const bots = owners.filter(([at]) => isBot(at))
    const rest = owners.filter(([at]) => !isBot(at))
    const usedModels = ranked(all.models)
    body = [
      h('div', { key: 'sheet', className: 'bt-us-sheet' },
        h(Stats, { key: 'stats', range, total: all.total, previous: all.previous }),
        h(Chart, { key: 'chart', range, columns, series, tipSeries, by, onBy: setBy, onPick: pick }),
        h('div', { key: 'pair', className: 'bt-us-pair' },
          h(ListCard, { title: t('Bots'), count: bots.length, index: 2 },
            owners.length > 0 ? null : nothing,
            bots.map((entry, index) => ownerRow(entry, index)),
            bots.length > 0 && rest.length > 0 ? h('div', { className: 'bt-us-split', role: 'separator' }) : null,
            rest.map((entry, index) => ownerRow(entry, bots.length + index))),
          h(ListCard, { title: t('Models'), count: usedModels.length, index: 3 }, usedModels.length > 0 ? usedModels.map(modelRow) : nothing)),
        h(Heat, { key: 'heat', view, keep, paint: 'var(--bt-accent)', index: 4 })),
    ]
  }

  return h('div', { ref: root, className: 'bt-us', key: focusId ?? 'all' },
    h('div', { className: 'bt-us-top' },
      h(Tabs, { label: t('Time range'), value: rangeId, onChange: chooseRange, options: rangeOptions, boxRef: tabs }),
      view.scanning ? h('span', { className: 'bt-us-note', role: 'status' }, t('Still reading older chats; totals may grow.')) : null,
      picking ? h(SpanPicker, { span, today, oldest, active: activeDays, near: tabs, onPick: pickSpan, onClose: () => setPicking(false) }) : null),
    error ? h('div', { className: 'bt-error', role: 'alert', style: { padding: 0 } }, error) : null,
    body)
}

export const USAGE_CSS = `
.bt-us{--bt-us-ease:cubic-bezier(.22,1,.36,1);--bt-us-rest:color-mix(in srgb,var(--bt-ink) 30%,var(--bt-card));--bt-us-more:color-mix(in srgb,var(--bt-ink) 16%,var(--bt-card));display:flex;flex-direction:column;gap:14px;padding-bottom:4px}
.bt-us-top{position:relative;z-index:4;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.bt-us-tabs{position:relative;display:inline-flex;flex:none;padding:3px;border-radius:999px;background:var(--bt-hover)}
.bt-us-tabs button{position:relative;z-index:1;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 12px;border:0;border-radius:999px;background:none;color:var(--bt-ink-2);font:inherit;font-size:12px;line-height:26px;white-space:nowrap;cursor:pointer;transition:color .15s ease}
.bt-us-tabs button svg{flex:none;width:13px;height:13px;margin-left:-2px}
.bt-us-pick{position:absolute;top:calc(100% + 8px);left:0;max-width:100%;box-sizing:border-box;padding:14px 16px 12px;border-radius:18px;border:.5px solid var(--bt-line-2);background:var(--bt-card);box-shadow:0 22px 50px -18px rgba(0,0,0,.32),0 2px 8px rgba(0,0,0,.05);transform-origin:24px 0;animation:bt-us-drop .2s var(--bt-us-ease)}
.bt-us-pick-quick{display:flex;gap:6px;margin-bottom:12px}
.bt-us-pick-quick button{height:26px;padding:0 11px;border:0;border-radius:999px;background:var(--bt-hover);color:var(--bt-ink-2);font:inherit;font-size:12px;cursor:pointer;transition:background-color .12s ease,color .12s ease}
.bt-us-pick-quick button:hover{background:var(--bt-active);color:var(--bt-ink)}
.bt-us-pick-quick button[aria-pressed=true]{background:color-mix(in srgb,var(--bt-accent) 14%,transparent);color:var(--bt-accent)}
.bt-us-pick-months{display:flex;flex-wrap:wrap;gap:8px 28px}
.bt-us-month{width:252px;animation:bt-us-fade .22s ease}
.bt-us-month-head{position:relative;display:flex;align-items:center;justify-content:center;height:28px;margin-bottom:4px;font-size:13px;line-height:18px;font-weight:600}
.bt-us-month-nav{position:absolute;top:0;width:28px;height:28px;padding:0;border:0;border-radius:9px;background:none;color:var(--bt-ink-2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .12s ease}
.bt-us-month-nav[data-side=left]{left:0}
.bt-us-month-nav[data-side=right]{right:0}
.bt-us-month-nav:hover:not(:disabled){background:var(--bt-hover);color:var(--bt-ink)}
.bt-us-month-nav:disabled{opacity:.3;cursor:default}
.bt-us-weekdays,.bt-us-days{display:grid;grid-template-columns:repeat(7,36px)}
.bt-us-weekdays span{height:24px;font-size:11px;line-height:24px;text-align:center;color:var(--bt-ink-3)}
.bt-us-day{position:relative;height:36px;padding:0;border:0;background:none;color:var(--bt-ink);font:inherit;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer}
.bt-us-day::before{content:'';position:absolute;top:4px;bottom:4px;left:0;right:0;transition:background-color .12s ease}
.bt-us-day>b{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-weight:400;transition:background-color .12s ease,color .12s ease}
.bt-us-day:hover:not(:disabled)>b{background:var(--bt-hover)}
.bt-us-day[data-today]>b{color:var(--bt-accent);font-weight:600}
.bt-us-day[data-has]::after{content:'';position:absolute;z-index:2;left:50%;bottom:6px;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:var(--bt-ink-3)}
.bt-us-day[data-in]::before{background:color-mix(in srgb,var(--bt-accent) 13%,transparent)}
.bt-us-day[data-in][data-l]::before{left:4px;border-radius:14px 0 0 14px}
.bt-us-day[data-in][data-r]::before{right:4px;border-radius:0 14px 14px 0}
.bt-us-day[data-in][data-l][data-r]::before{border-radius:14px}
.bt-us-day[data-in][data-start]::before{left:50%;border-radius:0}
.bt-us-day[data-in][data-end]::before{right:50%;border-radius:0}
.bt-us-day[data-in][data-start][data-r]::before,.bt-us-day[data-in][data-end][data-l]::before,.bt-us-day[data-in][data-start][data-end]::before{display:none}
.bt-us-day[data-start]>b,.bt-us-day[data-end]>b,.bt-us-day[data-start]:hover>b,.bt-us-day[data-end]:hover>b{background:var(--bt-accent);color:var(--bt-accent-ink,#fff);font-weight:600}
.bt-us-day[data-start][data-has]::after,.bt-us-day[data-end][data-has]::after{background:color-mix(in srgb,var(--bt-accent-ink,#fff) 75%,transparent)}
.bt-us-day:disabled{color:var(--bt-ink-3);opacity:.45;cursor:default}
.bt-us-pick-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:8px;padding-top:10px;border-top:1px solid var(--bt-line);font-size:12px;line-height:16px;color:var(--bt-ink-3);white-space:nowrap}
.bt-us-pick-foot b{color:var(--bt-ink);font-weight:500}
.bt-us-tabs button:hover,.bt-us-tabs button[aria-pressed=true]{color:var(--bt-ink)}
.bt-us-tabs:not([data-glide]) button[aria-pressed=true]{background:var(--bt-card)}
.bt-us-tabs>.bt-thumb{top:3px;bottom:3px;border-radius:999px;background:var(--bt-card);box-shadow:0 1px 3px rgba(0,0,0,.08),0 0 0 .5px var(--bt-line-2)}
.bt-us-note{display:inline-flex;align-items:center;gap:8px;font-size:12px;line-height:16px;color:var(--bt-ink-3)}
.bt-us-note::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--bt-accent);animation:bt-us-pulse 1.4s ease-in-out infinite}
.bt-us-sheet{display:flex;flex-direction:column;gap:4px}
.bt-us-sheet>.bt-us-stats,.bt-us-sheet>.bt-us-card,.bt-us-sheet>.bt-us-pair>.bt-us-card{border-radius:0}
.bt-us-sheet>:first-child{border-radius:16px 16px 0 0}
.bt-us-sheet>:last-child{border-radius:0 0 16px 16px}
.bt-us-stats{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;border-radius:16px;border:1px solid var(--bt-line);background:var(--bt-card);animation:bt-us-in .45s var(--bt-us-ease) backwards}
.bt-us-stat{display:flex;flex-direction:column;justify-content:flex-end;gap:6px;min-width:0;padding:16px 18px}
.bt-us-stat+.bt-us-stat{border-left:1px solid var(--bt-line)}
.bt-us-stat-label{overflow:hidden;font-size:12px;line-height:16px;color:var(--bt-ink-3);white-space:nowrap;text-overflow:ellipsis}
.bt-us-stat-value{display:flex;align-items:baseline;gap:6px;min-width:0;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap}
.bt-us-stat-main .bt-us-stat-value{font-size:34px;line-height:40px;letter-spacing:-.025em}
.bt-us-stat-value small{font-size:13px;font-weight:400;letter-spacing:0;color:var(--bt-ink-3)}
.bt-us-delta{align-self:center;margin-left:2px;padding:0 8px;border-radius:999px;background:var(--bt-tag-bg);color:var(--bt-ink-2);font-size:11px;line-height:20px;font-weight:500;letter-spacing:0}
.bt-us-card{display:flex;flex-direction:column;gap:12px;min-width:0;padding:14px 18px 16px;border-radius:16px;border:1px solid var(--bt-line);background:var(--bt-card);animation:bt-us-in .45s var(--bt-us-ease) backwards;animation-delay:calc(var(--i,0) * 45ms)}
.bt-us-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px}
.bt-us-card-head h3{display:flex;align-items:baseline;gap:8px;min-width:0;margin:0;font-size:13px;line-height:18px;font-weight:600}
.bt-us-card-head h3 span,.bt-us-head-note{font-size:12px;font-weight:400;color:var(--bt-ink-3)}
.bt-us-chart-body{display:flex;flex-direction:column;gap:8px;padding-top:6px}
.bt-us-plot{position:relative;height:200px;margin-left:40px}
.bt-us-grid{position:absolute;left:0;right:0;border-top:1px dashed var(--bt-line-2);pointer-events:none}
.bt-us-grid.bt-us-base{border-top:1px solid var(--bt-line-2)}
.bt-us-grid span{position:absolute;right:calc(100% + 8px);top:-8px;font-size:10px;line-height:16px;color:var(--bt-ink-3);font-variant-numeric:tabular-nums;white-space:nowrap}
.bt-us-cols{position:absolute;inset:0;display:flex;align-items:flex-end}
.bt-us-col{position:relative;flex:1 1 0;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center}
.bt-us-stack{display:flex;flex-direction:column-reverse;gap:2px;width:56%;min-width:4px;max-width:28px;transform-origin:50% 100%;animation:bt-us-grow .6s var(--bt-us-ease) backwards;animation-delay:calc(var(--i,0) * 14ms);transition:height .45s var(--bt-us-ease),opacity .18s ease}
.bt-us-stack>i{flex:1 1 0;min-height:2px;border-radius:5px;transition:flex-grow .45s var(--bt-us-ease)}
.bt-us-plot[data-hover] .bt-us-col:not([data-on]) .bt-us-stack{opacity:.3}
.bt-us-stub{width:4px;height:4px;margin-bottom:-2px;border-radius:50%;background:var(--bt-line-2)}
.bt-us-ticks{display:flex;margin-left:40px;font-size:11px;line-height:14px;color:var(--bt-ink-3);font-variant-numeric:tabular-nums}
.bt-us-ticks span{flex:1 1 0;min-width:0;text-align:center;white-space:nowrap}
.bt-us-ticks span[data-now]{color:var(--bt-ink);font-weight:500}
.bt-us-tip{position:absolute;top:6px;z-index:3;min-width:160px;max-width:240px;padding:10px 12px;border-radius:12px;border:.5px solid var(--bt-line-2);background:color-mix(in srgb,var(--bt-card) 90%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 14px 34px -12px rgba(0,0,0,.28);font-size:12px;line-height:16px;pointer-events:none;animation:bt-us-pop .16s var(--bt-us-ease)}
.bt-us-tip-title{color:var(--bt-ink-3)}
.bt-us-tip-total{margin:2px 0 8px;font-size:15px;line-height:20px;font-weight:600;font-variant-numeric:tabular-nums}
.bt-us-tip-total:last-child{margin-bottom:0}
.bt-us-tip-row{display:flex;align-items:center;gap:8px;color:var(--bt-ink-2)}
.bt-us-tip-row+.bt-us-tip-row{margin-top:5px}
.bt-us-tip-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-us-tip-row b{font-weight:500;color:var(--bt-ink);font-variant-numeric:tabular-nums}
.bt-us-legend{display:flex;flex-wrap:wrap;gap:6px}
.bt-us-key{display:inline-flex;align-items:center;gap:6px;min-width:0;height:24px;padding:0 10px 0 8px;border:0;border-radius:999px;background:var(--bt-hover);color:var(--bt-ink-2);font:inherit;font-size:12px;line-height:24px}
button.bt-us-key{cursor:pointer;transition:background-color .12s ease,color .12s ease}
button.bt-us-key:hover{background:var(--bt-active);color:var(--bt-ink)}
.bt-us-dot{flex:none;width:8px;height:8px;border-radius:50%}
.bt-us-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:4px}
.bt-us-rows{display:flex;flex-direction:column;margin:0 -8px}
.bt-us-row{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:8px;border:0;border-radius:12px;background:none;color:var(--bt-ink);font:inherit;text-align:left;animation:bt-us-in .4s var(--bt-us-ease) backwards;animation-delay:calc(var(--i,0) * 35ms + 90ms)}
button.bt-us-row{cursor:pointer;transition:background-color .12s ease}
button.bt-us-row:hover{background:var(--bt-hover)}
.bt-us-row-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px}
.bt-us-row-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.bt-us-row-line{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:13px;line-height:18px}
.bt-us-row-name{flex:0 1 auto;min-width:0;overflow:hidden;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.bt-us-row-sub{flex:0 1 auto;min-width:0;overflow:hidden;font-size:12px;color:var(--bt-ink-3);text-overflow:ellipsis;white-space:nowrap}
.bt-us-track{display:block;height:4px;border-radius:999px;background:var(--bt-hover);overflow:hidden}
.bt-us-track>span{display:block;height:100%;border-radius:inherit;transform-origin:0 50%;animation:bt-us-fill .7s var(--bt-us-ease) backwards;animation-delay:calc(var(--i,0) * 35ms + 140ms);transition:width .45s var(--bt-us-ease)}
.bt-us-row-num{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:1px;min-width:52px;font-variant-numeric:tabular-nums}
.bt-us-row-num b{font-size:13px;line-height:18px;font-weight:600}
.bt-us-row-num small{font-size:11px;line-height:14px;color:var(--bt-ink-3)}
.bt-us-split{height:1px;margin:6px 8px;background:var(--bt-line)}
.bt-us-none{padding:18px 8px;font-size:12px;color:var(--bt-ink-3);text-align:center}
.bt-us-glyph{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--bt-hover);color:var(--bt-ink-2)}
.bt-us-model{display:inline-flex;align-items:center;justify-content:center;border-radius:30%;font-weight:600;line-height:1}
.bt-us-profile{display:flex;align-items:center;gap:20px;padding:6px 4px 2px;animation:bt-us-in .45s var(--bt-us-ease) backwards}
.bt-us-ring{position:relative;flex:none;width:96px;height:96px}
.bt-us-ring>svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.bt-us-ring>svg circle{fill:none;stroke-width:4}
.bt-us-ring-track{stroke:var(--bt-line)}
.bt-us-ring-arc{stroke-linecap:round;transition:stroke-dasharray .6s var(--bt-us-ease);animation:bt-us-ring 1s var(--bt-us-ease) .1s backwards}
.bt-us-ring-face{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.bt-us-profile-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.bt-us-profile-copy h3{margin:0;overflow:hidden;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-.01em;text-overflow:ellipsis;white-space:nowrap}
.bt-us-profile-sub{font-size:13px;line-height:18px;color:var(--bt-ink-2)}
.bt-us-profile-share{font-size:12px;line-height:16px;color:var(--bt-ink-3)}
.bt-us-heat{gap:8px}
.bt-us-heat-months,.bt-us-heat-grid{display:grid;grid-template-columns:repeat(${HEAT_WEEKS},1fr);gap:3px}
.bt-us-heat-months{height:14px;font-size:10px;line-height:14px;color:var(--bt-ink-3)}
.bt-us-heat-months span{white-space:nowrap}
.bt-us-heat-plot{position:relative}
.bt-us-heat-grid{grid-template-rows:repeat(7,auto);grid-auto-flow:column}
.bt-us-heat-grid .bt-us-cell[data-on]{outline:1.5px solid var(--bt-ink-2);outline-offset:1px}
.bt-us-heat-tip{min-width:0;white-space:nowrap}
.bt-us-cell{position:relative;aspect-ratio:1;border-radius:3px;background:var(--bt-hover);overflow:hidden}
.bt-us-heat-grid .bt-us-cell{animation:bt-us-cell .5s var(--bt-us-ease) backwards;animation-delay:calc(var(--w,0) * 7ms + 120ms)}
.bt-us-cell>i{position:absolute;inset:0}
.bt-us-cell[data-today]{outline:1.5px solid var(--bt-ink-3);outline-offset:1px}
.bt-us-cell[data-future]{visibility:hidden}
.bt-us-heat-scale{display:flex;align-items:center;justify-content:flex-end;gap:4px;font-size:11px;line-height:14px;color:var(--bt-ink-3)}
.bt-us-heat-scale .bt-us-cell{width:10px}
.bt-us-skel{border-radius:16px;background:linear-gradient(90deg,var(--bt-hover) 0%,var(--bt-active) 50%,var(--bt-hover) 100%);background-size:200% 100%;animation:bt-us-shine 1.4s ease-in-out infinite}
.bt-us-skel-sheet>.bt-us-skel:first-child{border-radius:16px 16px 0 0}
.bt-us-skel-sheet>.bt-us-skel:not(:first-child){border-radius:0}
.bt-us-skel-sheet>.bt-us-pair>.bt-us-skel:first-child{border-radius:0 0 0 16px}
.bt-us-skel-sheet>.bt-us-pair>.bt-us-skel:last-child{border-radius:0 0 16px 0}
.bt-us-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:72px 16px;text-align:center;font-size:13px;line-height:18px;color:var(--bt-ink-3)}
.bt-us-empty b{margin-top:6px;font-size:15px;font-weight:600;color:var(--bt-ink)}
@keyframes bt-us-in{from{opacity:0;transform:translateY(6px)}}
@keyframes bt-us-grow{from{transform:scaleY(0)}}
@keyframes bt-us-fill{from{transform:scaleX(0)}}
@keyframes bt-us-pop{from{opacity:0;transform:translateY(3px) scale(.97)}}
@keyframes bt-us-drop{from{opacity:0;transform:translateY(-4px) scale(.96)}}
@keyframes bt-us-fade{from{opacity:0}}
@keyframes bt-us-cell{from{opacity:0;transform:scale(.5)}}
@keyframes bt-us-ring{from{stroke-dasharray:0 ${Math.ceil(RING)}}}
@keyframes bt-us-pulse{50%{opacity:.25}}
@keyframes bt-us-shine{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.bt-us *,.bt-us *::before{animation:none!important;transition:none!important}}
`
