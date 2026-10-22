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
    context() {
      const profile = read('profile').trim()
      const journal = read('journal').trim()
      const tail = journal.length > LIMIT ? `…\n${journal.slice(-LIMIT)}` : journal
      return [
        '<memory>',
        `长期记忆文件：${files.profile}（关于用户的稳定事实和偏好）、${files.journal}（按日期追加的笔记）。`,
        '用户让你记住什么、或你发现值得长期记住的信息时，用文件工具更新这两个文件：profile 里改写成最新事实，journal 里在末尾追加“## YYYY-MM-DD”下的一行。不要记录密钥和密码。',
        '', '[profile.md]', profile, '', '[journal.md]', tail, '</memory>',
      ].join('\n')
    },
  }
}
