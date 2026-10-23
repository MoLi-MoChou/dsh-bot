// Whether the update card shows a DSH row. An npm DSH is swapped for the verified
// version itself; a packaged app installs only what its own updater found, its
// newest release, so its row waits until that release is the verified one.
const APP_OFFER = new Set<string>(['available', 'downloading', 'verifying', 'installing', 'ready'])

const bare = (value: unknown): string => String(value ?? '').trim().replace(/^v/i, '').split('+')[0] ?? ''

export const sameVersion = (a: unknown, b: unknown): boolean => bare(a) !== '' && bare(a) === bare(b)

export interface DshState { verified?: string; current?: string; kind?: string }
export interface AppState { phase?: string; version?: string }

export function showsDshRow(dsh: DshState | undefined, app: AppState | undefined): boolean {
  if (!dsh?.verified || !dsh.current || sameVersion(dsh.verified, dsh.current)) return false
  if (dsh.kind === 'npm') return true
  return dsh.kind === 'app' && app?.phase !== undefined && APP_OFFER.has(app.phase) && sameVersion(app.version, dsh.verified)
}
