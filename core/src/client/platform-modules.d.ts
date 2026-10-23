// The Desktop bridge the window may carry; the Web build has no such member.
interface Window { dshDesktop?: DshDesktopBridge }

// One Bot's browser lease. `partition` keeps its cookies and logins apart from every
// other Bot; `onOpenRequested` answers a page that asks for a new window with the new
// tab's URL and returns the unsubscribe.
interface DshBrowserLease {
  lease: string
  partition: string
}
interface DshBrowserBridge {
  acquire(key: string): Promise<DshBrowserLease>
  release(lease: string): Promise<unknown>
  onOpenRequested(lease: string, listener: (url: string) => void): () => void
}
interface DshDesktopBridge {
  protocolVersion?: number
  updates?: unknown
  browser?: DshBrowserBridge
}

// Electron's guest callbacks carry more than a plain Event.
interface WebviewNavigationEvent extends Event {
  url: string
  isMainFrame: boolean
}
interface WebviewLoadFailEvent extends Event {
  errorCode: number
  errorDescription: string
  isMainFrame: boolean
}
interface WebviewFaviconEvent extends Event {
  favicons: readonly string[]
}
interface WebviewEventMap {
  'dom-ready': Event
  'did-navigate': Event
  'did-navigate-in-page': Event
  'did-start-loading': Event
  'did-stop-loading': Event
  'page-title-updated': Event
  'page-favicon-updated': WebviewFaviconEvent
  'did-start-navigation': WebviewNavigationEvent
  'did-fail-load': WebviewLoadFailEvent
  'render-process-gone': Event
}

// The Electron <webview> the Desktop shell provides. `executeJavaScript` returns whatever
// the page script evaluates to, so the caller names the result type.
interface WebviewElement extends HTMLElement {
  getURL(): string
  getTitle(): string
  isLoading(): boolean
  canGoBack(): boolean
  canGoForward(): boolean
  clearHistory(): void
  loadURL(url: string): Promise<void>
  stop(): void
  reload(): void
  goBack(): void
  goForward(): void
  focus(): void
  executeJavaScript<T = unknown>(code: string): Promise<T>
  addEventListener<K extends keyof WebviewEventMap>(type: K, listener: (event: WebviewEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
}
interface HTMLElementTagNameMap { webview: WebviewElement }

// The modules the DSH shell seeds into the client bundle's `require`. They resolve at
// runtime; this declaration keeps `tsc` happy without pulling DSH's own types in.
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement } from 'react'
  export const FishLogo: (props: Record<string, unknown>) => ReactElement | null
  export const MarkdownText: (props: Record<string, unknown>) => ReactElement | null
  // The rest of the shell's text and attachment helpers a message cell draws with.
  export const projectUserText: (text: string, referenceLabels: readonly string[], skillNames: readonly string[], kind: string, references: unknown) => ReactElement | null
  export const fileExtension: (name: string) => string | undefined
  export const fileSizeText: (bytes: number | undefined) => string | undefined
  export const FileTypeIcon: (props: { path: string; className?: string }) => ReactElement | null
  export const JsonBlock: (props: { label: string; payload: unknown }) => ReactElement | null
}

// react-dom is a runtime dependency the shell supplies; only its types are missing here,
// so declare the one function the client calls. A portal is a React child either way.
declare module 'react-dom' {
  import type { ReactNode } from 'react'
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactNode
}
