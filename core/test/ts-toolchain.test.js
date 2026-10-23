import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// Phase 1 of the TypeScript migration is tooling and contracts: nothing here runs at
// runtime yet, so the gates are what the phase delivers. This test keeps the gate wiring
// itself from being dropped by a later edit.
const PLUGIN = fileURLToPath(new URL('..', import.meta.url))
const read = path => readFileSync(join(PLUGIN, path), 'utf8')
const packageJson = JSON.parse(read('package.json'))
const tsconfig = JSON.parse(read('tsconfig.json'))

test('the TypeScript toolchain is installed and wired into the gates', () => {
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit -p tsconfig.json')
  assert.ok(packageJson.devDependencies.typescript)
  assert.ok(packageJson.devDependencies['@types/node'])
  assert.ok(packageJson.devDependencies['@types/react'])
  // Zod is the shared contract's only runtime dependency, so it ships with the plugin.
  assert.ok(packageJson.dependencies.zod)
})

test('tsconfig keeps the migration gates on, and lets the existing JS stay as it is', () => {
  assert.equal(tsconfig.compilerOptions.strict, true)
  assert.equal(tsconfig.compilerOptions.allowJs, true)
  assert.equal(tsconfig.compilerOptions.checkJs, false)
  assert.equal(tsconfig.compilerOptions.noEmit, true)
  for (const gate of ['noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'noImplicitOverride', 'verbatimModuleSyntax']) {
    assert.equal(tsconfig.compilerOptions[gate], true, gate)
  }
  assert.deepEqual(tsconfig.include, ['src/**/*.ts', 'src/**/*.tsx'])
  // Phase 2 turns the client entry into TSX: the transform must be the shell's React,
  // never a second copy bundled into client.js.
  assert.equal(tsconfig.compilerOptions.jsx, 'react-jsx')
})

test('the client build accepts a TSX/TS entry and still writes the same client.js', () => {
  const script = read('scripts/build-client.mjs')
  assert.match(script, /src\/client\/index\.tsx/)
  assert.match(script, /src\/client\/index\.ts/)
  assert.match(script, /join\(PLUGIN, 'tsconfig\.json'\)/)
  for (const external of ['react/jsx-runtime', 'react/jsx-dev-runtime']) assert.ok(script.includes(external), external)
  assert.match(script, /node scripts\/build-client\.mjs --check/)
})

test('the shared contract layer exists and names the endpoints both ends share', () => {
  const rpc = read('src/shared/rpc.ts')
  for (const endpoint of ['state: {', 'chat: {', 'send: {', "'workspace-download': {"]) assert.ok(rpc.includes(endpoint), endpoint)
  // The envelope's error code is a closed union, not a free string.
  assert.match(rpc, /export type RpcErrorCode =/)
  for (const code of ["'bot/refused'", "'bot/stale'", "'bot/read-only'", "'bot/internal'", "'NETWORK'"]) assert.ok(rpc.includes(code), code)
  assert.match(rpc, /HTTP_\$\{number\}/)
  const schema = read('src/shared/schema.ts')
  for (const name of ['BotSchema', 'RoomSchema', 'ExchangeTurnSchema', 'MemoryEntrySchema', 'ScheduleTaskSchema', 'BotSkillSchema', 'BotWorkspaceSchema']) {
    assert.match(schema, new RegExp(`export const ${name}`))
  }
  const views = read('src/shared/views.ts')
  assert.match(views, /export interface DiffView/)
  assert.match(views, /export interface DiagramView/)
  // The Phase 3 cards are declared, not accepted yet: the runtime validator still knows
  // only the eight components the UI can draw.
  assert.doesNotMatch(read('src/shared/views.js'), /diff|diagram/)
})

test('the host types name the DSH context without importing a DSH install', () => {
  const types = read('src/host/dsh-types.ts')
  assert.match(types, /export interface DshContext/)
  assert.match(types, /sessionController/)
  assert.match(types, /workspaceRegistry/)
  assert.doesNotMatch(types, /from '@deepseek-ai\//)
})

test('the mentions contract and its runtime agree on who is a Bot', () => {
  const typed = read('src/shared/mentions.ts')
  assert.match(typed, /export const mentionSpans/)
  assert.match(typed, /export const nameProblem/)
  // The JS the host and client load is a re-export of the implementation, so the typed
  // layer and the running code cannot silently drift apart in resolution.
  assert.match(read('src/shared/mentions.js'), /export \* from '\.\/mentions\.runtime\.js'/)
})
