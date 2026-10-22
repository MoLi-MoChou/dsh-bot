// Moon Bot: the files one turn wrote or delivered, for the cards under its reply. The
// host collects them when the turn closes (host/turn-files.js) and the team's state
// carries them as `turnFiles[sessionId] = { folder, turns: { "<turn>": [file] } }`; the
// roster keeps the whole state, so they arrive with every revision.

const EMPTY = []

const absolute = (folder, path) => (folder === undefined || folder === null || folder === ''
  ? path
  : `${String(folder).replace(/[\\/]+$/, '')}/${path}`)

// A file as the cards and the workspace endpoints want it: an absolute `path`, plus the
// name, size and type the message carries. `filesFolder` covers a history entry, whose
// own folder is given with its files.
export function turnFilesOf(roster, sessionId, turn) {
  const entry = roster?.turnFiles?.[sessionId]
  const files = entry?.turns?.[String(turn)]
  if (!Array.isArray(files) || files.length === 0) return EMPTY
  const folder = entry.folder
  return files.map(file => ({ ...file, path: absolute(folder, file.path) }))
}

// The same, for a history page item (`chat` / `earlier`), which names its folder itself.
export function itemFilesOf(item) {
  if (!Array.isArray(item?.files) || item.files.length === 0) return EMPTY
  return item.files.map(file => ({ ...file, path: absolute(item.filesFolder, file.path) }))
}
