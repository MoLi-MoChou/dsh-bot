// The runtime object the plugin builds once and threads through every host module.
//
// `core/index.js` creates it with the context and the config, then calls each module's
// `install(rt)`. A module both reads what earlier modules put on `rt` and adds its own
// functions. This interface holds the slice today's TypeScript modules need; it grows a
// batch at a time as the rest of `src/host` moves over. Nothing here runs: types only.
import type { Agent, AttachmentRef, DshContext, SessionEvent } from './dsh-types.ts'

export interface HostConfig {
  readonly home?: string
  readonly mainName?: string
  readonly mainRole?: string
  readonly timeRefreshIntervalMs?: number
  readonly timeZone?: string
}

export interface HostDefaults {
  readonly mainName: string
  readonly mainRole: string
}

/** A Bot as `state.json` stores it. */
export interface StoredBot {
  readonly id: string
  name: string
  role?: string
  instructions?: string
  permission?: string
  sessionId?: string
  segments?: readonly { readonly sessionId: string }[]
  workDir?: string
  readonly [key: string]: unknown
}

/** A group as `state.json` stores it. */
export interface StoredRoom {
  readonly id: string
  name: string
  admin?: string
  permission?: string | null
  sessions?: Record<string, string>
  segments?: Record<string, readonly { readonly sessionId: string }[]>
  workDir?: string
  readonly [key: string]: unknown
}

/** One recorded exchange between two Bots, in `state.exchanges`. */
export interface ExchangeEntry {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly text: string
  readonly role?: string
  readonly time?: number
  readonly length?: number
  readonly sessionId?: string
  readonly files?: readonly AttachmentRef[]
  readonly replyTo?: string
  readonly audience?: string
}

/** A work item another Bot handed on, in `state.works`. */
export interface StoredWork {
  readonly from?: string
  readonly [key: string]: unknown
}

/** The team as `state.json` stores it. */
export interface StoredState {
  revision: number
  bots: Record<string, StoredBot>
  rooms: Record<string, StoredRoom>
  exchangeTurns: Record<string, readonly number[]>
  exchanges: ExchangeEntry[]
  works?: Record<string, StoredWork>
  readonly [key: string]: unknown
}

/** An approval entry as the team view reads it. */
export interface ApprovalDetail {
  readonly text?: string
  readonly code?: string
}

export interface ApprovalNote {
  readonly tool: string
  readonly reason: string
}

export interface HostRuntime {
  readonly ctx: DshContext
  readonly config: HostConfig
  readonly dshHome: string
  readonly home: string
  readonly statePath: string
  readonly defaults: HostDefaults

  // --- provided by store.ts
  readonly state: StoredState
  readonly chatOwners: Map<string, string>
  readonly groupOwners: Map<string, { readonly botId: string; readonly roomId: string }>
  readonly pastOwners: Map<string, { readonly botId: string; readonly roomId?: string }>
  load(): Promise<unknown>
  botOf(botId: string | undefined): StoredBot | undefined
  roomOf(roomId: string | undefined): StoredRoom | undefined
  chatOf(botId: string): string
  selfOf(sessionId: string | undefined): string | undefined
  isBotSession(sessionId: string): boolean
  isMain(id: string | undefined): boolean
  groupSessionsOf(botId: string): readonly string[]

  // --- provided by chat-index.ts
  eventsBackwards(
    sessionId: string,
    signal?: AbortSignal,
    maxPages?: number,
  ): AsyncIterable<SessionEvent>

  // --- provided by delivery.ts and diagnostics.ts
  resolveAgent(sessionId: string): Promise<Agent>
  warn(template: string, ...args: readonly unknown[]): void
  save(): Promise<unknown>

  // --- provided by turns.ts, groups.ts and resume.ts
  callDetail?(sessionId: string | undefined, callId?: string): ApprovalDetail
  yieldRoomTurn?(sessionId: string | undefined): void
  noteApproval?(sessionId: string | undefined, note: ApprovalNote | undefined): void

  // --- provided by capabilities.ts and tools.ts
  ensureCapabilities(sessionId: string): Promise<unknown>
  hideBotUnusedTools(agent: Agent): void

  // --- provided by parts.ts and folders.ts
  displayItems(sessionId: string, events: readonly SessionEvent[]): readonly unknown[]
  teamFolder?(): string | undefined
  defaultTeamFolder?(): string | undefined

  // --- provided by thinking.ts and feed.ts
  thinkingOf?: (sessionId: string, turn: number) => Promise<number | undefined>
  stateSaved?: () => void

  // --- provided by workspace-files.ts
  workspaceDownload?: (path: string) => Promise<unknown>
  workspaceDescribe?: (path: string) => Promise<unknown>
}
