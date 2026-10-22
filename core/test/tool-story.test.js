import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

// The step lines and the panel read their story from toolStory, which is plain data; the
// components around it need react, so it runs with a minimal stand-in.
const PLUGIN = dirname(dirname(fileURLToPath(import.meta.url)))
const { outputFiles } = await build({
  stdin: { contents: "export { toolStory } from './src/client/work-process.js'", resolveDir: PLUGIN },
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const react = {
  createElement: () => null, Fragment: Symbol('Fragment'), useEffect: () => {}, useState: initial => [initial, () => {}],
  useRef: current => ({ current }), useMemo: make => make(), useLayoutEffect: () => {}, useId: () => 'id',
}
const module = { exports: {} }
runInNewContext(outputFiles[0].text, {
  module, exports: module.exports,
  require: name => (name === 'react' ? react : {}),
  document: { createElement: () => ({ style: {}, append() {}, setAttribute() {} }), body: { append() {} } },
  window: {}, navigator: {}, URL, console, setTimeout, clearTimeout, MutationObserver: class { observe() {} disconnect() {} },
})
const { toolStory } = module.exports

const call = (name, args, { done = true, failed = false } = {}) => ({
  kind: done ? 'tool-result' : 'tool-call', name, isError: failed, argsRaw: JSON.stringify(args), content: [],
})

test('a step reads as what the Bot did, not as a tool name', () => {
  assert.equal(toolStory(call('read', { path: 'notes/plan.md' })).text, 'Read plan.md')
  assert.equal(toolStory(call('read', { path: 'notes/plan.md' }, { done: false })).text, 'Reading plan.md')
  assert.equal(toolStory(call('write', { path: 'out/q3.xlsx' })).text, 'Wrote q3.xlsx')
  assert.equal(toolStory(call('edit', { file: 'src/a.js' })).text, 'Edited a.js')
  assert.equal(toolStory(call('web_search', { query: 'moon bot' })).text, 'Searched for moon bot')
  assert.equal(toolStory(call('web_fetch', { url: 'https://example.com/a/b' })).text, 'Opened example.com')
  assert.equal(toolStory(call('bash', { command: 'npm test\nmore' })).text, 'Ran npm test')
  assert.equal(toolStory(call('subagent', { prompt: 'check it' })).text, 'Handed work to a helper')
  assert.equal(toolStory(call('message_bot', { to: '老吴' })).text, 'Messaged 老吴')
  assert.equal(toolStory(call('ask_user_question', {})).text, 'Asked you a question')
  assert.equal(toolStory(call('todo_write', {})).text, 'Tidied the plan')
  // An unknown tool still reads as an action, never as a bare engine name.
  assert.match(toolStory(call('mystery_tool', {})).text, /mystery_tool/)
  assert.equal(toolStory(call('mystery_tool', {})).action, 'tool')
  // The action groups calls that read alike, for the page counter.
  assert.equal(toolStory(call('web_fetch', { url: 'https://a.test/' })).action, 'page')
})
