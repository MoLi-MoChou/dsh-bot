import { createElement as h, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './icons.ts'
import { t } from './i18n.ts'
import { DAY_MS, HOUR, compact, dayKey, hourMs, mondayOf, percent, tokensOf } from './usage-data.ts'
import type { UsageRow, UsageSum } from './usage-data.ts'

import type { Face } from './usage-helpers.ts'
import type { PageRange, UsageFocus, UsagePageView } from './usage-page-types.ts'
import { HEAT_WEEKS, RING, RING_R } from './usage-page-types.ts'
import {
  Tabs, dates, daysText, full, niceTop,
  rangeLabel, soften, spanText, unitLabel, yearOf,
} from './usage-helpers.ts'

export type StackPart = readonly [key: string, value: number]
export interface ChartColumn {
  readonly key: string
  readonly tick: string
  readonly title: string
  readonly total: number
  readonly parts: StackPart[]
  readonly tip: StackPart[]
}
export interface ChartSeries {
  readonly key: string
  readonly name: string | undefined
  fill?: string | undefined
  readonly pick?: UsageFocus | undefined
}
export interface ChartProps {
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
export function Chart({ range, columns, series, tipSeries, by, onBy, onPick }: ChartProps): ReactElement {
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

export interface RowProps {
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
export function Row({ kind, glyph, name, sub, sum, whole, fill, index, onClick }: RowProps): ReactElement {
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

export interface ListCardProps { title: ReactNode; count?: ReactNode; index: number; children?: ReactNode }
export function ListCard({ title, count, index, children }: ListCardProps): ReactElement {
  return h('section', { className: 'bt-us-card', style: { '--i': index } },
    h('div', { className: 'bt-us-card-head' }, h('h3', null, title, count === undefined ? null : h('span', null, count))),
    h('div', { className: 'bt-us-rows' }, children))
}

export interface ProfileProps { face: Face; share: number; range: PageRange }
// One Bot, group chat, or model: its face inside a ring as long as its share of the range.
export function Profile({ face, share, range }: ProfileProps): ReactElement {
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

export const monthOf = (ms: number): number => Date.UTC(yearOf(ms), new Date(ms).getUTCMonth(), 1)
export const addMonths = (ms: number, count: number): number => Date.UTC(yearOf(ms), new Date(ms).getUTCMonth() + count, 1)

export interface Span { readonly from: string; readonly to: string }
export interface SpanPickerProps {
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
export function SpanPicker({ span, today, oldest, active, near, onPick, onClose }: SpanPickerProps): ReactElement {
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

export interface HeatProps { view: UsagePageView; keep: (row: UsageRow) => boolean; paint: string; index: number }
// Each day of the last year, shaded by its tokens.
export function Heat({ view, keep, paint, index }: HeatProps): ReactElement {
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

export function Skeleton(): ReactElement {
  return h('div', { className: 'bt-us', 'aria-busy': true },
    h('div', { className: 'bt-us-skel', style: { height: 32, width: 320, borderRadius: 999 } }),
    h('div', { className: 'bt-us-sheet bt-us-skel-sheet' },
      h('div', { className: 'bt-us-skel', style: { height: 94 } }),
      h('div', { className: 'bt-us-skel', style: { height: 318 } }),
      h('div', { className: 'bt-us-pair' },
        h('div', { className: 'bt-us-skel', style: { height: 200 } }),
        h('div', { className: 'bt-us-skel', style: { height: 200 } }))))
}

