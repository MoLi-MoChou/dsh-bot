import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PRUNED_BUNDLES, pruneDshManifest, prunedPackages } from '../scripts/prune.mjs'

test('drops the pruned optional bundles from dsh and keeps the rest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prune-'))
  const file = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  mkdirSync(join(file, '..'), { recursive: true })
  const deps = Object.fromEntries([...Object.keys(PRUNED_BUNDLES), '@deepseek-ai/dsh-experimental-voice-input-bundle'].map(n => [n, '1']))
  writeFileSync(file, JSON.stringify({ dependencies: deps }))
  assert.equal(pruneDshManifest(dir).length, Object.keys(PRUNED_BUNDLES).length)
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8')).dependencies), ['@deepseek-ai/dsh-experimental-voice-input-bundle'])
  assert.deepEqual(pruneDshManifest(dir), [])
})

test('every pruned package is excluded from the package', () => {
  const yml = readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8')
  for (const name of prunedPackages()) assert.ok(yml.includes(name.replace('@deepseek-ai/', '')), name)
})
