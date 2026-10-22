# DSH Bot（spike）

以 DeepSeek Harness 为引擎、界面沿用 DS Bot 的独立 bot 应用。设计见 ../architecture.md。

```sh
source ../node22.sh          # Node 22
npm install && npm run build # 构建界面到 dist/
node scripts/gen-prompt.mjs  # 生成 bot 身份 + OpenUI 组件库提示词
export DSH_HOME=$PWD/../.dsh-home MOCK_API_KEY=x
node host/mock-llm.mjs &     # 没有真实模型 key 时的模拟模型
node host/host.mjs           # 打开 http://127.0.0.1:8787
node scripts/shots.mjs       # Playwright 截图到 ../screens
```

换成真实模型：在 engine/cordis.patch.yml 的 llm-pi-ai 下加一个路由（或用 DSH 自带的 deepseek-official），设置 DSH_BOT_PROVIDER / DSH_BOT_MODEL 和对应 key 的环境变量。
