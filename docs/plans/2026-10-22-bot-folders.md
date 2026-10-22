# Bot 自己的工作文件夹（决定 1，host 半）

- 日期：2026-10-22
- 相关：第一批 T1（host 半）、决定 2 的文件卡片（卡片里的 `path` 相对这个文件夹）
- 状态：已在工作树实现，未提交

## 为什么

界面里有「工作目录」「Team workspace」「文件夹菜单」，用户要理解引擎的目录概念才能开工。决定 1：每个 bot 一个自动管理的文件夹，Session 的 cwd 用它，界面不显示路径。

## 布局

团队文件夹（`teamFolder()`，未注册时取 `defaultTeamFolder()`）下：

```
<team>/bots/<名字>    每个 bot 一个
<team>/groups/<名字>  每个群一个（成员的群 Session 在群文件夹里）
```

- 名字由 bot/群名规整而来（小写、非字母数字折成 `-`、最长 40），重名加 `-2`、`-3`。
- 名字在创建时存进 `state.bots[].folder` / `state.rooms[].folder`，**改名不动文件夹**，文件不跟着丢。
- 老团队（没有 `folder` 字段）在启动时（`bootstrap` → `nameFolders()`）一次性补名字并建目录，然后就按普通「文件夹变了」走：下一次 turn 时 `folderMove` 把它们移到新文件夹（是既有的切 part 路径，不新写一套）。
- 「高级」里仍然可以指定一个外部文件夹（`workDir`），它优先；清空就回到应用自己的文件夹。

## 界面不再看到路径

- `state` 返回的 `bots` / `rooms` 去掉 `workDir` 和 `folder`。
- `create-bot` / `update-bot` / `duplicate-bot` / `create-room` 的返回值同样去掉（`channel.js` 的 `publicEntry`）。
- `folders` / `folder-pick` / `folder-list` 端点保留兼容，界面不再调用（ppxb 负责撤菜单）。
- `update-room` / `delete-bot` 等返回整份视图的端点，视图本身已无路径。

## 落地位置

| 文件 | 改动 |
| --- | --- |
| `core/src/host/folders.js` | `botFolder` / `roomFolder` / `newBotFolder` / `newRoomFolder` / `ensureWorkDir` / `nameFolders`；`workDirOf` 改为「显式 workDir ?? 应用自己的文件夹」 |
| `core/src/host/roster.js` | 建 bot / 建群分配名字并建目录，Session 直接以它作 cwd；`bootstrap` 给老团队补名字 |
| `core/src/host/parts.js` | `folderMove` 前先 `ensureWorkDir`（老团队第一次迁移、文件夹被删都会重建）；切 part 时用同一个文件夹 |
| `core/src/host/groups.js` | 群成员的群 Session 起在 `ensureWorkDir({ botId, roomId })` |
| `core/src/host/channel.js` | 视图和写接口不吐路径 |

## 验收

```sh
cd core
TMPDIR=/data/dsh/bot/workspace/tmp node --import ./test/harness-resolve.mjs --test test/work-dir.test.js
# 33/33 pass，含：
#  - 新建 bot 默认 cwd = <team>/bots/<name>，显式文件夹优先
#  - 空闲 bot 改文件夹立刻切 part，清空回到自己的文件夹
#  - 老团队（无 folder）下一次 turn 迁移；团队目录搬家后跟着搬
#  - state / create / update / duplicate 的返回里没有 workDir、folder
```
