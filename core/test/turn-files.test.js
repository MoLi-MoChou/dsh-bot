import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { withTurnFiles } from '../src/host/parts.js'
import { cards, changes, isSkippedDir, isTempFile, producedOf, snapshot, TURN_FILES_MAX } from '../src/host/turn-files.js'

const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'moon-bot-turn-files-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
const write = (root, path, data = 'x') => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), data)
}

test('a turn\'s new and changed files become its cards', async (t) => {
  const root = folder(t)
  write(root, 'before.txt', 'already there')
  const before = await snapshot(root)
  write(root, 'notes.md', '# done')
  write(root, 'shot.png', 'png bytes')
  write(root, 'q3.xlsx', 'xlsx bytes')
  const after = await snapshot(root)
  assert.deepEqual(changes(before, after), ['notes.md', 'q3.xlsx', 'shot.png'])
  assert.deepEqual(cards(changes(before, after), after), [
    { path: 'notes.md', name: 'notes.md', size: 6, mime: 'text/markdown' },
    { path: 'q3.xlsx', name: 'q3.xlsx', size: 10, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { path: 'shot.png', name: 'shot.png', size: 9, mime: 'image/png' },
  ])
})

test('a file the turn only read stays off the cards, a rewritten one comes back', async (t) => {
  const root = folder(t)
  write(root, 'read.txt', 'aaa')
  write(root, 'rewritten.txt', 'bbb')
  const before = await snapshot(root)
  write(root, 'rewritten.txt', 'bbbbbb')
  const after = await snapshot(root)
  assert.deepEqual(changes(before, after), ['rewritten.txt'])
})

test('temporary files and dependency folders are skipped', async (t) => {
  const root = folder(t)
  const before = await snapshot(root)
  write(root, 'node_modules/pkg/index.js')
  write(root, '.git/HEAD')
  write(root, '.cache/blob')
  write(root, '__pycache__/m.pyc')
  write(root, 'build.tmp')
  write(root, 'draft~')
  write(root, 'swap.swp')
  write(root, 'half.part')
  write(root, '.DS_Store')
  write(root, 'Thumbs.db')
  const after = await snapshot(root)
  assert.deepEqual(changes(before, after), [])
  assert.equal(isTempFile('a.tmp'), true)
  assert.equal(isTempFile('a.txt'), false)
  assert.equal(isSkippedDir('node_modules'), true)
  assert.equal(isSkippedDir('.git'), true)
  assert.equal(isSkippedDir('reports'), false)
})

test('a turn keeps the first cards of the limit, and counts what is left', async (t) => {
  const root = folder(t)
  const before = await snapshot(root)
  for (let at = 0; at < TURN_FILES_MAX + 3; at += 1) write(root, `out/${String(at).padStart(2, '0')}.txt`)
  const after = await snapshot(root)
  const { produced, more } = producedOf(before, after)
  assert.equal(produced.length, TURN_FILES_MAX)
  assert.equal(more, 3)
  assert.deepEqual(produced.map(file => file.path), produced.map(file => file.path).slice().sort((a, b) => a.localeCompare(b)))
  assert.equal(produced[0].path, 'out/00.txt')
})

test('a folder that cannot be read is not an empty one', async (t) => {
  const root = folder(t)
  await assert.rejects(snapshot(join(root, 'gone')), { code: 'ENOENT' })
})

test('the scan does not walk past its depth', async (t) => {
  const root = folder(t)
  const before = await snapshot(root)
  write(root, 'a/b/c/d/e/f/too-deep.txt')
  write(root, 'a/b/c/d/e/shown.txt')
  const after = await snapshot(root)
  assert.deepEqual(changes(before, after), ['a/b/c/d/e/shown.txt'])
})

test('a turn\'s files ride on that turn\'s last message only', () => {
  const files = [{ path: 'notes.md', name: 'notes.md', size: 6, mime: 'text/markdown' }]
  const items = [
    { kind: 'user', text: 'write it', time: 1 },
    { kind: 'bot', text: 'one', time: 2, turn: 7 },
    { kind: 'bot', text: 'two', time: 3, turn: 7 },
    { kind: 'bot', text: 'later', time: 4, turn: 8 },
  ]
  const shown = withTurnFiles(items, { turns: { 7: { produced: files } } })
  assert.deepEqual(shown[1].produced, undefined)
  assert.deepEqual(shown[2].produced, files)
  assert.equal(shown[3].produced, undefined)
  // A page without the turn's last block keeps no card rather than repeating one.
  assert.deepEqual(withTurnFiles([{ kind: 'user', text: 'hi', time: 1 }], { turns: { 7: { produced: files } } }), [{ kind: 'user', text: 'hi', time: 1 }])
  // The files past the card limit are counted for the message.
  assert.equal(withTurnFiles(items, { turns: { 7: { produced: files, more: 2 } } })[2].producedMore, 2)
})
