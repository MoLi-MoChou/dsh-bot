# 对话文件卡片：消息文件附件契约

- 日期：2026-10-22
- 相关：第一批 T1（host 收集）、T2（client 卡片）
- 范围：一轮对话产出的文件以卡片出现在对话内容区，能预览、能下载；不含资源库页面和 bot 文件夹管理

## 为什么

文件现在只在 DSH 的工作区面板里，对话里看不到「这一轮产出了什么」。方案要求每轮结束把本轮新增/修改的文件挂到消息上，由客户端渲染成卡片；下载沿用已有的 `workspace-download` / `workspace-describe`，不新开接口，也不复制文件字节。

## 数据

一条文件附件：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string | **相对 bot 文件夹**的路径，`/` 分隔，无前导 `./`，例 `reports/q3.xlsx` |
| `name` | string | 文件名（basename），客户端直接显示，不再截目录 |
| `size` | number | 字节数 |
| `mime` | string | 与 `workspace-describe` 同一张表（`mimeOf`）；未知类型为 `application/octet-stream` |
| `downloadable` | boolean | 可选，恒为 `true`；超过 64MB 的文件 `workspace-describe` 会返回 `downloadable:false`，卡片据此显示「太大，无法下载」 |

顺序：同一轮内按 `path` 升序。每轮最多 **12** 个文件（`TURN_FILES_MAX`），多的丢弃（本轮多到 12 个以上的情况先不做折叠计数）。

一轮文件所属的根目录用 `folder` 给出（绝对路径，即该 Session 的工作文件夹，等于 bot 自己的文件夹或群文件夹或团队工作区）：

- 历史条目上：`filesFolder`（只有该条目带 `files` 时才给）
- 实时表上：每个 Session 一项 `folder`

**下载/预览的路径** = `filesFolder + '/' + file.path`，原样传给已有接口：

- `POST /api/bot {"endpoint":"workspace-download","payload":{"path":"<绝对路径>"}}` → `{ name, mime, size, data(base64), folder? }`；文件夹会给 zip。
- `POST /api/bot {"endpoint":"workspace-describe","payload":{"path":"<绝对路径>"}}` → `{ name, size, folder, mime, modified, downloadable }`。
- 只允许团队工作目录、团队文件夹、各 bot/群文件夹里的文件；不在其中返回 `bot/refused`。Web 版走同一个 `api/bot` 通道（密码代理），不额外开路由。

错误码（沿用现有）：

| code | 何时 |
| --- | --- |
| `bot/invalid` | 没给 path，或 path 不是字符串 |
| `bot/refused` | 文件不存在、不在团队文件夹内、超过 64MB |
| `bot/read-only` | 另一个 dsh 持有团队数据，本窗口只读 |

## 从哪里读到

### 1. 实时（当前 part）：`state`

`POST /api/bot {"endpoint":"state"}` 的返回里，与 `work.turns` 并列增加：

```json
{
  "turnFiles": {
    "<sessionId>": {
      "folder": "/data/dsh/bot/workspace",
      "turns": {
        "12": [
          { "path": "reports/q3.xlsx", "name": "q3.xlsx", "size": 18432, "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
        ]
      }
    }
  }
}
```

- key 是 **Session id**，不是 botId；bot 当前的 own-chat part 见 `bots[].sessionId`，群的成员 Session 见 `rooms[].parts`。
- 只有真的有文件的轮才出现；没写出文件的轮不进表。
- `turn` 与 DSH 的 turn 编号一致，也就是助手消息节点上的 `turn`。
- 一轮结束、文件落库时 host 会 `save()`，`revision` 变化，客户端重新拉到这份数据。

### 2. 历史分页：`chat` / `earlier`

返回的 `items` 里，`kind:"bot"` 的条目增加两个字段：

```json
{ "kind": "bot", "text": "做好了", "time": 1729600000000, "turn": 12,
  "files": [{ "path": "reports/q3.xlsx", "name": "q3.xlsx", "size": 18432, "mime": "…" }],
  "filesFolder": "/data/dsh/bot/workspace" }
```

- `files` 只挂在该 turn 的**最后一条** `kind:"bot"` 条目上（一轮有多段文字时不会重复挂）。
- `turn`: number，助手条目的轮次，便于客户端按轮聚合。
- 分页把同一轮切到两页时，文件可能挂在前一页的最后一条上（该轮没被切开时总是正确）。

## 收集规则（host，`core/src/host/turn-files.js`）

- 轮开始时（`turn/start`）对 Session 文件夹做一次快照：`相对路径 → { size, mtimeMs }`。
- 轮结束时（`turn/end`）再快照一次，取「新增」或「size/mtime 变了」的文件；删除的不收。
- 排除：
  - 隐藏目录（`.` 开头，含 `.git`、`.cache`）与 `node_modules`、`__pycache__`、`.venv`/`venv`、`.tox`、`.pytest_cache`、`.mypy_cache`、`.next`、`.turbo`、`.gradle`、`.idea`
  - 临时文件：`.DS_Store`、`Thumbs.db`，后缀 `~`、`.tmp`、`.temp`、`.swp`、`.swx`、`.part`、`.partial`、`.crdownload`、`.download`
- 深度 ≤ 6，单次扫描最多 4000 个条目（超过只算扫到的），每轮最多 12 个（按 path 排序取前 12）。
- 每个 Session 只保留最近 20 轮；最多 200 个 Session，按最后写入时间淘汰。
- 文件只记录路径和元数据，**不复制字节**，也不作为 DSH 附件投递（发给别的 bot 时对方用文件工具按路径读，省一次存盘）。

## 验收命令

```sh
cd core

# 单元测试：收集规则（新增/修改/排除/上限）
node --import ./test/harness-resolve.mjs --test test/turn-files.test.js

# 端到端：起测试台，让 bot 写 3 个文件，看 chat 条目和 state 里的 turnFiles
dev/bench.sh smoke 3096 8796 reset && node dev/smoke.mjs smoke 3096
dev/bench.sh smoke 3096 8796 stop

# 下载/预览（把 <folder>/<path> 换成实际路径）
curl -s -X POST http://127.0.0.1:3096/api/bot \
  -H 'content-type: application/json' \
  -d '{"endpoint":"workspace-describe","payload":{"path":"<folder>/<path>"}}'
curl -s -X POST http://127.0.0.1:3096/api/bot \
  -H 'content-type: application/json' \
  -d '{"endpoint":"workspace-download","payload":{"path":"<folder>/<path>"}}'
```
