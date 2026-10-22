// The password page of web mode: one field, no scripts, follows the light/dark system theme.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
export function loginPage({ error = false, wait = false } = {}) {
  const note = wait ? '尝试次数过多，请 10 分钟后再试。 Too many tries, wait 10 minutes.' : error ? '密码不对。 Wrong password.' : ''
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DSH Bot · 登录</title><style>
:root{color-scheme:light dark;--bg:#fcfcfc;--card:#fff;--ink:#141414;--ink2:rgba(20,20,20,.6);--line:rgba(20,20,20,.12);--accent:#4d6bfe}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--card:#1f1f1f;--ink:#f2f2f2;--ink2:rgba(242,242,242,.6);--line:rgba(242,242,242,.14);--accent:#5b7bff}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
form{width:min(360px,92vw);background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 20px;color:var(--ink2);font-size:13px}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit;font:inherit}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button{margin-top:14px;width:100%;padding:10px;border:0;border-radius:10px;background:var(--ink);color:var(--bg);font:inherit;font-weight:600;cursor:pointer}
.err{color:#e5484d;font-size:13px;margin-top:10px;min-height:1em}
</style></head><body><form method="post" action="/login">
<h1>DSH Bot</h1><p>输入访问密码 · Enter the access password</p>
<input type="password" name="password" autocomplete="current-password" autofocus required aria-label="访问密码">
<button type="submit">登录</button><div class="err" role="alert">${esc(note)}</div></form></body></html>`
}
