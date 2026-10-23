// DS Bot: a team of long-lived Bots on top of ordinary dsh root Sessions.
// Every Bot is one root Session; the roster, rooms, and the bot-to-bot exchange log live
// in one JSON file under DSH_HOME so they survive restarts without new Session event types.
import { join } from 'node:path'
import * as diagnostics from './src/host/diagnostics.ts'
import * as store from './src/host/store.js'
import * as models from './src/host/models.ts'
import * as providers from './src/host/providers.ts'
import * as permissions from './src/host/permissions.ts'
import * as turns from './src/host/turns.js'
import * as handoffs from './src/host/handoffs.ts'
import * as delivery from './src/host/delivery.ts'
import * as roster from './src/host/roster.js'
import * as folders from './src/host/folders.ts'
import * as agents from './src/host/agents.ts'
import * as prompt from './src/host/prompt.ts'
import * as timeContext from './src/host/time-context.ts'
import * as tools from './src/host/tools.js'
import * as chatIndex from './src/host/chat-index.ts'
import * as groups from './src/host/groups.js'
import * as approvals from './src/host/approvals.ts'
import * as resume from './src/host/resume.ts'
import * as memory from './src/host/memory.js'
import * as parts from './src/host/parts.js'
import * as images from './src/host/images.ts'
import * as browser from './src/host/browser.ts'
import * as secrets from './src/host/secrets.js'
import * as connectors from './src/host/connectors.ts'
import * as capabilities from './src/host/capabilities.js'
import * as schedules from './src/host/schedules.ts'
import * as usage from './src/host/usage.js'
import * as update from './src/host/update.ts'
import * as dshUpdate from './src/host/dsh-update.ts'
import * as thinking from './src/host/thinking.ts'
import * as channel from './src/host/channel.js'
import * as feed from './src/host/feed.ts'
import * as workspaceFiles from './src/host/workspace-files.ts'

export { COLORS } from './src/host/constants.ts'

export const name = 'ds-bot'
export const inject = ['llm', 'tools', 'systemPrompt', 'sessionController', 'sessions', 'sessionTitle', 'workspaceRegistry', 'connection']

// Each module's install(rt) registers its listeners, tools, and effects, and puts on `rt`
// the functions other modules call; they call them through `rt` at run time, never during
// install. Listeners run and tools are listed in registration order, so this order holds:
// usage meters model requests after every listener that rewrites them.
const MODULES = [diagnostics, store, models, providers, permissions, turns, handoffs, delivery, roster, folders, agents, prompt, timeContext, tools, chatIndex, groups, approvals, resume, memory, parts, images, secrets, connectors, capabilities, schedules, browser, usage, update, dshUpdate, thinking, feed, workspaceFiles, channel]

export function apply(ctx, config = {}) {
  createRuntime(ctx, config)
}

export function createRuntime(ctx, config = {}) {
  const dshHome = folders.dshHomeOf(process.env.DSH_HOME)
  const home = config.home ?? join(dshHome, 'bot')
  const rt = {
    ctx,
    config,
    dshHome,
    home,
    statePath: join(home, 'state.json'),
    defaults: {
      mainName: config.mainName ?? 'Chief',
      mainRole: config.mainRole ?? 'Chief of Staff',
    },
  }
  for (const module of MODULES) module.install(rt)
  return rt
}
