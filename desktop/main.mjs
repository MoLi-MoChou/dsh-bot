// Electron 主进程：一个窗口，内容由 dsh-bot 自己的 Host 提供。
// 结构沿用 DeepSeek Harness Desktop（apps/desktop，MIT）与 DS Bot app/src/main.mjs（Apache-2.0）的做法：
// 先拿单实例锁，再用 Electron 自带的 Node（ELECTRON_RUN_AS_NODE）起 Host 子进程跑 DSH 的 runProfile，
// Host 只听 127.0.0.1，经 IPC 报告带一次性 token 的地址，窗口加载它；退出时先让 Host 干净关掉。见 NOTICE。
import { app, BrowserWindow, dialog, Menu, nativeTheme, shell } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostPort } from './host-port.mjs'
import { HostProcess } from './host-process.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const iconFile = join(root, 'assets', 'icon.png')
// 测试或便携运行可以指定数据目录。
if (process.env.DSH_BOT_SHELL_DATA) app.setPath('userData', process.env.DSH_BOT_SHELL_DATA)

let mainWindow
let host
let origin
let stopping
let stopped = false
let failed = false

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
} else {
  app.on('second-instance', focusWindow)
  // 与 DS Bot 一致：关窗口就退出应用（没有托盘常驻）。
  app.on('window-all-closed', () => { app.quit() })
  app.on('before-quit', (event) => {
    if (stopped || host === undefined) return
    event.preventDefault()
    void stopHost().then(() => { app.quit() })
  })
  app.whenReady().then(start).catch(fail)
}

function stopHost() {
  stopping ??= (host?.stop() ?? Promise.resolve()).catch((error) => { console.error(error) }).finally(() => { stopped = true })
  return stopping
}

async function start() {
  const data = app.getPath('userData')
  const home = join(data, 'dsh-home')
  const work = join(app.getPath('documents'), 'DSH Bot')
  mkdirSync(join(home, 'profiles', 'dsh-bot'), { recursive: true })
  // 端口第一次选一个空闲的并记住：页面的本地存储（卡片状态等）跟着地址走。
  const port = await hostPort(join(data, 'host-port.json'))
  origin = `http://127.0.0.1:${String(port)}`
  const token = randomBytes(24).toString('base64url')
  host = new HostProcess({
    entry: join(root, 'host', 'host.mjs'),
    cwd: join(home, 'profiles', 'dsh-bot'),
    env: {
      ...process.env, DSH_HOME: home, DSH_BOT_APP: '1', DSH_BOT_PORT: String(port), DSH_BOT_HOST: '127.0.0.1', DSH_BOT_TOKEN: token,
      DSH_BOT_CWD: process.env.DSH_BOT_CWD ?? work,
    },
    onFailure: fail,
  })
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]) : null)
  createWindow()
  const { url } = await host.start()
  await mainWindow?.loadURL(url)
}

const notePage = message => `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark">
<body style="margin:0;height:100vh;display:grid;place-items:center;font:14px system-ui,sans-serif;background:Canvas;color:CanvasText">${message.replace(/[&<>]/gu, c => `&#${String(c.charCodeAt(0))};`)}</body>`)}`

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors
  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 720, minHeight: 480,
    title: 'DSH Bot', show: false, icon: iconFile, autoHideMenuBar: true,
    backgroundColor: dark ? '#1b1b1c' : '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  mainWindow.once('ready-to-show', () => { mainWindow?.show() })
  mainWindow.on('closed', () => { mainWindow = undefined })
  const contents = mainWindow.webContents
  // 只有本机 Host 的页面留在窗口里；外部链接交给系统浏览器。
  contents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' } })
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${origin}/`) || url.startsWith('data:')) return
    event.preventDefault()
    openOutside(url)
  })
  contents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) contents.toggleDevTools()
  })
  void mainWindow.loadURL(notePage('DSH Bot 正在启动…'))
}

function focusWindow() {
  if (mainWindow === undefined || failed) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function openOutside(url) {
  if (/^https?:\/\//iu.test(url) && !url.startsWith(`${origin}/`)) void shell.openExternal(url)
}

async function fail(error) {
  console.error(error)
  if (failed || stopping) return
  failed = true
  dialog.showErrorBox('DSH Bot', `DSH Bot 没能启动。\n\n${error instanceof Error ? error.message : String(error)}`)
  app.quit()
}
