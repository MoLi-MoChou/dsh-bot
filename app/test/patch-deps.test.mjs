import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EDITS, patchDeps } from '../scripts/patch-deps.mjs'

test('dependency edits apply and are idempotent', () => {
  const root = new URL('..', import.meta.url).pathname
  patchDeps(root)
  for (const { file, to } of EDITS) assert.ok(readFileSync(root + file, 'utf8').includes(to), file)
  assert.deepEqual(patchDeps(root), [])
})

test('a per-minute limit is a rate limit, a used-up balance stays quota', async () => {
  const src = readFileSync(new URL('../node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js', import.meta.url), 'utf8')
  const body = /function classifyPiAiError\(message\) \{[\s\S]*?\n\}/.exec(src)[0]
  const classify = new Function('isQuotaExceededError', 'QUOTA_EXCEEDED_CODE', `${body}; return classifyPiAiError`)((m) => /insufficient[\s_-]+quota/i.test(m), 'QUOTA')
  assert.equal(classify('429 inference exceeds tpm/rpm limit (insufficient_quota)'), 'RATE_LIMIT')
  assert.equal(classify('402 insufficient_quota: balance exhausted'), 'QUOTA')
})
