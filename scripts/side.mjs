import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const pairs = [['team.zh.png', '03-approval.png', 'side-by-side-chat.png'], ['details.zh.png', '06-openui-action.png', 'side-by-side-openui.png']]
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })
const p = await b.newPage({ viewport: { width: 2000, height: 700 } })
const uri = f => `data:image/png;base64,${readFileSync(f).toString('base64')}`
for (const [a, c, out] of pairs) {
  await p.setContent(`<body style="margin:0;display:flex;gap:16px;background:#ddd;font:14px sans-serif"><figure style="margin:0;width:992px"><figcaption>DS Bot（官方截图）</figcaption><img style="width:100%" src="${uri('/workspace/ds-bot-ref/' + a)}"></figure><figure style="margin:0;width:992px"><figcaption>DSH Bot spike</figcaption><img style="width:100%" src="${uri('/workspace/dsh-bot/screens/' + c)}"></figure></body>`)
  await p.waitForTimeout(300)
  await p.screenshot({ path: `/workspace/dsh-bot/screens/${out}`, fullPage: true })
}
await b.close()
