// Smoke test to run against a REAL Netlify STAGING deploy (never production).
//   node tools/smoke-test.mjs https://your-staging.netlify.app 'ADMIN_PASSWORD' [--concurrent 100] [--skip-rate] [--skip-lockout]
// Notes: --concurrent needs CLICK_LIMIT_PER_MIN=1000 set on STAGING; the lockout step locks THIS machine's
// IP out of the admin for 15 minutes; the test clicks create real (test) records in that site's store.
const [base0, pass, ...flags] = process.argv.slice(2);
if (!base0 || !pass) { console.error('usage: node tools/smoke-test.mjs <https://staging-url> <ADMIN_PASSWORD> [--concurrent N] [--skip-rate] [--skip-lockout]'); process.exit(2); }
const base = base0.replace(/\/$/, ''); const origin = new URL(base).origin;
const flag = (n) => flags.includes(n); const conc = flag('--concurrent') ? Number(flags[flags.indexOf('--concurrent') + 1]) : 0;
let fails = 0; const log = (ok, name, ev = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ev ? ' :: ' + ev : ''}`); };
const click = (store = 'makeup', channel = 'phone', h = { origin }) => fetch(base + '/.netlify/functions/track-click', { method: 'POST', headers: h, body: JSON.stringify({ store, channel }) });
const stats = async (range = 'today', pw = pass) => fetch(base + '/.netlify/functions/admin-clicks?range=' + range, { headers: { 'x-admin-password': pw } });
const total = async () => { const r = await stats(); if (!r.ok) throw new Error('admin-clicks ' + r.status); return (await r.json()).total; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. nothing internal is published
for (const p of ['/package.json', '/netlify.toml', '/netlify/functions/track-click.mjs', '/netlify/lib/common.mjs', '/docs/DEPLOYMENT-GUIDE-V1.2.1.md']) {
  const r = await fetch(base + p); const t = await r.text(); log(!(r.status === 200 && /getStore|"dependencies"|\[build\]/.test(t)), 'not published: ' + p, 'status ' + r.status);
}
// 2. headers
const idx = await fetch(base + '/'); const adm = await fetch(base + '/admin.html');
log(/frame-ancestors 'none'/.test(idx.headers.get('content-security-policy') || ''), 'index has CSP');
log(/frame-ancestors 'none'/.test(adm.headers.get('content-security-policy') || '') && /noindex/.test(adm.headers.get('x-robots-tag') || '') && /no-store/.test(adm.headers.get('cache-control') || ''), 'admin has CSP + noindex + no-store');
// 3. click endpoint contract
log((await click()).status === 201, 'same-origin click accepted (201)');
log((await click('makeup', 'phone', {})).status === 403, 'no Origin/Sec-Fetch-Site rejected (403)');
log((await click('x', 'phone')).status === 400, 'invalid store rejected (400)');
// 4. admin gate
log((await fetch(base + '/.netlify/functions/admin-clicks')).status === 401, 'admin-clicks without password -> 401');
log((await fetch(base + '/.netlify/functions/admin-feedback')).status === 401, 'admin-feedback without password -> 401');
// 5. recorded clicks become visible (consistency)
let before; try { before = await total(); } catch (e) { log(false, 'admin-clicks readable with the password', e.message); process.exit(1); }
for (let i = 0; i < 5; i++) await click('perfume', 'maps');
let lag = -1, after = before; for (let t = 0; t < 12; t++) { after = await total(); if (after - before >= 5) { lag = t; break; } await sleep(1000); }
log(after - before === 5, '5 clicks counted exactly (no loss/duplication)', `delta=${after - before}, visible after ~${lag}s`);
// 6. per-client limit
if (!flag('--skip-rate')) { const st = []; for (let i = 0; i < 30; i++) st.push((await click()).status); log(st.includes(429), 'client limit engages (429) within 30 rapid clicks', st.filter((s) => s === 201).length + ' accepted'); await sleep(61000); }
// 7. concurrency
if (conc) { const b = await total(); const rs = await Promise.all(Array.from({ length: conc }, () => click('makeup', 'whatsapp'))); const ok = rs.filter((r) => r.status === 201).length; await sleep(2000); const a = await total(); log(a - b === ok, `${conc} concurrent clicks: accepted=${ok}, counted delta=${a - b}`); }
// 8. brute-force lockout
if (!flag('--skip-lockout')) { const st = []; for (let i = 0; i < 7; i++) st.push((await stats('today', 'wrong-' + i)).status); log(st.slice(-1)[0] === 429, 'admin lockout after repeated wrong passwords', st.join(',')); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
