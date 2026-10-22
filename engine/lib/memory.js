// 简版记忆：profile.md（关于你，长期不变的事实与偏好）+ journal.md（按日期追加的笔记）。
// 每一步都作为运行时上下文注入 DSH 的系统提示；bot 自己用文件工具更新，界面里也能直接编辑。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LIMIT = 12_000
export function createMemory(dir) {
  mkdirSync(dir, { recursive: true })
  const files = { profile: join(dir, 'profile.md'), journal: join(dir, 'journal.md') }
  if (!existsSync(files.profile)) writeFileSync(files.profile, '# 关于我\n\n')
  if (!existsSync(files.journal)) writeFileSync(files.journal, '# 笔记\n\n')
  const read = kind => readFileSync(files[kind], 'utf8')
  return {
    files,
    read: () => ({ profile: read('profile'), journal: read('journal'), paths: files }),
    write(kind, text) {
      if (!(kind in files)) throw new Error('未知的记忆文件')
      writeFileSync(files[kind], String(text ?? ''))
    },
    // 给 memory_write 工具：journal 追加时自动补“## 日期”标题。
    update(kind, mode, content) {
      if (!(kind in files)) throw new Error('file 只能是 profile 或 journal')
      const text = String(content ?? '').trim()
      if (!text) throw new Error('content 不能为空')
      if (mode === 'replace') { writeFileSync(files[kind], `${text}\n`); return { file: kind, mode } }
      const day = new Date().toLocaleDateString('sv-SE')
      let cur = read(kind).replace(/\s*$/, '\n')
      if (kind === 'journal' && !cur.includes(`## ${day}`)) cur += `\n## ${day}\n`
      writeFileSync(files[kind], `${cur}${kind === 'journal' && !text.startsWith('-') ? `- ${text}` : text}\n`)
      return { file: kind, mode: 'append' }
    },
    context() {
      const profile = read('profile').trim()
      const journal = read('journal').trim()
      const tail = journal.length > LIMIT ? `…\n${journal.slice(-LIMIT)}` : journal
      return [
        '<memory>',
        `长期记忆文件：${files.profile}（关于用户的稳定事实和偏好）、${files.journal}（按日期追加的笔记）。`,
        '用户让你记住什么、或你发现值得长期记住的信息时，用 memory_write 工具更新（不需要用户批准，也不要用通用文件工具改这两个文件）：profile 用 replace 写入完整的最新内容；journal 用 append 追加一行，工具会自动放到当天日期下。不要记录密钥和密码。',
        '', '[profile.md]', profile, '', '[journal.md]', tail, '</memory>',
      ].join('\n')
    },
  }
}
