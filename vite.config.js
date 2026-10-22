// 参照 DS Bot app/vite.config.js（Apache-2.0）：DS Bot 的界面模块从 vendor/ds-bot/client 原样引入，
// 只把它们依赖的 DSH 界面原语（dsh-primitives.js）换成我们自己的实现。
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const primitives = fileURLToPath(new URL('./ui/src/primitives.js', import.meta.url))
const ownPrimitives = {
  name: 'dsh-bot-primitives',
  enforce: 'pre',
  resolveId(source, importer) {
    return source === './dsh-primitives.js' && importer?.replaceAll('\\', '/').includes('/vendor/ds-bot/client/') ? primitives : null
  },
}

export default defineConfig({
  root: fileURLToPath(new URL('./ui', import.meta.url)),
  base: './',
  plugins: [ownPrimitives],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787' } },
})
