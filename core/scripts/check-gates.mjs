#!/usr/bin/env node
// Migration gates that oxlint cannot express.
//
//  1. Layer boundaries: shared may import only `zod` (and files in shared); client may not
//     import host; host may not import client.
//  2. Size: every logical .js/.ts/.tsx file under src is at most 350 lines. Data and
//     third-party files are exempt; the list of legacy files is explicit below.
//  3. Floating promises: a Promise-returning call or `new` used as a bare statement without
//     await, void, or a .then/.catch/.finally chain. oxlint's rule is a silent no-op unless
//     its type-aware mode is available, so we use the TypeScript compiler API directly.
//
// Usage: node scripts/check-gates.mjs [--root <core-like directory>]
// `--root` exists so the gates can be pointed at the fixtures in test/fixtures/gates.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

const MAX_LINES = 350
const SOURCE_EXTENSIONS = new Set(['.js', '.ts', '.tsx'])
const LAYERS = new Set(['shared', 'client', 'host'])

// Exempt by design. The globs are relative to the root (normally core/).
const LINE_EXEMPTIONS = [
  // Static/brand art is generated image data, not hand-written logic.
  'src/client/brand-art.js', // TODO(phase2 split): static brand art (generated data URLs)
  // Third-party code is reviewed by its upstream, not reshaped by our size gate.
  'src/client/vendor/**',
  // Declaration files describe types; they carry no runtime statements to split.
  '**/*.d.ts',
  // UI copy is a dictionary table (data), not a logic file.
  'src/client/i18n.js', // i18n dictionary table
  // TODO(phase2 split): existing client JS still over 350 lines; Phase 2 moves it to TS
  // and splits these modules. They are pending, not accepted new debt.
  'src/client/styles.js',
  'src/client/cells.js',
  'src/client/index.js',
  'src/client/usage-page.js',
  'src/client/sidebar.js',
  'src/client/browser-pane.js',
  'src/client/bot-browsers.js',
  'src/client/model-menu.js',
  'src/client/secret-card.js',
  // TODO(phase4 split): existing host JS still over 350 lines; Phase 4 moves it to TS
  // and splits these modules. They are pending, not accepted new debt.
  'src/host/memory.js',
  'src/host/parts.js',
  'src/host/groups.js',
  'src/host/tools.js',
  'src/host/turns.js',
  'src/host/usage.js',
  'src/host/roster.js',
  'src/host/secrets.js',
  'src/host/capabilities.js',
  'src/host/channel.js',
  'src/host/store.js',
]

const DEFAULT_COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
}

const argv = process.argv.slice(2)
let root = resolve(import.meta.dirname, '..')
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index]
  if (arg === '--root') {
    const value = argv[index + 1]
    if (!value) usage('--root needs a directory')
    root = resolve(value)
    index += 1
  } else if (arg.startsWith('--root=')) {
    root = resolve(arg.slice('--root='.length))
  } else {
    usage(`unknown argument: ${arg}`)
  }
}

const sourceRoot = join(root, 'src')
if (!existsSync(sourceRoot)) usage(`no src directory under ${root}`)

const findings = { boundaries: [], lines: [], floating: [] }

// ---------------------------------------------------------------------------
// Source discovery and path helpers.

function usage(message) {
  console.error(`check-gates: ${message}`)
  console.error('usage: node scripts/check-gates.mjs [--root <dir>]')
  process.exit(2)
}

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function sourceFiles() {
  return walk(sourceRoot).filter(file => SOURCE_EXTENSIONS.has(file.slice(file.lastIndexOf('.'))))
}

const relPath = file => relative(root, file).split(sep).join('/')

function layerOfPath(file) {
  const rel = relative(sourceRoot, file)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined
  const layer = rel.split(sep)[0]
  return LAYERS.has(layer) ? layer : undefined
}

function lineOf(text, position) {
  let line = 1
  for (let index = 0; index < position; index += 1) if (text.charCodeAt(index) === 10) line += 1
  return line
}

function globToRegExp(glob) {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') {
        if (glob[index + 2] === '/') {
          pattern += '(?:.*/)?'
          index += 2
        } else {
          pattern += '.*'
          index += 1
        }
      } else {
        pattern += '[^/]*'
      }
    } else if (char === '?') {
      pattern += '[^/]'
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${pattern}$`)
}

const EXEMPT_MATCHERS = LINE_EXEMPTIONS.map(glob => globToRegExp(glob))

function isLineExempt(rel) {
  return EXEMPT_MATCHERS.some(matcher => matcher.test(rel))
}

// ---------------------------------------------------------------------------
// 1. Architecture boundaries.

const IMPORT_PATTERNS = [
  // `import x from '...'`, `import type { X } from '...'`, `import '...'`
  /(?:^|[;\n])\s*import\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)?(['"])([^'"]+)\1/g,
  // `export { x } from '...'`, `export * from '...'`, `export type { X } from '...'`
  /(?:^|[;\n])\s*export\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)(['"])([^'"]+)\1/g,
  // `require('...')`
  /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
  // `import('...')`
  /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
]

function checkBoundaries() {
  for (const file of sourceFiles()) {
    const layer = layerOfPath(file)
    if (!layer) continue
    const text = stripComments(readFileSync(file, 'utf8'))
    for (const { specifier, position } of importsOf(text)) {
      const violation = boundaryViolation(layer, file, specifier)
      if (!violation) continue
      findings.boundaries.push(
        `${relPath(file)}:${lineOf(text, position)} - boundary: ${violation} (${specifier})`,
      )
    }
  }
}

function importsOf(text) {
  const imports = []
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      const specifier = match[2]
      if (!specifier) continue
      // The position of the specifier itself gives the useful line number for multiline
      // import lists. The specifier is inside the final quoted token, so its last
      // occurrence in the match is the literal we matched.
      const position = match.index + match[0].lastIndexOf(specifier)
      imports.push({ specifier, position })
    }
  }
  return imports.sort((left, right) => left.position - right.position)
}

function targetLayer(file, specifier) {
  const clean = specifier.replace(/[?#].*$/, '')
  if (clean.startsWith('.')) return layerOfPath(resolve(dirname(file), clean))
  if (isAbsolute(clean)) return layerOfPath(clean)
  const parts = clean.split('/').filter(Boolean)
  const index = parts.findIndex(part => LAYERS.has(part))
  if (index < 0) return undefined
  if (index === 0) return parts[0]
  // Also understand repo-rooted spellings such as `core/src/host/x` or `src/host/x`.
  const prefix = parts.slice(0, index).join('/')
  return /(?:^|\/)(?:src|core)(?:\/|$)/.test(prefix) ? parts[index] : undefined
}

function boundaryViolation(layer, file, specifier) {
  const target = targetLayer(file, specifier)
  if (layer === 'client' && target === 'host') return 'client may not import host'
  if (layer === 'host' && target === 'client') return 'host may not import client'
  if (layer !== 'shared') return undefined
  if (specifier === 'zod' || specifier.startsWith('zod/')) return undefined
  if (target === 'shared') return undefined
  if (target === 'host' || target === 'client') return `shared may not import ${target}`
  return 'shared may import only zod and its own files'
}

// Remove comments while preserving newlines (so line numbers stay exact) and leaving
// string contents alone. That keeps `import` inside prose from being mistaken for code
// while still accepting the simple regex tokenizer above.
function stripComments(text) {
  let output = ''
  let index = 0
  let state = 'code'
  let quote = ''
  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]
    if (state === 'code') {
      if (char === '/' && next === '/') {
        output += '  '
        index += 2
        state = 'line'
      } else if (char === '/' && next === '*') {
        output += '  '
        index += 2
        state = 'block'
      } else if (char === '"' || char === "'" || char === '`') {
        output += char
        quote = char
        state = 'string'
        index += 1
      } else {
        output += char
        index += 1
      }
    } else if (state === 'string') {
      output += char
      if (char === '\\') {
        output += text[index + 1] ?? ''
        index += 2
      } else {
        if (char === quote) state = 'code'
        index += 1
      }
    } else if (state === 'line') {
      if (char === '\n') {
        output += '\n'
        state = 'code'
      } else {
        output += ' '
      }
      index += 1
    } else {
      if (char === '*' && next === '/') {
        output += '  '
        index += 2
        state = 'code'
      } else {
        output += char === '\n' ? '\n' : ' '
        index += 1
      }
    }
  }
  return output
}

// ---------------------------------------------------------------------------
// 2. Line counts.

function checkLineCounts() {
  for (const file of sourceFiles()) {
    const rel = relPath(file)
    if (isLineExempt(rel)) continue
    const text = readFileSync(file, 'utf8')
    // wc -l counts newlines; a final newline does not add an extra empty line.
    let lines = 0
    for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) lines += 1
    if (lines > MAX_LINES) findings.lines.push(`${rel}: ${lines} lines (max ${MAX_LINES})`)
  }
}

// ---------------------------------------------------------------------------
// 3. Floating promises.

function checkFloatingPromises() {
  const { program, rootNames } = buildProgram()
  if (!program) return
  const checker = program.getTypeChecker()
  for (const fileName of rootNames) {
    const sourceFile = program.getSourceFile(fileName)
    if (!sourceFile) continue
    visit(sourceFile, sourceFile, fileName)
  }

  function visit(node, sourceFile, fileName) {
    if (ts.isExpressionStatement(node)) checkStatement(node, sourceFile, fileName)
    ts.forEachChild(node, child => visit(child, sourceFile, fileName))
  }

  function checkStatement(statement, sourceFile, fileName) {
    const visitExpression = expression => {
      let current = expression
      while (ts.isParenthesizedExpression(current)) current = current.expression
      if (ts.isAwaitExpression(current) || ts.isVoidExpression(current)) return
      if (
        ts.isBinaryExpression(current) &&
        current.operatorToken.kind === ts.SyntaxKind.CommaToken
      ) {
        visitExpression(current.left)
        visitExpression(current.right)
        return
      }
      if (!ts.isCallExpression(current) && !ts.isNewExpression(current)) return
      if (isHandledChain(current)) return
      const type = checker.getTypeAtLocation(current)
      // `any`/`unknown` means the type checker could not prove this is a promise. Do not
      // guess: a false positive here would block unrelated code.
      if (!type || type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return
      let promised
      try {
        promised = checker.getPromisedTypeOfPromise(type)
      } catch {
        return
      }
      if (promised === undefined) return
      const position = sourceFile.getLineAndCharacterOfPosition(current.getStart(sourceFile))
      const call = current.getText(sourceFile).replace(/\s+/g, ' ').trim().slice(0, 160)
      findings.floating.push(
        `${relPath(fileName)}:${position.line + 1} - floating promise: ${call}`,
      )
    }
    visitExpression(statement.expression)
  }
}

function isHandledChain(node) {
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  if (!ts.isPropertyAccessExpression(callee)) return false
  return callee.name.text === 'then' || callee.name.text === 'catch' || callee.name.text === 'finally'
}

function buildProgram() {
  const tsconfig = join(root, 'tsconfig.json')
  let options = DEFAULT_COMPILER_OPTIONS
  if (existsSync(tsconfig)) {
    const config = ts.readConfigFile(tsconfig, ts.sys.readFile)
    if (!config.error) {
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
      options = parsed.options
    }
  }
  const rootNames = sourceFiles().filter(file => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  if (rootNames.length === 0) return { program: undefined, rootNames }
  return { program: ts.createProgram({ rootNames, options }), rootNames }
}

// ---------------------------------------------------------------------------
// Run after every declaration above: ESM evaluates the module body top to bottom, so
// calling this earlier would read the regex/glob constants before they exist.

function main() {
  checkBoundaries()
  checkLineCounts()
  checkFloatingPromises()

  const all = [...findings.boundaries, ...findings.lines, ...findings.floating]
  if (all.length === 0) {
    console.log('gates: ok')
    process.exit(0)
  }
  for (const finding of all) console.error(finding)
  const summary = [
    `${findings.boundaries.length} boundary`,
    `${findings.lines.length} line-count`,
    `${findings.floating.length} floating-promise`,
  ].join(', ')
  console.error(`gates: ${all.length} failure(s) (${summary})`)
  process.exit(1)
}

main()
