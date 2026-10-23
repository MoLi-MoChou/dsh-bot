// The DeepSeek Harness plugin API, as far as Moon Bot uses it.
//
// DSH is the底座 and must not be patched or re-exported: these are structural types for the
// context and services a plugin receives, written here so the host can be checked without
// depending on files inside a DSH install. When DSH changes an API, this file changes.
//
// Nothing in this module runs: it is types only, so JS and TS host code can both use it.

/** The disposer cordis hands back for anything it registers. */
export type Disposer = () => void

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

// ---------------------------------------------------------------------------
// Sessions and agents

export interface SessionHeader {
  /** The folder DSH runs the session's tools in. */
  readonly cwd?: string
  readonly [key: string]: unknown
}

export interface SessionEvent {
  readonly type: string
  readonly seq?: number
  readonly time?: number
  readonly data?: Record<string, unknown>
}

/** One message DSH put in a Session's inbox, as a plugin sees it before delivery. */
export interface InboxMessage {
  readonly id: string
  readonly source?: Record<string, unknown>
  readonly content?: unknown
}

export interface AgentSession {
  readonly id: string
  readonly seq: number
  readonly header?: SessionHeader
  /** The event at `seq`, when this DSH keeps history in memory. */
  eventAt?(seq: number): SessionEvent | undefined
  deriveMessages?(): unknown[]
}

export interface SessionInbox {
  readonly nextStep: readonly InboxMessage[]
  readonly nextTurn: readonly InboxMessage[]
  remove(id: string): boolean
}

export interface Agent {
  readonly id: string
  readonly session: AgentSession
  readonly inbox?: SessionInbox
  readonly status?: string
  followup(message: unknown): void
  steer(message: unknown): void
  inject(message: unknown): void
  cancel(cause?: { readonly kind?: string; readonly reason?: string }): void
  whenIdle?(): Promise<void>
  runMaintenance?<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T>
}

export interface SessionCreateOptions {
  /** A folder outside the team workspace; DSH makes the session by cwd alone. */
  readonly cwd?: string
  readonly workspaceId?: string
  readonly agentPreset?: string
}

export interface SessionPageRecord {
  readonly event: SessionEvent
}

export interface SessionPage {
  readonly records: readonly SessionPageRecord[]
  readonly hasMore: boolean
}

export interface SessionController {
  create(options: SessionCreateOptions): Promise<{ readonly sessionId: string }>
  resolveAgent(sessionId: string): Promise<{ readonly agent: Agent } | { readonly error?: { readonly code?: string; readonly message?: string } }>
  page(options: {
    readonly address: { readonly kind: 'session'; readonly sessionId: string }
    readonly throughSeq?: number
    readonly beforeSeq?: number
    readonly maxMessages?: number
  }, signal?: AbortSignal): Promise<SessionPage>
  selectModel(sessionId: string, route: unknown): Promise<void>
}

export interface SessionsService {
  flush(session: unknown): Promise<void>
  list?: { getSnapshot?(): { readonly byId?: Record<string, unknown> } }
  refreshProjections?(sessionId: string): Promise<void>
}

export interface SessionTitleService {
  rename(session: unknown, title: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Session events a plugin listens to

export type MessageContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool-call'; readonly [key: string]: unknown }
  | { readonly type: 'file'; readonly attachment?: unknown }
  | { readonly type: 'image'; readonly [key: string]: unknown }
  | { readonly type: string; readonly [key: string]: unknown }

export interface UserMessageEvent {
  readonly content?: readonly MessageContentBlock[]
  readonly source?: Record<string, unknown>
}

export interface AssistantMessageEvent {
  readonly turn?: number
  readonly step?: number
  readonly message?: { readonly content?: readonly MessageContentBlock[] }
}

export interface TurnEndReason {
  readonly kind?: 'completed' | 'aborted' | 'error' | string
  readonly error?: { readonly code?: string; readonly message?: string; readonly status?: number }
}

export interface TurnEndEvent {
  readonly turn?: number
  readonly reason?: TurnEndReason
}

// ---------------------------------------------------------------------------
// Tools

export interface ToolParameter {
  readonly type: string
  readonly description?: string
  readonly enum?: readonly string[]
  readonly items?: ToolParameter
  readonly [key: string]: unknown
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, ToolParameter>>
  readonly output?: unknown
  execute(args: Readonly<Record<string, unknown>>, exec: ToolExecution): Promise<unknown>
}

export interface ToolExecution {
  readonly name?: string
  readonly callId?: string
  readonly agent?: Agent
  readonly signal?: AbortSignal
}

export interface ToolsService {
  register(tool: ToolDefinition): Disposer
  guard(guard: (exec: ToolExecution) => Promise<unknown> | unknown): void
  schemas(): readonly unknown[]
}

// ---------------------------------------------------------------------------
// LLM, workspaces, connections

export interface LlmService {
  listProviders?(): readonly unknown[]
  listModels?(): Promise<readonly unknown[]>
  resolveModelInfo?(ref: string): Promise<unknown>
  stream?(options: unknown): AsyncIterable<unknown>
}

export interface Workspace {
  readonly id: string
  readonly path: string
  readonly title?: string
}

export interface WorkspaceRegistry {
  get(id: string | undefined): Workspace | undefined
  list?(): readonly Workspace[]
  resolveByPath(path: string): Promise<Workspace | undefined>
  create(path: string, title?: string): Promise<Workspace>
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
}

export interface FetchRoute {
  readonly path: string
  readonly methods: readonly string[]
  readonly requestBody?: 'buffered' | 'stream'
  fetch(request: Request): Promise<Response>
}

export interface ConnectionService {
  readonly fetch: { register(route: FetchRoute): Disposer }
}

export interface PromptSection {
  readonly name: string
  readonly order: number
  text(context: unknown): string
}

export interface SystemPromptService {
  section(section: PromptSection): Disposer
}

// ---------------------------------------------------------------------------
// Services a plugin asks for by name (`ctx.get`)

export interface AttachmentRef {
  readonly attachmentId: string
  readonly name: string
  readonly bytes?: number
}

export interface AttachmentsService {
  saveFile(input: { readonly data: Uint8Array; readonly name: string }): Promise<AttachmentRef>
  readFileStream(ref: AttachmentRef, signal?: AbortSignal): AsyncIterable<Uint8Array>
}

export interface ApprovalRequest {
  readonly agent: Agent
  readonly toolName?: string
  readonly callId?: string
  readonly reason: string
  readonly displayReason?: { readonly en: string; readonly zh?: string }
  readonly signal?: AbortSignal
}

export type ApprovalOutcome = 'allowed-once' | 'allowed' | 'rejected' | 'cancelled'

export interface ApprovalService {
  request(request: ApprovalRequest): Promise<ApprovalOutcome>
}

export interface SandboxPolicy {
  resolve(input?: { readonly session?: AgentSession }): { readonly mode: string }
}

export interface WorkingDirectoryService {
  get(session: AgentSession): string | undefined
  set(agent: Agent, path: string, signal?: AbortSignal): Promise<void>
}

export interface DirectoryPicker {
  capability(): { readonly kind: 'native' | 'browse' | string }
  pick(signal?: AbortSignal): Promise<string>
  list(path?: string, signal?: AbortSignal): Promise<{
    readonly path: string
    readonly home: string
    readonly crumbs: readonly unknown[]
    readonly entries: readonly unknown[]
    readonly truncated?: boolean
  }>
}

export interface AgentPresetsService {
  list(): Promise<readonly { readonly id: string; readonly broken?: string }[]>
}

export interface LocaleService {
  getLocale(): { readonly active: string }
}

/** The services `ctx.get(name)` may return, by the names the host asks for. */
export interface DshServices {
  readonly attachments: AttachmentsService
  readonly approval: ApprovalService
  readonly sandboxPolicy: SandboxPolicy
  readonly workingDirectory: WorkingDirectoryService
  readonly directoryPicker: DirectoryPicker
  readonly agentPresets: AgentPresetsService
  readonly locale: LocaleService
}

export type DshServiceName = keyof DshServices

// ---------------------------------------------------------------------------
// The plugin context

export interface DshContext {
  readonly logger: Logger
  get<T>(name: string): T | undefined
  on(name: string, listener: (payload: unknown) => unknown, options?: { readonly prepend?: boolean }): Disposer
  emit?(name: string, payload: unknown): void
  effect(execute: () => void | Disposer, label?: string): void
  plugin?(plugin: unknown, config?: unknown): Disposer
  inject?(dependencies: readonly string[], inject: (ctx: DshContext) => void): void
  readonly tools: ToolsService
  readonly llm: LlmService
  readonly sessions: SessionsService
  readonly sessionController: SessionController
  readonly sessionTitle: SessionTitleService
  readonly workspaceRegistry: WorkspaceRegistry
  readonly connection: ConnectionService
  readonly systemPrompt: SystemPromptService
  readonly fiber?: unknown
}
