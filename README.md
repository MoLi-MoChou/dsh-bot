# DSH Bot（v1）

一个运行在 DeepSeek Harness（DSH 0.2.1-rc.2）进程内的聊天 bot，界面复用 DS Bot 的开源前端代码（Apache-2.0，见 NOTICE）。

功能：多会话（新建 / 搜索 / 重命名 / 删除）、流式回复与头部活动指示、命令审批、工具结果、图片和文件附件、OpenUI 富消息（卡片、表格、表单、进度、快捷选项等 18 个组件）、简单记忆（profile / journal，注入系统提示）、设置（通用、模型、权限、记忆）、亮色和暗色主题、语音按钮（复用 DS Bot 的语音组件）。

## 运行

```bash
source /workspace/dsh-bot/node22.sh     # Node 22
npm install && npm run build
DSH_HOME=~/.dsh-bot npm run host        # 打开 http://127.0.0.1:8787
```

第一次打开后进入“设置 → 模型”添加模型服务：

- **DeepSeek 官方**：填 API key，模型已预置（deepseek-chat / deepseek-reasoner）。
- **OpenAI 兼容**：填接口地址（如 `https://xxx/v1`）、协议和 key，点“从接口获取模型列表”勾选模型；也可以手动输入模型 ID。

对话里输入栏右侧可以给单个对话换模型（默认跟随全局默认）。记忆由 bot 用 memory_write 工具直接写入，不弹审批。

每个模型可以标“思考”“图片”。“测试连接”会发一次 1 token 的真实请求。可以保存多个配置档，并选一个作为默认模型。配置写进 DSH 的 profile 补丁（`$DSH_HOME/profiles/dsh-bot/cordis.patch.yml`），key 存进 DSH 凭据库，不会以明文回显。

可选环境变量：`DSH_BOT_HOST`（默认 127.0.0.1）、`DSH_BOT_DEBUG=1`。

## 不接真实模型的测试

```bash
npm run mock                            # :4010 的 OpenAI 兼容模拟模型，key 为 sk-mock
DSH_HOME=/tmp/dsh-e2e npm run host
node scripts/shots.mjs                  # 全流程 e2e，截图到 ../screens/v2-*.png（SHOT_PREFIX 可改）
```

## 桌面版

Windows 安装包 / 便携 exe 与 Linux AppImage 由 GitHub Actions（`.github/workflows/desktop.yml`）打包，推送 `v*` 标签后发布为预发布版。应用自带 Electron 的 Node 运行 DSH，用户不需要装 Node。

- 数据放在系统的用户数据目录（Windows：`%APPDATA%\DSH Bot\dsh-home`），工作目录默认 `文档\DSH Bot`。
- Host 只监听 127.0.0.1，端口首次随机选定后固定；每次启动生成随机 token，窗口用它换 HttpOnly cookie，其他程序不带 cookie 访问返回 403。
- 只允许一个实例；关闭窗口即退出并关掉 Host（与 DS Bot 一致，没有托盘）。

本地打包：`npm run pack`（只出目录）或 `npm run dist`；冒烟测试：`node scripts/smoke-packed.mjs <可执行文件>`。
