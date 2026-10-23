// The team records and actions the settings surfaces read. Kept apart from the pages so
// the settings dialog and the forms it shows describe the same contract.
import type { ModelEntry } from './model-menu.ts'
import type { SecretActions, SecretEntry, SecretRequest } from './secret-card.ts'
import type { Connector, ConnectorActions } from './connectors.ts'
import type { FolderMenuActions } from './folder-menu.ts'
import type { UsagePageProps } from './usage-page.ts'
import type { DiagnosticsReport } from './feedback.ts'

// The team records the settings page and its forms read; the rest passes through.
export interface SettingsBot {
  id: string
  name: string
  role?: string
  hidden?: boolean
  pinned?: boolean
  color?: string
  avatar?: { shape?: string; image?: string } | null
  model?: string
  appliedModel?: string
  effort?: string
  instructions?: string
  workDir?: string
  capabilities?: readonly string[]
}
export interface SettingsRoom {
  id: string
  name: string
  members: readonly string[]
  admin: string | null
  hidden?: boolean
}
export interface SettingsPrefs {
  theme?: string | undefined
  accent?: string | null | undefined
  motion?: string | undefined
}
export interface SettingsRoster {
  bots: SettingsBot[]
  rooms: SettingsRoom[]
  byId: Record<string, SettingsBot | undefined>
  roomsById: Record<string, SettingsRoom | undefined>
  prefs?: SettingsPrefs
  models?: readonly ModelEntry[]
  defaultModel?: string | null
  mainBotId?: string | null
  mainBotIds?: readonly string[]
  memory?: boolean
  connectors?: Connector[]
  secrets?: readonly SecretEntry[]
  secretRequests?: Record<string, readonly SecretRequest[] | undefined>
}
// A patch to one Bot; every field the forms save is optional.
export interface BotPatch {
  [key: string]: unknown
  name?: string
  role?: string
  instructions?: string
  workDir?: string
  model?: string
  effort?: string | null
  avatar?: { shape?: string; image?: string } | null
  color?: string | null
  pinned?: boolean
  hidden?: boolean
  permission?: string
}
export interface SettingsActions extends FolderMenuActions, SecretActions, ConnectorActions {
  closeSettings: () => void
  openSettings: (page: string, id?: string | null) => void
  setPrefs: (prefs: SettingsPrefs) => Promise<unknown>
  setMain: (id: string, main?: boolean, options?: { replace?: string; primary?: boolean }) => Promise<unknown>
  setFlags: (id: string, flags: { pinned?: boolean; hidden?: boolean }) => Promise<unknown>
  openMemory: (id: string) => void
  updateBot: (id: string, patch: BotPatch) => Promise<unknown>
  duplicateBot: (id: string) => Promise<{ id: string }>
  deleteBot: (id: string) => Promise<unknown>
  openSession: (id: string) => void
  createBot: (payload: Record<string, unknown>) => Promise<{ id: string }>
  closeOverlay: () => void
  setTeamWorkspace: (path: string) => Promise<{ team: string }>
  refreshModels?: (() => Promise<unknown>) | undefined
  providers?: (() => Promise<unknown>) | undefined
  openHarnessSettings?: ((page?: string) => void) | undefined
  setSurface?: ((mode: string) => void) | undefined
  usage: UsagePageProps['actions']['usage']
  diagnostics: (input: { readonly client: Record<string, string>; readonly clientErrors: unknown }) => Promise<DiagnosticsReport>
  diagnosticsLog: () => Promise<string>
  diagnosticsClear: () => Promise<unknown>
  dismissToast: (token: string) => void
}
export type RunWork = (work: Promise<unknown>) => Promise<boolean>
