// Lint with the oxlint that `npm run harness` installs in dev/harness, or that a
// deepseek-harness checkout installs, so ds-bot needs no copy of its own. The places are
// DSH_HARNESS, else dev/harness, else a checkout beside this checkout, else beside the main
// worktree (a git worktree has no deepseek-harness of its own).
// After oxlint, run the gates oxlint cannot do without type information: the layer
// boundaries, the 350-line size limit, and floating promises (see check-gates.mjs).
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
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)

const gates = spawnSync(process.execPath, ['scripts/check-gates.mjs'], { cwd: plugin, stdio: 'inherit' })
if (gates.error) console.error(`lint: ${gates.error.message}`)
process.exit(gates.status ?? 1)
