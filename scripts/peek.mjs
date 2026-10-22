import { chromium } from 'playwright'
const [,, url = 'http://127.0.0.1:8787/', out = '/tmp/peek.png', w = 1400, hgt = 860] = process.argv
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome' })
const p = await b.newPage({ viewport: { width: +w, height: +hgt }, deviceScaleFactor: 1 })
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)) })
p.on('pageerror', e => console.log('pageerror:', e.message))
await p.goto(url); await p.waitForTimeout(2500); await p.screenshot({ path: out }); await b.close()
