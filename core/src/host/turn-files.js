// Turn files: the files one turn wrote, for the file cards in a Bot's chat. The folder
// is snapshotted when the turn starts and compared when it ends, so a file a shell
// command wrote counts too, not only the ones a file tool named.
import { readdir, stat } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { mimeOf } from './workspace-files.js'

// A message shows at most this many cards; the rest are counted as `more`.
export const TURN_FILES_MAX = 20
// A Session keeps the files of its last turns, and the team keeps that many Sessions.
export const TURN_FILES_KEPT = 20
export const TURN_FILES_SESSIONS = 200
// Scanning stops here so one turn cannot walk a whole project tree.
const SCAN_MAX = 4000
const SCAN_DEPTH = 6
const SKIP_DIRS = new Set(['node_modules', '__pycache__', '.venv', 'venv', '.tox', '.pytest_cache', '.mypy_cache', '.next', '.turbo', '.gradle', '.idea', '.git'])
// Temporary files, and what the file systems of each platform leave behind.
const TEMP_FILE = /(^\.DS_Store$|^Thumbs\.db$|~$|\.(tmp|temp|swp|swx|part|partial|crdownload|download)$)/i

export const isTempFile = name => TEMP_FILE.test(name)
export const isSkippedDir = name => SKIP_DIRS.has(name) || name.startsWith('.')

const portable = path => path.split(sep).join('/')

// Every file under `root` as `relative path → { size, mtimeMs }`. Rejects when the root
// itself cannot be read: an empty folder and an unreadable one must not look alike, or a
// later scan would report every file in it as new.
export async function snapshot(root) {
  const found = new Map()
  const walk = async (dir, depth) => {
    if (found.size >= SCAN_MAX) return
    // The root must be readable; a subfolder that is not is left out, since a turn does
    // not fail because something in it was closed to us.
    const items = await readdir(dir, { withFileTypes: true }).catch(error => {
      if (depth === 1) throw error
      return undefined
    })
    if (items === undefined) return
    items.sort((a, b) => a.name.localeCompare(b.name))
    for (const item of items) {
      if (found.size >= SCAN_MAX) return
      if (item.isDirectory()) {
        if (depth < SCAN_DEPTH && !isSkippedDir(item.name)) await walk(join(dir, item.name), depth + 1)
        continue
      }
      if (!item.isFile() || isTempFile(item.name)) continue
      const info = await stat(join(dir, item.name)).catch(() => undefined)
      if (info === undefined || !info.isFile()) continue
      found.set(portable(relative(root, join(dir, item.name))), { size: info.size, mtimeMs: info.mtimeMs })
    }
  }
  await walk(root, 1)
  return found
}

// The files that are new or changed since `before`, sorted; the caller caps the list.
export function changes(before, after) {
  const paths = []
  for (const [path, now] of after) {
    const was = before.get(path)
    if (was !== undefined && was.size === now.size && was.mtimeMs === now.mtimeMs) continue
    paths.push(path)
  }
  paths.sort((a, b) => a.localeCompare(b))
  return paths
}

// The card entries of `paths`, as the chat and its downloads take them.
export function cards(paths, after) {
  return paths.map(path => {
    const name = basename(path)
    return { path, name, size: after.get(path)?.size ?? 0, mime: mimeOf(name) }
  })
}

// What one turn shows: at most TURN_FILES_MAX cards and how many were left over.
export function producedOf(before, after) {
  const changed = changes(before, after)
  const listed = changed.slice(0, TURN_FILES_MAX)
  const more = changed.length - listed.length
  return { produced: cards(listed, after), ...(more > 0 ? { more } : {}) }
}
