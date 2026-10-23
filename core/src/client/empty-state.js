// Moon Bot: what a surface says when it has nothing to show yet: one mark, one title,
// one line of guidance, and at most one button that fills the space. The mark is the
// Moon Bot's own, tinted by the theme's accent, so every empty state looks related.
import { createElement as h } from 'react'
import { MoonBotMark } from './icons.js'

// `glyph` names the surface (a search lens, a clock, a plus); `action` is the one thing
// that fills the space. `className` lets a surface keep its own layout wrapper.
export function EmptyState({ title, hint, glyph, action, className, compact = false }) {
  return h('div', { className: `bt-empty-state${compact ? ' bt-empty-state-compact' : ''}${className ? ` ${className}` : ''}` },
    h('div', { className: 'bt-empty-art' },
      h(MoonBotMark, { size: compact ? 30 : 44 }),
      glyph ? h('span', { className: 'bt-empty-glyph', 'aria-hidden': true }, glyph) : null),
    h('div', { className: 'bt-empty-title' }, title),
    hint ? h('div', { className: 'bt-empty-hint' }, hint) : null,
    action ? h('button', { type: 'button', className: 'bt-empty-action', onClick: action.onClick }, action.label) : null)
}

export const EMPTY_STATE_CSS = `
.bt-empty-state{display:flex;flex-direction:column;align-items:center;gap:7px;padding:34px 20px;text-align:center;color:var(--bt-ink);animation:bt-veil-in .22s ease-out}
.bt-empty-art{position:relative;display:flex;align-items:center;justify-content:center;width:64px;height:64px;margin-bottom:3px;border-radius:50%;background:color-mix(in srgb,var(--bt-accent) 10%,transparent)}
.bt-empty-glyph{position:absolute;right:-1px;bottom:-1px;display:flex;align-items:center;justify-content:center;width:23px;height:23px;border-radius:50%;background:var(--bt-accent);color:var(--bt-accent-ink);box-shadow:0 0 0 3px var(--bt-main)}
.bt-empty-glyph svg{width:12px;height:12px}
.bt-empty-title{font-size:14px;line-height:20px;font-weight:600}
.bt-empty-hint{max-width:280px;font-size:12.5px;line-height:19px;color:var(--bt-ink-2)}
.bt-empty-action{margin-top:5px;height:30px;padding:0 14px;border:0;border-radius:999px;background:var(--bt-accent);color:var(--bt-accent-ink);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;transition:filter .12s ease}
.bt-empty-action:hover{filter:brightness(1.06)}
.bt-empty-action:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
.bt-empty-state-compact{gap:5px;padding:18px 14px}
.bt-empty-state-compact .bt-empty-art{width:46px;height:46px;margin-bottom:1px}
.bt-empty-state-compact .bt-empty-glyph{width:18px;height:18px}
.bt-empty-state-compact .bt-empty-glyph svg{width:10px;height:10px}
.bt-empty-state-compact .bt-empty-title{font-size:13px;line-height:18px}
.bt-empty-state-compact .bt-empty-hint{font-size:12px;line-height:17px}
@media (prefers-reduced-motion:reduce){.bt-empty-state{animation:none}}
`
