// Browser acceptance tests (Chromium via Playwright) against public/ served with the headers
// from netlify.toml, with /.netlify/functions/* routed to the REAL handlers on the in-memory
// Blobs stand-in. Run: node --import ./tests/stub/register.mjs tests/browser.test.mjs
import { T, note, save, eq, ok } from './lib/t.mjs';
import { db, reset } from './stub/blobs.mjs';
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'tests', 'results');
process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
const PASS = process.env.ADMIN_PASSWORD;
const handlers = {
  'track-click': (await import('../netlify/functions/track-click.mjs')).default,
  'admin-clicks': (await import('../netlify/functions/admin-clicks.mjs')).default,
  'admin-feedback': (await import('../netlify/functions/admin-feedback.mjs')).default,
  feedback: (await import('../netlify/functions/feedback.mjs')).default
};
const { adenDay, addDays } = await import('../netlify/lib/common.mjs');

// headers from netlify.toml (parsed with python tomllib)
const toml = JSON.parse(execFileSync('python3', ['-c', 'import tomllib,json,sys;print(json.dumps(tomllib.load(open(sys.argv[1],"rb"))))', path.join(ROOT, 'netlify.toml')]));
const headerFor = (p) => Object.assign({}, ...toml.headers.filter((h) => h.for === p || (h.for === '/*')).map((h) => h.values));
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('nf'); }
  const key = p === '/index.html' ? '/index.html' : p;
  s.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headerFor(key) }); s.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, r));
const base = 'http://127.0.0.1:' + srv.address().port;
const br = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {});

let ipCounter = 0;
async function wire(page, opts = {}) {
  const seen = [];
  await page.route('**/.netlify/functions/*', async (route) => {
    const req = route.request(); const name = new URL(req.url()).pathname.split('/').pop(); const h = req.headers();
    seen.push({ name, method: req.method(), headers: h });
    if (opts.override && await opts.override(name, route, req)) return;
    const hd = handlers[name]; if (!hd) return route.fulfill({ status: 404, body: 'nf' });
    const r = await hd(new Request(req.url(), { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), { ip: opts.ip || `10.1.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}` });
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
  });
  return seen;
}
const keys = () => [...(db.get('contact-click-events') || new Map()).keys()];
const today = adenDay(Date.now());
function seedClicks() {
  const ev = new Map(); db.set('contact-click-events', ev); let n = 0;
  const put = (day, s, c, k) => { for (let i = 0; i < k; i++) ev.set(`v2/${day}/${s}/${c}/${day}-${n++}`, '{}'); };
  put(today, 'makeup', 'whatsapp', 3); put(today, 'perfume', 'phone', 2); put(addDays(today, -3), 'makeup', 'instagram', 4); put(addDays(today, -20), 'perfume', 'maps', 6); put(addDays(today, -60), 'makeup', 'facebook', 1);
}
function seedFeedback() {
  const m = new Map(); db.set('customer-feedback', m);
  const msgs = ['=HYPERLINK("http://evil","x") رسالة خبيثة', '+1+1 رسالة', '-2+3 رسالة', '@SUM(A1) رسالة', '\t=cmd رسالة', '<img src=x onerror="window.__xss=1"> رسالة طويلة', 'رسالة عادية بالعربية طويلة'];
  msgs.forEach((x, i) => m.set('id' + i, JSON.stringify({ id: 'id-0000-' + i, store: i % 2 ? 'perfume' : 'makeup', kind: 'شكوى', message: x, createdAt: new Date(1.78e12 + i * 1000).toISOString() })));
  m.set('undated', JSON.stringify({ id: 'undated-1', store: 'makeup', kind: 'اقتراح', message: 'رسالة قديمة بلا تاريخ' }));
}
const login = async (page, pw = PASS) => { await page.fill('#demoPass', pw); await page.evaluate(() => document.getElementById('enter').click()); await page.waitForTimeout(500); }; // programmatic click: Playwright's pointer click mis-scrolls the fixed overlay under isMobile emulation (identical on the V1.2 original)
const overflowProbe = () => { const vw = innerWidth; let worst = 0, who = ''; for (const e of document.body.querySelectorAll('*')) { if (e.closest('.tablewrap,.modalback,.nav')) continue; const r = e.getBoundingClientRect(); if (!r.width) continue; const o = Math.max(r.right - vw, -r.left); if (o > worst + 0.5) { worst = o; who = e.tagName + '.' + (e.className || e.id); } } return worst > 1 ? who + ' by ' + Math.round(worst) + 'px' : ''; };
const csvOf = async (page, sel) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); return fs.readFileSync(await dl.path(), 'utf8'); };

/* ================= public site ================= */
{
  reset(); const ctx = await br.newContext(); const page = await ctx.newPage(); const errs = [], csp = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
  const seen = await wire(page);
  const resp = await page.goto(base + '/index.html'); await page.waitForTimeout(500);
  const links = await page.$$eval('a[data-contact-channel]', (as) => as.map((a) => ({ h: a.href, c: a.dataset.contactChannel, s: a.dataset.contactStore, sec: (a.closest('[id]') || {}).id })));
  const exp = (h) => h.startsWith('tel:') ? 'phone' : /wa\.me/.test(h) ? 'whatsapp' : /chat\.whatsapp/.test(h) ? 'whatsapp_group' : /whatsapp\.com\/channel/.test(h) ? 'whatsapp_channel' : /instagram/.test(h) ? 'instagram' : /facebook/.test(h) ? 'facebook' : /maps/.test(h) ? 'maps' : '?';
  await T('AT1', 'all 22 contact links present, channel matches href type, store matches its section', async () => {
    eq(links.length, 22); for (const l of links) { eq(exp(l.h), l.c, l.h); eq(l.sec, l.s, l.h); }
    const hrefs = (t) => [...t.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    const actualHrefs = hrefs(fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'));
    const baselineHrefs = fs.readFileSync(path.join(ROOT, 'tests/fixtures/v1.2-index-anchor-hrefs.txt'), 'utf8').trim().split('\n');
    eq(actualHrefs.filter((h) => h !== './masahatak.html').sort().join('\n'), baselineHrefs.sort().join('\n'), 'all V1.2 links unchanged; only the approved community entry may be added');
    eq(actualHrefs.filter((h) => h === './masahatak.html').length, 1, 'exactly one community entry link');
    return '22 contact links unchanged; original anchor hrefs preserved; exactly one approved community link'; }, 'browser');
  await T('AT-CSP1', 'index: CSP header present, no CSP violations, no page errors', async () => {
    const c = resp.headers()['content-security-policy']; ok(c && c.includes("frame-ancestors 'none'") && !c.includes('unsafe-eval')); eq(csp.length, 0, csp.join('|')); eq(errs.length, 0, errs.join('|')); return 'ok'; }, 'browser');
  await T('AT-CSP2', 'CSP actually blocks an injected inline script', async () => { await page.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__inj=1'; document.body.append(s); }); eq(await page.evaluate(() => window.__inj === 1), false); csp.length = 0; return 'blocked'; }, 'browser');
  // click all 22, block navigation in bubble phase
  await page.evaluate(() => document.addEventListener('click', (e) => { window.__dp = e.defaultPrevented; if (e.target.closest && e.target.closest('a[data-contact-channel]')) e.preventDefault(); }, false));
  for (let i = 0; i < 22; i++) await page.evaluate((i) => document.querySelectorAll('a[data-contact-channel]')[i].click(), i);
  await page.waitForTimeout(1500);
  await T('AT2-e2e', 'browser click -> beacon -> real handler -> stored with the correct store+channel (22/22)', async () => {
    const ks = keys(); eq(ks.length, 22, 'records'); for (const l of links) ok(ks.some((k) => k.split('/')[2] === l.s && k.split('/')[3] === l.c)); eq(await page.evaluate(() => window.__dp), false, 'tracker did not preventDefault');
    const b = seen.find((s) => s.name === 'track-click'); ok(b.headers.origin || b.headers['sec-fetch-site'], 'browser sent provenance headers'); return `22 records; request headers: origin=${b.headers.origin} sec-fetch-site=${b.headers['sec-fetch-site']}`; }, 'browser');
  await T('AT-AUX', 'middle-click (auxclick) is tracked once; right-click is not', async () => {
    const before = keys().length; await page.evaluate(() => { const a = document.querySelector('a[data-contact-channel]'); a.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true })); a.dispatchEvent(new MouseEvent('auxclick', { button: 2, bubbles: true, cancelable: true })); });
    await page.waitForTimeout(500); eq(keys().length - before, 1); return '+1'; }, 'browser');
  await ctx.close();

  // failure must never block the link — REAL navigation, tracking endpoint hanging
  for (const mode of ['hang', 'abort', '503', '429']) {
    await T('AT3-' + mode, `real navigation to the link target is not delayed when tracking is ${mode}`, async () => {
      const c = await br.newContext(); const p = await c.newPage();
      await p.route('**/.netlify/functions/track-click', (r) => mode === 'hang' ? null : mode === 'abort' ? r.abort() : r.fulfill({ status: Number(mode), body: '{}' }));
      await p.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa-target</title>' }));
      await p.goto(base + '/index.html'); await p.waitForTimeout(300);
      const href = await p.$eval('a[data-contact-channel="whatsapp"][data-contact-store="makeup"]', (a) => a.href);
      const t0 = Date.now(); await p.evaluate(() => document.querySelector('a[data-contact-channel="whatsapp"][data-contact-store="makeup"]').click());
      await p.waitForURL('https://wa.me/**', { timeout: 3000 }); const dt = Date.now() - t0; await c.close(); ok(dt < 1500, 'took ' + dt); return `navigated to ${href} in ${dt}ms`; }, 'browser');
  }
  await T('AT3-nobeacon', 'fallback fetch(keepalive) works when sendBeacon is unavailable', async () => {
    reset(); const c = await br.newContext(); const p = await c.newPage(); await p.addInitScript(() => Object.defineProperty(navigator, 'sendBeacon', { value: undefined })); await wire(p, { ip: '77.1.1.1' });
    await p.goto(base + '/index.html'); await p.evaluate(() => { document.addEventListener('click', (e) => e.preventDefault()); document.querySelector('a[data-contact-channel]').click(); }); await p.waitForTimeout(600); await c.close(); eq(keys().length, 1); return '1 record'; }, 'browser');
  await T('AT4-ui', 'rapid repeated clicks from one device: only 20/min stored, UI unaffected', async () => {
    reset(); const c = await br.newContext(); const p = await c.newPage(); await wire(p, { ip: '78.1.1.1' }); await p.goto(base + '/index.html');
    await p.evaluate(() => { document.addEventListener('click', (e) => e.preventDefault()); const a = document.querySelector('a[data-contact-channel]'); for (let i = 0; i < 60; i++) a.click(); }); await p.waitForTimeout(2500); await c.close(); const n = keys().length; ok(n >= 20 && n <= 22, 'stored ' + n); return `60 clicks -> ${n} stored`; }, 'browser');

  // CSV from the public inbox viewer + XSS
  reset(); seedFeedback();
  await T('AT12-index', 'public inbox CSV export neutralises = + - @ and TAB-prefixed cells; Arabic BOM; no XSS', async () => {
    const c = await br.newContext(); const p = await c.newPage(); await wire(p, { ip: '79.1.1.1' }); await p.goto(base + '/index.html#feedback-admin'); await p.waitForTimeout(300);
    await p.fill('#voc-pass', PASS); await p.evaluate(() => document.getElementById('voc-load').click()); await p.waitForTimeout(800);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.getElementById('voc-export').click())]); const csv = fs.readFileSync(await dl.path(), 'utf8');
    eq(csv.charCodeAt(0), 0xFEFF); for (const lead of ['=HYPERLINK', '+1+1', '-2+3', '@SUM']) ok(csv.includes(`"'${lead}`), 'missing neutralised ' + lead); ok(csv.includes('"\'\t=cmd') || csv.includes("\"'\t=cmd"), 'tab cell');
    ok(!/"[=+\-@]/.test(csv.replace(/"المعرف"[\s\S]*?\r\n/, '').split('\r\n').map((r) => r.split('","').slice(4).join('')).join('\n')), 'a message cell starts with a formula char');
    eq(await p.evaluate(() => window.__xss === 1), false); await c.close(); return 'all 5 hostile cells prefixed with apostrophe'; }, 'browser');
}

/* ================= admin ================= */
async function adminPage(opts = {}) { const ctx = await br.newContext(opts.ctx || {}); const page = await ctx.newPage(); page.__csp = []; page.__errs = []; page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) page.__csp.push(m.text()); }); page.on('pageerror', (e) => page.__errs.push(e.message)); page.__seen = await wire(page, opts); const resp = await page.goto(base + '/admin.html'); page.__resp = resp; return page; }
{
  reset(); seedClicks(); seedFeedback();
  const page = await adminPage({ ip: '20.0.0.1' });
  await T('AT-CSP3', 'admin: CSP + noindex + no-store + frame protection headers; no violations', async () => {
    const h = page.__resp.headers(); ok(h['content-security-policy'].includes("frame-ancestors 'none'")); eq(h['x-robots-tag'], 'noindex, nofollow'); eq(h['cache-control'], 'no-store'); eq(h['x-frame-options'], 'DENY'); eq(h['x-content-type-options'], 'nosniff'); ok(h['strict-transport-security']); return 'ok'; }, 'browser');
  await T('AT9-ui', 'before login no customer data in DOM; wrong password shows error', async () => {
    eq(await page.$$eval('#feedbackRows tr', (t) => t.length), 0); ok(await page.isVisible('#login')); await login(page, 'wrong-password-123'); ok((await page.textContent('#loginError')).includes('غير صحيحة')); ok(await page.isVisible('#login')); return 'ok'; }, 'browser');
  await T('AT10-ui', 'after 5 wrong passwords the 6th shows the lockout message (even with the right password)', async () => {
    for (let i = 0; i < 4; i++) await login(page, 'wrong-password-' + i); await login(page, PASS); const t = await page.textContent('#loginError'); ok(t.includes('محاولات كثيرة'), t); ok(await page.isVisible('#login')); return t; }, 'browser');
  await page.context().close();

  reset(); seedClicks(); seedFeedback();
  const p2 = await adminPage({ ip: '20.0.0.2' }); await login(p2);
  await T('AT15a', 'dashboard numbers equal the seeded REAL records; no synthetic/trial/visit/conversion wording', async () => {
    ok(!(await p2.isVisible('#login'))); const kp = (await p2.textContent('#kpis')).replace(/\s+/g, ' ');
    ok(/نقرات التواصل المسجلة\s*[١1][٥5]/.test(kp.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 'KPI total: ' + kp);   // 3+2+4+6=15 in 30 days
    const body = await p2.evaluate(() => document.body.innerText); for (const bad of ['اصطناعي', 'تجريبي', 'V1.1 ', 'تحليلات توضيحية', 'معدل التحويل', 'الزوار الفريدون', 'تحليلات الزوار', 'غير مقاس']) ok(!body.includes(bad), 'found: ' + bad);
    ok(body.includes('V1.2.1')); return 'KPI=15 as seeded; forbidden phrases absent'; }, 'browser');
  await T('AT8-ui', 'periods: today=5, 7d=9, 30d=15, 90d=16 (Aden calendar); summary table today/7/30', async () => {
    const tot = async (v) => { await p2.selectOption('#periodFilter', v); await p2.waitForTimeout(500); return (await p2.textContent('#kpis')).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/نقرات التواصل المسجلة\s*(\d+)/)[1]; };
    const r = [await tot('today'), await tot('7'), await tot('30'), await tot('90')]; eq(r.join(), '5,9,15,16');
    await p2.click('[data-page="visitors"]'); const cells = await p2.$$eval('#summaryRows tr', (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim()).join('|'))); const rows = cells.join(' ; ').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)); eq(rows, 'ميك أب هاوس|3|7|7 ; عنوان العطر|2|2|8 ; الإجمالي|5|9|15'); return r.join(',') + ' | ' + rows; }, 'browser');
  await T('AT-store', 'store filter separates the shops', async () => {
    await p2.selectOption('#periodFilter', '30'); await p2.waitForTimeout(400); await p2.selectOption('#storeFilter', 'perfume'); const k = (await p2.textContent('#kpis')).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)); ok(/نقرات التواصل المسجلة\s*8/.test(k), k); await p2.selectOption('#storeFilter', 'all'); return 'perfume=8 (2+6)'; }, 'browser');
  await T('AT12-admin', 'admin CSV exports neutralise formulas (messages, report, daily); BOM present', async () => {
    await p2.click('[data-page="feedback"]'); const c1 = await csvOf(p2, '#exportFeedback'); eq(c1.charCodeAt(0), 0xFEFF); for (const lead of ['=HYPERLINK', '+1+1', '-2+3', '@SUM']) ok(c1.includes(`"'${lead}`), lead);
    await p2.click('[data-page="reports"]'); const c2 = await csvOf(p2, '#exportReport'); ok(c2.includes('Asia/Aden')); const c3 = await csvOf(p2, '#exportDaily'); ok(c3.split('\r\n').length > 2 && c3.includes(today)); eq(await p2.evaluate(() => window.__xss === 1), false); return 'ok'; }, 'browser');
  await T('AT11-ui', 'inbox shows old + undated messages, undated flagged, search works, modal safe', async () => {
    await p2.click('[data-page="feedback"]'); const n = await p2.$$eval('#feedbackRows tr', (t) => t.length); eq(n, 8); ok((await p2.textContent('#feedbackStatus')).includes('بلا تاريخ'));
    await p2.fill('#feedbackSearch', 'خبيثة'); eq(await p2.$$eval('#feedbackRows tr', (t) => t.length), 1); await p2.fill('#feedbackSearch', ''); await p2.click('#feedbackRows tr:nth-child(1) [data-edit]'); ok(await p2.isVisible('#modalback.show')); await p2.keyboard.press('Escape'); return '8 rows, status mentions undated'; }, 'browser');
  await T('AT-logout', 'logout clears data; reload returns to login; nothing in storage', async () => {
    await p2.click('#logout'); ok(await p2.isVisible('#login')); eq(await p2.$$eval('#feedbackRows tr', (t) => t.length), 0); await p2.reload(); ok(await p2.isVisible('#login')); const st = await p2.evaluate(() => [Object.keys(localStorage).length, Object.keys(sessionStorage).length, document.cookie.length]); eq(st.join(), '0,0,0'); eq(p2.__csp.length, 0, p2.__csp.join('|')); eq(p2.__errs.length, 0, p2.__errs.join('|')); return 'ok; 0 CSP violations; 0 page errors'; }, 'browser');
  await p2.context().close();
}
/* loading / error / retry */
{
  reset(); seedClicks(); seedFeedback(); let failClicks = 0, delay = 0;
  const page = await adminPage({ ip: '21.0.0.1', override: async (name, route) => { if (name !== 'admin-clicks') return false; if (failClicks === 1) { route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"تعذر قراءة إحصاءات النقرات"}' }); return true; } if (failClicks === 2) { route.abort(); return true; } if (delay) { await new Promise((r) => setTimeout(r, delay)); } return false; } });
  failClicks = 1; await login(page);
  await T('AT-F5a', 'server error on clicks: clear error message + retry button (not a silent "—")', async () => {
    const st = await page.textContent('#clicksStatus'); ok(st.includes('تعذر تحميل النقرات'), st); ok(st.includes('إعادة المحاولة')); ok(await page.isVisible('#retryClicks, #clicksStatus button')); return st.replace(/\s+/g, ' '); }, 'browser');
  await T('AT-F5b', 'retry button recovers once the server is back', async () => { failClicks = 0; await page.click('#clicksStatus button'); await page.waitForTimeout(600); const st = await page.textContent('#clicksStatus'); ok(st.includes('آخر تحديث'), st); return st.replace(/\s+/g, ' '); }, 'browser');
  await T('AT-F5c', 'network failure shows a connection message', async () => { failClicks = 2; await page.selectOption('#periodFilter', '7'); await page.waitForTimeout(600); const st = await page.textContent('#clicksStatus'); ok(st.includes('تعذر الاتصال'), st); failClicks = 0; return st.replace(/\s+/g, ' '); }, 'browser');
  await T('AT-F5d', 'loading state is shown while the server is slow', async () => { delay = 1200; await page.selectOption('#periodFilter', '30'); await page.waitForTimeout(300); const st = await page.textContent('#clicksStatus'); ok(st.includes('جارٍ تحميل'), st); await page.waitForTimeout(1600); delay = 0; ok((await page.textContent('#clicksStatus')).includes('آخر تحديث')); return 'loading -> ok'; }, 'browser');
  await page.context().close();
}
/* mobile */
{
  reset(); seedClicks(); seedFeedback();
  const page = await adminPage({ ip: '22.0.0.1', ctx: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }); await login(page);
  await T('AT14', 'admin at 360px: no horizontal page overflow on any section; screenshots saved', async () => {
    const res = []; for (const pg of ['overview', 'visitors', 'contacts', 'feedback', 'reports', 'settings']) { await page.evaluate((p) => window.page(p), pg).catch(() => page.evaluate((p) => document.querySelector(`[data-page="${p}"]`).click(), pg)); await page.waitForTimeout(100); const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); const w = await page.evaluate(overflowProbe); res.push(pg + ':' + o + (w ? ' ' + w : '')); ok(o <= 0 && !w, pg + ' overflow ' + o + ' ' + w); }
    await page.evaluate(() => document.querySelector('[data-page="overview"]').click()); await page.screenshot({ path: path.join(OUT, 'admin-360.png') }); return res.join(' '); }, 'browser');
  await page.context().close();
  const c = await br.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const ip = await c.newPage(); await wire(ip); await ip.goto(base + '/index.html'); await ip.waitForTimeout(400);
  await T('AT14b', 'public site at 360px: no horizontal overflow, no page errors', async () => { const o = await ip.evaluate(() => document.documentElement.scrollWidth - innerWidth); const w = await ip.evaluate(overflowProbe); ok(o <= 0 && !w, 'overflow ' + o + ' ' + w); await ip.screenshot({ path: path.join(OUT, 'index-360.png') }); return 'overflow=' + o; }, 'browser'); await c.close();
}
/* layout / publish */
await T('AT13', 'public/ contains only approved V1.2 pages and V1.3.1 community assets; source, package.json, docs, tests are NOT published', async () => {
  const files = fs.readdirSync(PUB).sort();
  eq(files.join(), ['admin.html', 'community-admin.html', 'index.html', 'masahatak.html', 'masahatak.js'].join(','), 'exact approved publish allowlist');
  for (const p of ['/netlify/functions/track-click.mjs', '/netlify/lib/common.mjs', '/package.json', '/netlify.toml', '/docs/archive/README-AR.txt', '/tests/backend.test.mjs']) { const r = await fetch(base + p); eq(r.status, 404, p); }
  eq(toml.build.publish, 'public'); eq(toml.build.functions, 'netlify/functions'); ok(toml.redirects.length >= 6); return 'published=' + files.join('+') + '; 6 probe paths -> 404 (local server of public/ only; Netlify itself NOT TESTED)'; }, 'static');
await T('AT13b', 'netlify.toml is in sync with the inline scripts (CSP hashes)', async () => { execFileSync('node', [path.join(ROOT, 'tools/build-config.mjs'), '--check']); return 'in sync'; }, 'static');

await br.close(); srv.close();
process.exit(save('browser.json') ? 1 : 0);
