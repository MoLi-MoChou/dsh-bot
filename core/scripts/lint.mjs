// Lint with the oxlint that `npm run harness` installs in dev/harness, or that a
// deepseek-harness checkout installs, so ds-bot needs no copy of its own. The places are
// DSH_HARNESS, else dev/harness, else a checkout beside this checkout, else beside the main
// worktree (a git worktree has no deepseek-harness of its own).
//
// Then run the gates oxlint cannot express — layer boundaries, the 350-line limit for a
// migrated logic file, floating promises, and `.tsx` imports in tests — from
// `check-gates.mjs`. `npm run lint` is therefore one command for both, and the fixtures
// under test/fixtures/gates exercise the same script.
//
// Usage: npm run lint [-- <oxlint options>]
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const plugin = resolve(import.meta.dirname, '..')
const candidates = [process.env.DSH_HARNESS, join(plugin, 'dev', 'harness'), join(plugin, '..', 'deepseek-harness')]
try {
  const common = execFileSync('git', ['-C', plugin, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()
  candidates.push(join(dirname(common), 'deepseek-harness'))
} catch {}
// Node runs oxlint's own script: on Windows it cannot spawn the .cmd shim in node_modules/.bin
// without a shell.
const bin = candidates.filter(Boolean).map(dir => join(dir, 'node_modules', 'oxlint', 'bin', 'oxlint')).find(existsSync)
if (!bin) {
  console.error('lint: no oxlint found; run npm run harness, or set DSH_HARNESS to a deepseek-harness checkout')
  process.exit(2)
}
const result = spawnSync(process.execPath, [bin, '-c', '.oxlintrc.json', ...process.argv.slice(2), 'index.js', 'web-search.js', 'src', 'dev', 'scripts', 'test'], { cwd: plugin, stdio: 'inherit' })
if (result.error) console.error(`lint: ${result.error.message}`)

const gates = spawnSync(process.execPath, [join(plugin, 'scripts', 'check-gates.mjs')], { cwd: plugin, stdio: 'inherit' })
if (gates.error) console.error(`lint: ${gates.error.message}`)

const oxlintStatus = result.status ?? 1
const gatesStatus = gates.status ?? 1
process.exit(oxlintStatus !== 0 ? oxlintStatus : gatesStatus)
