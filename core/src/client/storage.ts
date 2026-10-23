// Browser storage keys. Values saved under the plugin's legacy names (dsh-bot-team, dsh-bot)
// move to the current keys once, so a renamed install keeps its unread marks, reactions,
// visits, theme, panel width and Bot browser tabs.
export const STORAGE = {
  unread: 'ds-bot:unread',
  reactions: 'ds-bot:reactions',
  seen: 'ds-bot:seen',
  prefs: 'ds-bot:prefs',
  surface: 'ds-bot:surface',
  agentSessions: 'ds-bot:agent-sessions',
  browserWidth: 'ds-bot:browser-width',
  browsers: 'ds-bot.browser.v2',
  sidebarOrder: 'ds-bot:sidebar-order',
} as const

export type StorageKey = typeof STORAGE[keyof typeof STORAGE]

// Newest legacy name first: when both exist, the more recent value wins.
const LEGACY_PREFIXES = ['dsh-bot:', 'dsh-bot-team:']
// The v1 store kept one page per Bot; v2 keeps a tab strip per Bot.
const LEGACY_BROWSER_KEYS = ['ds-bot.browser.v1', 'dsh-bot.browser.v1']
// The saved theme only paints the first frame before the team loads; it follows the
// host's rename of the theme ids.
const LEGACY_THEMES: Record<string, string> = { mono: 'grok', paper: 'claude', moonlight: 'deepseek' }

interface LegacyBrowserTab { id: string; url: string; title: string }
interface LegacyPage { url?: unknown; title?: unknown }

export function legacyKeys(key: string): readonly string[] {
  if (key === STORAGE.browsers) return LEGACY_BROWSER_KEYS
  const name = key.slice(key.indexOf(':') + 1)
  return LEGACY_PREFIXES.map(prefix => `${prefix}${name}`)
}

// One page per Bot becomes one tab per Bot; a v2 store already present wins.
const migrateBrowsers = (storage: Storage): void => {
  if (storage.getItem(STORAGE.browsers) !== null) {
    for (const key of LEGACY_BROWSER_KEYS) storage.removeItem(key)
    return
  }
  for (const key of LEGACY_BROWSER_KEYS) {
    try {
      const value = storage.getItem(key)
      if (value === null) continue
      const previous = JSON.parse(value) as unknown
      const pages = previous !== null && typeof previous === 'object' && !Array.isArray(previous)
        ? Object.entries(previous as Record<string, unknown>)
        : []
      const tabs: Record<string, { tabs: LegacyBrowserTab[]; active: string }> = Object.fromEntries(pages
        .filter(([, page]) => page !== null && typeof page === 'object')
        .map(([botId, page]) => {
          const tab: LegacyBrowserTab = {
            id: `v1-${botId}`,
            url: typeof (page as LegacyPage).url === 'string' ? (page as LegacyPage).url as string : '',
            title: typeof (page as LegacyPage).title === 'string' ? (page as LegacyPage).title as string : '',
          }
          return [botId, { tabs: [tab], active: tab.id }]
        }))
      storage.setItem(STORAGE.browsers, JSON.stringify(tabs))
      for (const earlier of LEGACY_BROWSER_KEYS) storage.removeItem(earlier)
      return
    } catch { /* unreadable entry: try the older name */ }
  }
}

export function migrateStorage(storage: Storage = globalThis.localStorage): void {
  for (const key of Object.values(STORAGE)) {
    if (key === STORAGE.browsers) continue
    for (const legacy of legacyKeys(key)) {
      try {
        const value = storage.getItem(legacy)
        if (value !== null && storage.getItem(key) === null) storage.setItem(key, value)
        storage.removeItem(legacy)
      } catch { /* storage unavailable */ }
    }
  }
  try { migrateBrowsers(storage) } catch { /* storage unavailable */ }
  try {
    const prefs = JSON.parse(storage.getItem(STORAGE.prefs) ?? 'null') as { theme?: unknown } | null
    const theme = typeof prefs?.theme === 'string' ? prefs.theme : ''
    const renamed = LEGACY_THEMES[theme]
    if (prefs !== null && renamed !== undefined) storage.setItem(STORAGE.prefs, JSON.stringify({ ...prefs, theme: renamed }))
  } catch { /* storage unavailable or not JSON */ }
}
