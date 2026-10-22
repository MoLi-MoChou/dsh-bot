// DSH Bot patch: small, checked edits to installed dependencies (run on postinstall and
// before packing). Each edit names the exact text it replaces; a dependency upgrade that
// changes that text fails loudly instead of silently dropping the fix.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EDITS = [{
  // A provider that answers a per-minute limit (429, "tpm/rpm limit", "too many requests")
  // with an `insufficient_quota` code was shown as "quota used up" and not retried. A rate
  // limit is tried again after a pause, so it is classified as one first.
  file: 'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js',
  from: '\tif (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;\n',
  to: '\tif (/\\b(?:tpm|rpm|tokens per minute|requests per minute)\\b|too many requests|rate.?limit(?:ed)?\\b/i.test(message)) return "RATE_LIMIT"; // DSH Bot patch\n\tif (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;\n',
}, {
  file: 'node_modules/@deepseek-ai/dsh-llm-deepseek/lib/index.js',
  from: '\telse if (isQuotaExceededError(detail) || status === 402) code = "QUOTA";\n',
  to: '\telse if (status === 429 && /\\b(?:tpm|rpm)\\b|too many requests|rate.?limit/i.test(detail)) code = "RATE_LIMIT"; // DSH Bot patch\n\telse if (isQuotaExceededError(detail) || status === 402) code = "QUOTA";\n',
}]

/** Apply every edit under `appDir`; already-applied edits are skipped. Returns the files changed. */
export function patchDeps(appDir) {
  const changed = []
  for (const { file, from, to } of EDITS) {
    const path = join(appDir, file)
    const source = readFileSync(path, 'utf8')
    if (source.includes(to)) continue
    if (!source.includes(from)) throw new Error(`patch-deps: ${file} changed; update scripts/patch-deps.mjs`)
    writeFileSync(path, source.replace(from, to))
    changed.push(file)
  }
  return changed
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const changed = patchDeps(join(dirname(fileURLToPath(import.meta.url)), '..'))
  console.log(`patch-deps: ${changed.length ? changed.join(', ') : 'already applied'}`)
}
