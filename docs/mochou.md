# Mochou notes

## Cards (表格 / 待办 / 选项)

A Bot answers with a card (DS Bot's `show_view`: table, progress, options, confirm, form)
when you ask for one. Tap a starter chip on a fresh chat, or just say:

- 「用表格对比 A 和 B」 → a table
- 「帮我做个待办清单」 → a to-do table with progress
- 「给我几个选项选」 → tap-to-pick options (your pick comes back as your next message)
- 「要不要…？帮我确认」 → a confirm card; 「填一下…」 → a short form

## Work steps

Thinking and tool calls are hidden. After a reply, a small line "已工作 12s · 5 步 ›"
opens a side panel with the whole process: thinking, each tool call's input and output,
and the replies, in order. Esc or × closes it.

## Updates

- Windows (setup.exe) and Linux (AppImage) check at launch and every 4 hours, download in
  the background (only the changed blocks, using the .blockmap), and ask to restart.
  Restarting installs silently in place; nothing to reinstall, data stays.
- Settings → 关于 莫愁 → 检查更新 checks by hand and shows download progress, then
  「重启以更新」.
- portable.exe cannot replace itself; About links to the releases page. Download the new
  exe and replace the old file; data stays (it lives in your user profile).
- Update metadata on each GitHub pre-release: `latest.yml` + `*-setup.exe.blockmap`
  (Windows), `latest-linux.yml` (AppImage, block map embedded).
