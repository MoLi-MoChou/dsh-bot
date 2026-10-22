// Mochou patch: optional DSH bundles the slim product does not offer. They are
// switched off in DSH by default and only show up as toggles on the Plugins page; DSH
// lists every bundle named in @deepseek-ai/dsh's dependencies, so they are dropped from
// that list (packaged copy) and their files are left out (electron-builder.yml).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PRUNED_BUNDLES = {
  '@deepseek-ai/dsh-experimental-inspector-profile': ['@deepseek-ai/dsh-experimental-inspector', '@deepseek-ai/dsh-experimental-session-inspector'],
  '@deepseek-ai/dsh-experimental-agent-team-profile': ['@deepseek-ai/dsh-experimental-agent-team', '@deepseek-ai/dsh-experimental-client-ui-agent-team', '@deepseek-ai/dsh-experimental-tool-agent-team'],
  '@deepseek-ai/dsh-experimental-ralph-bundle': [],
  '@deepseek-ai/dsh-experimental-badge-skill-bundle': [],
  '@deepseek-ai/dsh-experimental-cot-translation-bundle': ['@deepseek-ai/dsh-experimental-translator', '@deepseek-ai/dsh-experimental-client-ui-cot-translation'],
  '@deepseek-ai/dsh-experimental-plugin-market-bundle': [],
  '@deepseek-ai/dsh-experimental-tool-worktree': ['@deepseek-ai/dsh-experimental-worktree'],
}
export const prunedPackages = () => Object.entries(PRUNED_BUNDLES).flatMap(([name, parts]) => [name, ...parts])

/** Drop the pruned bundles from dsh's dependency list; returns the names it removed. */
export function pruneDshManifest(appDir) {
  const file = join(appDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  const removed = Object.keys(PRUNED_BUNDLES).filter(name => manifest.dependencies && name in manifest.dependencies)
  for (const name of removed) delete manifest.dependencies[name]
  if (removed.length) writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
  return removed
}
