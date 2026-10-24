// DS Bot: a team of long-lived Bots on top of ordinary dsh root Sessions.
// Every Bot is one root Session; the roster, rooms, and the bot-to-bot exchange log live
// in one JSON file under DSH_HOME so they survive restarts without new Session event types.
import { join } from 'node:path'
import * as diagnostics from './dist/host/diagnostics.js'
import * as store from './dist/host/store.js'
import * as models from './dist/host/models.js'
import * as providers from './dist/host/providers.js'
import * as permissions from './dist/host/permissions.js'
import * as turns from './dist/host/turns.js'
import * as handoffs from './dist/host/handoffs.js'
import * as delivery from './dist/host/delivery.js'
import * as roster from './dist/host/roster.js'
import * as folders from './dist/host/folders.js'
import * as agents from './dist/host/agents.js'
import * as prompt from './dist/host/prompt.js'
import * as timeContext from './dist/host/time-context.js'
import * as tools from './dist/host/tools.js'
import * as chatIndex from './dist/host/chat-index.js'
import * as groups from './dist/host/groups.js'
import * as approvals from './dist/host/approvals.js'
import * as resume from './dist/host/resume.js'
import * as memory from './dist/host/memory.js'
import * as parts from './dist/host/parts.js'
import * as images from './dist/host/images.js'
import * as browser from './dist/host/browser.js'
import * as secrets from './dist/host/secrets.js'
import * as connectors from './dist/host/connectors.js'
import * as capabilities from './dist/host/capabilities.js'
import * as schedules from './dist/host/schedules.js'
import * as usage from './dist/host/usage.js'
import * as update from './dist/host/update.js'
import * as dshUpdate from './dist/host/dsh-update.js'
import * as thinking from './dist/host/thinking.js'
import * as channel from './dist/host/channel.js'
import * as feed from './dist/host/feed.js'
import * as workspaceFiles from './dist/host/workspace-files.js'

export { COLORS } from './dist/host/constants.js'

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
