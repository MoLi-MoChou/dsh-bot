import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// The oxlint rules and the three gates oxlint cannot see are separate promises. These
// fixtures exercise the gates that were fake before: the type-aware floating-promise
// check, the layer boundaries, and the size limit. The `any` fixture is optioned by the
// real config through oxlint instead.
const PLUGIN = fileURLToPath(new URL('..', import.meta.url))
const CHECK = join(PLUGIN, 'scripts', 'check-gates.mjs')
const FIXTURES = join(PLUGIN, 'test', 'fixtures', 'gates')
const OXLINT = join(PLUGIN, 'dev', 'harness', 'node_modules', 'oxlint', 'bin', 'oxlint')

const runGates = fixture =>
  spawnSync(process.execPath, [CHECK, '--root', join(FIXTURES, fixture)], {
    cwd: PLUGIN,
    encoding: 'utf8',
  })
const output = result => `${result.stdout}${result.stderr}`

test('a floating promise fails with the file, line and call text', () => {
  const result = runGates('floating')
  assert.notEqual(result.status, 0, output(result))
  assert.match(output(result), /src\/floating\.ts:3 - floating promise: work\(\)/)
  // Await, void and .then() are the three sanctioned forms; only the bare call is a failure.
  assert.match(output(result), /1 floating-promise/)
})

test('each layer boundary fails with a specific message', () => {
  const result = runGates('boundary')
  assert.notEqual(result.status, 0, output(result))
  const text = output(result)
  assert.match(text, /client may not import host/)
  assert.match(text, /host may not import client/)
  assert.match(text, /shared may not import host/)
  assert.match(text, /shared may import only zod and its own files/)
})

test('a file one line over the limit fails', () => {
  const result = runGates('lines')
  assert.notEqual(result.status, 0, output(result))
  assert.match(output(result), /src\/long\.ts: 351 lines \(max 350\)/)
})

test('a clean fixture passes with the one-line success message', () => {
  const result = runGates('clean')
  assert.equal(result.status, 0, output(result))
  assert.equal(result.stdout.trim(), 'gates: ok')
})

test('the any fixture is caught by the configured oxlint rule', t => {
  if (!existsSync(OXLINT)) return t.skip('dev/harness oxlint is not installed')
  // The real config ignores test fixtures so `npm run lint` stays green. Drop only that
  // ignore list for this direct probe; everything else, including the rule itself, is real.
  const config = JSON.parse(readFileSync(join(PLUGIN, '.oxlintrc.json'), 'utf8'))
  const directory = mkdtempSync(join(tmpdir(), 'moon-bot-gates-'))
  try {
    const configPath = join(directory, 'oxlint.json')
    writeFileSync(configPath, JSON.stringify({ ...config, ignorePatterns: [] }))
    const result = spawnSync(
      process.execPath,
      [OXLINT, '-c', configPath, join(FIXTURES, 'any', 'src', 'any.ts')],
      { cwd: PLUGIN, encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0, output(result))
    assert.match(output(result), /no-explicit-any/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
