# 对话文件卡片：消息文件附件契约

- 日期：2026-10-22（第二版：按评审意见把字段从 `files` 改为 `produced`，下载收窄到会话文件夹）
- 相关：第一批 T2（决定 2）
- 范围：一轮对话产出的文件以卡片出现在对话内容区，能预览、能下载；不含资源库页面和 bot 文件夹管理

## 为什么

文件现在只在 DSH 的工作区面板里，对话里看不到「这一轮产出了什么」。每轮结束把本轮新增/修改的文件挂到消息上，由客户端渲染成卡片；下载沿用已有的 `workspace-download` / `workspace-describe`，不新开接口，也不复制文件字节。

## 字段为什么叫 `produced`

`files` 在现有的 Bot 消息里已经是 **DSH 附件对象**（`delivery.js` 的超长消息、`groups.js` 的群叙事、`exchange.files`、`file-text` 都靠它）。同一条消息再挂 `files:[{path,name,size,mime}]` 会让「读回超长消息」和群提示把普通对象当附件。所以卡片用新字段 **`produced`**，`files` 语义不动。

## 数据

一条产出文件：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string | **相对该会话文件夹**的路径，永远 `/` 分隔（Windows 上也一样，不接受 `\`、`..`、绝对路径），例 `reports/q3.xlsx` |
| `name` | string | 文件名（basename），客户端直接显示 |
| `size` | number | 字节数 |
| `mime` | string | 与 `workspace-describe` 同一张表；未知类型 `application/octet-stream` |

- 顺序：同一轮内按 `path` 升序。
- 每轮最多 **20** 张卡片（`TURN_FILES_MAX`）；超出时只给前 20 条，并给 `more: N`（历史条目上是 `producedMore`），客户端显示「还有 N 个」。
- 文件后来被删了：卡片仍按消息里的数据展示，点预览/下载时 `workspace-describe` / `workspace-download` 返回 `bot/refused`（"This file no longer exists"），卡片显示「文件已删除」并禁用按钮，不报错弹窗。
- 超过 64MB：`workspace-describe` 返回 `downloadable:false`，卡片显示「太大，无法下载」；直接下载返回 `bot/refused`。

## 从哪里读到

### 1. 实时（当前 part）：`state`

```json
{
  "turnFiles": {
    "<sessionId>": { "turns": { "12": { "produced": [ { "path": "reports/q3.xlsx", "name": "q3.xlsx", "size": 18432, "mime": "…" } ], "more": 3 } } }
  }
}
```

- `turns[turn]` 是 `{ produced, more? }`；`more` 只在超出 20 张时出现。
- key 是 **Session id**（bot 的 own-chat part、群的成员 Session 都在 `bots[].sessionId` / `rooms[].parts` 里给出）。
- 只有真的写出文件的轮才出现。一轮结束落库时 host 会 `save()`，`revision` 变化，重新拉 `state` 即可。
- 不带任何文件夹路径。

### 2. 历史分页：`chat` / `earlier`

`items` 里 `kind:"bot"` 的条目新增：

```json
{ "kind": "bot", "text": "做好了", "time": 1729600000000, "turn": 12,
  "produced": [ { "path": "reports/q3.xlsx", "name": "q3.xlsx", "size": 18432, "mime": "…" } ],
  "producedMore": 3 }
```

- `produced` 只挂在该 turn 的**最后一条** `kind:"bot"` 条目上（一轮多段文字只挂一次）。
- `turn`: number，助手条目的轮次；`producedMore` 只在超出 20 张时出现。
- 分页把一轮切开时，卡片挂在该页该轮的最后一条上。

## 预览/下载（沿用老接口，路径按会话解析）

```http
POST /api/bot
{ "endpoint": "workspace-describe", "payload": { "sessionId": "<该消息所在会话>", "path": "reports/q3.xlsx" } }
{ "endpoint": "workspace-download", "payload": { "sessionId": "<该消息所在会话>", "path": "reports/q3.xlsx" } }
```

- 给了 `sessionId`：`path` 相对**该会话自己的文件夹**解析，host 用 `realpath` 后校验 `within(会话文件夹, 真实路径)`；`../`、绝对路径、软链逃逸一律 `bot/refused`。一个 bot 的会话读不到另一个 bot 的文件。
- 而且只放行 **`produced` 里登记过的路径**（该会话最近 20 轮）：文件夹里同一时代的其他文件不通过卡片接口外流。更早轮次的卡片要等资源库索引（下一批），本批受 20 轮保留限制。
- 不给 `sessionId`（老的侧栏面板用途）：`path` 当绝对路径，只允许团队工作目录、团队文件夹、各 bot/群文件夹内的文件。
- 返回：`workspace-download` → `{ name, mime, size, data(base64), folder? }`（文件夹给 zip）；`workspace-describe` → `{ name, size, folder, mime, modified, downloadable }`。
- 单文件上限 64MB；Web 版走同一个 `api/bot` 通道（密码代理）。

错误码：

| code | 何时 |
| --- | --- |
| `bot/invalid` | 没给 path，或 path 不是字符串 |
| `bot/refused` | 文件不存在、越出会话文件夹/团队文件夹、不是该会话 produced 的路径、超过 64MB、会话已不在 |
| `bot/read-only` | 另一个 dsh 持有团队数据，本窗口只读 |

## 收集规则（host，`core/src/host/turn-files.js`）

- 轮开始对会话文件夹做快照，轮结束再快照，取新增或 size/mtime 变化的文件；删除的不收。
- 排除：隐藏目录（`.` 开头，含 `.git`/`.cache`）、`node_modules`、`__pycache__`、`.venv`/`venv`、`.tox`、`.pytest_cache`、`.mypy_cache`、`.next`、`.turbo`、`.gradle`、`.idea`；临时文件 `.DS_Store`、`Thumbs.db`、后缀 `~`/`.tmp`/`.temp`/`.swp`/`.swx`/`.part`/`.partial`/`.crdownload`/`.download`。
- 深度 ≤6，单次扫描 ≤4000 条目，每轮前 20 张卡片（按 path 排序）+ `more`；每 Session 留最近 20 轮，最多 200 个 Session。
- 文件只记录路径和元数据，**不复制字节**，也不作为 DSH 附件转发。

## 验收

```sh
cd core
TMPDIR=/data/dsh/bot/workspace/tmp node --import ./test/harness-resolve.mjs --test \
  test/turn-files.test.js test/workspace-files.test.js test/bot-messages.test.js

# 起测试台后（实机）：
curl -s -X POST http://127.0.0.1:3096/api/bot -H 'content-type: application/json' \
  -d '{"endpoint":"workspace-describe","payload":{"sessionId":"<会话 id>","path":"notes.md"}}'
```
