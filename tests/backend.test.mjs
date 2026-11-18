// Backend acceptance tests. Run: node --import ./tests/stub/register.mjs tests/backend.test.mjs
// Uses the in-memory Blobs stand-in => proves program logic only (see TEST-REPORT).
import { T, note, save, eq, ok } from './lib/t.mjs';
import { db, cfg, calls, reset } from './stub/blobs.mjs';
process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
const PASS = process.env.ADMIN_PASSWORD;
const track = (await import('../netlify/functions/track-click.mjs')).default;
const adminC = (await import('../netlify/functions/admin-clicks.mjs')).default;
const adminF = (await import('../netlify/functions/admin-feedback.mjs')).default;
const fb = (await import('../netlify/functions/feedback.mjs')).default;
const { adenDay, addDays } = await import('../netlify/lib/common.mjs');
const U = 'https://site.example/.netlify/functions/';
const realNow = Date.now;
const setNow = (iso) => { const base = Date.parse(iso), t0 = realNow(); Date.now = () => base + (realNow() - t0); }; // advancing fake clock
const restore = () => { Date.now = realNow; };
const HDR = { origin: 'https://site.example' };
const post = (body, ip = '1.1.1.1', h = HDR) => track(new Request(U + 'track-click', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: h }), { ip });
const getC = (q = '?range=30', headers = { 'x-admin-password': PASS }, ip = '9.9.9.9') => adminC(new Request(U + 'admin-clicks' + q, { headers }), { ip });
const getF = (headers = { 'x-admin-password': PASS }, ip = '9.9.9.9') => adminF(new Request(U + 'admin-feedback', { headers }), { ip });
const postF = (b, ip = '2.2.2.2', h = HDR) => fb(new Request(U + 'feedback', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b), headers: h }), { ip });
const STORES = ['makeup', 'perfume'], CH = ['whatsapp', 'instagram', 'facebook', 'phone', 'maps', 'whatsapp_channel', 'whatsapp_group'];
const clicksKeys = () => [...(db.get('contact-click-events') || new Map()).keys()];

/* ---- #2 store/channel recorded correctly ---- */
await T('AT2', 'click recorded for the right store+channel (14 combos), key layout v2/<aden-day>/<store>/<channel>/…', async () => {
  reset();
  for (const s of STORES) for (const c of CH) eq((await post({ store: s, channel: c }, `10.0.0.${Math.random() * 250 | 0}`)).status, 201);
  const keys = clicksKeys(); eq(keys.length, 14);
  for (const s of STORES) for (const c of CH) ok(keys.some((k) => k.split('/')[2] === s && k.split('/')[3] === c), `${s}/${c} missing`);
  const v = JSON.parse(db.get('contact-click-events').get(keys[0]));
  ok(/^\d{4}-\d{2}-\d{2}T.*Z$/.test(v.at), 'UTC ISO kept in value');
  return '14/14 keys present; value keeps UTC ISO `at`';
});
await T('AT2b', 'stores use strong consistency option', async () => { ok(calls.optionsSeen.some((o) => o.consistency === 'strong' && o.name === 'contact-click-events')); return 'getStore({consistency:"strong"}) requested'; });

/* ---- #4 forged / repeated requests ---- */
await T('AT4a', 'request with neither Origin nor Sec-Fetch-Site (curl-style) rejected 403', async () => { reset(); eq((await post({ store: 'makeup', channel: 'phone' }, '3.3.3.3', {})).status, 403); return '403'; });
await T('AT4b', 'foreign Origin / look-alike Origin rejected', async () => {
  eq((await post({ store: 'makeup', channel: 'phone' }, '3.3.3.3', { origin: 'https://evil.example' })).status, 403);
  eq((await post({ store: 'makeup', channel: 'phone' }, '3.3.3.3', { origin: 'https://site.example.evil.com' })).status, 403);
  return '403/403'; });
await T('AT4c', 'Sec-Fetch-Site same-origin accepted; cross-site rejected', async () => {
  eq((await post({ store: 'makeup', channel: 'phone' }, '3.3.3.4', { 'sec-fetch-site': 'same-origin' })).status, 201);
  eq((await post({ store: 'makeup', channel: 'phone' }, '3.3.3.4', { 'sec-fetch-site': 'cross-site' })).status, 403); return '201/403'; });
await T('AT4d', 'invalid payloads rejected (9 cases) + oversize', async () => {
  for (const b of [{ store: 'x', channel: 'phone' }, { store: 'makeup', channel: 'tiktok' }, {}, 'not json', 'null', '[]', { store: 'makeup' }, { store: ['makeup'], channel: 'phone' }, { store: '__proto__', channel: 'phone' }]) {
    const r = await post(b, '4.4.4.4'); ok(r.status === 400, `status ${r.status} for ${JSON.stringify(b)}`); }
  eq((await post(JSON.stringify({ store: 'makeup', channel: 'phone', pad: 'x'.repeat(3000) }), '4.4.4.5')).status, 413); return '9×400, 413'; });
await T('AT4e', 'scripted flood from ONE client: 2000 forged requests -> only 20/min stored', async () => {
  reset(); let a = 0, l = 0;
  for (let i = 0; i < 2000; i += 100) { const rs = await Promise.all(Array.from({ length: 100 }, () => post({ store: 'perfume', channel: 'whatsapp' }, '5.5.5.5'))); for (const r of rs) r.status === 201 ? a++ : r.status === 429 ? l++ : null; }
  ok(a >= 20 && a <= 22, 'accepted ' + a); eq(a + l, 2000); eq(clicksKeys().length, a); ok(await (await post({ store: 'perfume', channel: 'whatsapp' }, '5.5.5.5')).headers.get('retry-after') !== null);
  return `accepted=${a} limited=${l} stored=${clicksKeys().length}`; });
await T('AT4f', 'the 429 carries Retry-After and rate markers do not accumulate for blocked requests', async () => {
  const markers = [...db.get('rate-guard').keys()].filter((k) => k.startsWith('rl/c/')).length; ok(markers <= 22, 'markers=' + markers); return `markers kept=${markers}`; });
await T('AT4g', 'after the window passes the same client is accepted again', async () => {
  const t = realNow(); Date.now = () => t + 61000; const r = await post({ store: 'perfume', channel: 'whatsapp' }, '5.5.5.5'); restore(); eq(r.status, 201); return '201 after 61s'; });
await T('AT4h', 'different clients are not affected by one client being limited (CGNAT-safe at 20/min each)', async () => {
  const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => post({ store: 'makeup', channel: 'maps' }, `6.6.${i}.1`))); eq(rs.filter((r) => r.status === 201).length, 50); return '50/50 distinct IPs accepted'; });
note('AT4i', 'KNOWN RESIDUAL RISK: forging from MANY IPs', 'NOTE', 'A distributed script can still inflate counts at 20/min per IP. No proportionate control stops that without CAPTCHAs/personal data. Counts are "recorded clicks", not proof of humans.');

/* ---- #3 limiter failures must not lose genuine clicks ---- */
await T('AT3a', 'limiter store failure fails OPEN (click still stored)', async () => {
  reset(); cfg.failListPrefix = 'rl/'; const r = await post({ store: 'makeup', channel: 'phone' }, '7.7.7.7'); eq(r.status, 201); eq(clicksKeys().length, 1); return '201 + stored while rate-guard list throws'; });
await T('AT3b', 'event store failure -> 503 (page ignores it; link already opened)', async () => {
  reset(); cfg.failWrites = true; const r = await post({ store: 'makeup', channel: 'phone' }, '7.7.7.8'); eq(r.status, 503); return '503'; });

/* ---- #5 concurrency, #6 thousands ---- */
await T('AT5', '300 concurrent clicks from distinct clients -> 300 distinct records, no loss', async () => {
  reset(); const rs = await Promise.all(Array.from({ length: 300 }, (_, i) => post({ store: STORES[i % 2], channel: CH[i % 7] }, `8.8.${i >> 8}.${i & 255}`))); eq(rs.filter((r) => r.status === 201).length, 300);
  eq(new Set(clicksKeys()).size, 300); const j = await (await getC()).json(); eq(j.total, 300); return 'records=300 total=300 (stub store)'; });
await T('AT6', '6000 records over 3 Aden days, page size 1000: totals exact AND no per-event reads', async () => {
  reset(); cfg.pageSize = 1000; setNow('2026-11-18T09:00:00Z');
  const ev = db.get('contact-click-events') ?? (db.set('contact-click-events', new Map()), db.get('contact-click-events'));
  let n = 0; const exp = { makeup: 0, perfume: 0 };
  for (let d = 0; d < 3; d++) for (let i = 0; i < 2000; i++) { const s = STORES[i % 2], c = CH[i % 7], day = addDays('2026-11-18', -d); ev.set(`v2/${day}/${s}/${c}/${day.replace(/-/g, '')}T000000000Z-${n++}`, JSON.stringify({ store: s, channel: c, at: day + 'T10:00:00Z', v: 2 })); exp[s]++; }
  calls.get = 0; const j = await (await getC('?range=30')).json(); restore();
  eq(j.total, 6000); eq(j.counts.makeup.whatsapp + 0 > 0, true); eq(j.summary.last30.makeup, exp.makeup); eq(j.summary.today.total, 2000); eq(j.complete, true); eq(calls.get, 0, 'gets');
  return `total=${j.total} today=${j.summary.today.total} blob reads=${calls.get} (pages of 1000)`; });
await T('AT6b', 'dozens of pages: 12000 keys in ONE day with page size 500 not truncated', async () => {
  reset(); cfg.pageSize = 500; setNow('2026-11-18T09:00:00Z'); const ev = new Map(); db.set('contact-click-events', ev);
  for (let i = 0; i < 12000; i++) ev.set(`v2/2026-11-18/makeup/phone/${String(i).padStart(8, '0')}`, '{}');
  const j = await (await getC('?range=today')).json(); restore(); eq(j.total, 12000); return `total=${j.total}`; });
await T('AT6c', 'time budget: slow storage returns complete:false (never silent partial)', async () => {
  reset(); cfg.latencyMs = 40; process.env.ADMIN_READ_BUDGET_MS = '100'; setNow('2026-11-18T09:00:00Z'); const j = await (await getC('?range=90')).json(); restore(); delete process.env.ADMIN_READ_BUDGET_MS; cfg.latencyMs = 1;
  eq(j.complete, false); return 'complete=false'; });

/* ---- #7 legacy + new, #8 Aden grouping ---- */
await T('AT7', 'legacy V1.2 records (click/<utc-day>/<uuid>) + new records both counted', async () => {
  reset(); setNow('2026-11-18T09:00:00Z'); const ev = new Map(); db.set('contact-click-events', ev);
  ev.set('click/2026-11-17/aaaa', JSON.stringify({ store: 'makeup', channel: 'phone', at: '2026-11-17T10:00:00.000Z' }));
  ev.set('click/2026-11-17/bbbb', JSON.stringify({ store: 'perfume', channel: 'maps', at: '2026-11-17T21:30:00.000Z' })); // = 00:30 on 18th Aden
  ev.set('click/2026-11-17/cccc', 'not-json{{'); ev.set('click/2026-11-17/dddd', JSON.stringify({ store: 'zzz', channel: 'phone', at: '2026-11-17T10:00:00Z' })); ev.set('click/oops/key', '{}');
  eq((await post({ store: 'makeup', channel: 'whatsapp' }, '11.0.0.1')).status, 201);
  const j = await (await getC('?range=7')).json(); restore();
  eq(j.total, 3); eq(j.legacy.counted, 2); eq(j.daily['2026-11-17'].makeup, 1); eq(j.daily['2026-11-18'].perfume, 1); eq(j.daily['2026-11-18'].makeup, 1);
  return `total=3 legacy=2 (malformed/unknown ignored); legacy 21:30Z counted on Aden 18th`; });
await T('AT8a', 'Aden day boundary: 20:59:59Z -> 17th, 21:00:00Z -> 18th', async () => {
  eq(adenDay(Date.parse('2026-11-17T20:59:59Z')), '2026-11-17'); eq(adenDay(Date.parse('2026-11-17T21:00:00Z')), '2026-11-18'); return 'ok'; });
await T('AT8b', 'new click at 00:30 Aden is stored under the Aden day, `at` stays UTC', async () => {
  reset(); setNow('2026-11-17T21:30:00.000Z'); await post({ store: 'makeup', channel: 'phone' }, '12.0.0.1'); restore();
  const k = clicksKeys()[0]; ok(k.startsWith('v2/2026-11-18/makeup/phone/'), k); ok(JSON.parse(db.get('contact-click-events').get(k)).at.startsWith('2026-11-17T21:30:00.'), 'at stays UTC'); return k.slice(0, 32) + '…'; });
await T('AT8c', '"today" = Aden calendar day; summary today/7/30 windows exact; empty days = 0', async () => {
  reset(); const ev = new Map(); db.set('contact-click-events', ev);
  const put = (day, n) => { for (let i = 0; i < n; i++) ev.set(`v2/${day}/makeup/phone/${day}-${i}`, '{}'); };
  put('2026-11-18', 2); put('2026-11-12', 3); put('2026-11-11', 5); put('2026-10-20', 7); put('2026-10-19', 11);
  setNow('2026-11-18T00:30:00+03:00'); const j = await (await getC('?range=today')).json(); restore();
  eq(j.from, '2026-11-18'); eq(j.total, 2); eq(j.summary.today.total, 2); eq(j.summary.last7.total, 5, '7d = 18..12'); eq(j.summary.last30.total, 17, '30d = 18th back to 20 Oct'); ok(!j.daily['2026-11-17']);
  const j90 = await (await getC('?range=90')).json(); eq(j90.total, 28); return 'today=2 last7=5 last30=17 range90=28'; });
await T('AT8d', 'range params: today/1/7/30/90 valid, others 400, days= legacy alias works', async () => {
  reset(); for (const r of ['today', '1', '7', '30', '90']) eq((await getC('?range=' + r)).status, 200, r); eq((await getC('?days=7')).status, 200); eq((await getC('?range=5')).status, 400); eq((await getC('?range=')).status, 400); return 'ok'; });

/* ---- #9 / #10 admin access and brute force ---- */
await T('AT9', 'unauthorised admin access rejected on both endpoints; POST -> 405', async () => {
  reset(); eq((await getC('?range=30', {})).status, 401); eq((await getC('?range=30', { 'x-admin-password': 'nope' })).status, 401); eq((await getF({})).status, 401); eq((await getF({ 'x-admin-password': 'x' })).status, 401);
  eq((await adminC(new Request(U + 'admin-clicks', { method: 'POST' }), { ip: '1.2.3.4' })).status, 405); eq((await getC()).status, 200); eq((await getF()).status, 200); return '401×4, 405, 200×2'; });
await T('AT9b', 'password < 12 chars: admin 503 and feedback intake 503 (unchanged contract)', async () => {
  const keep = process.env.ADMIN_PASSWORD; process.env.ADMIN_PASSWORD = 'short'; const a = (await getC('?range=30', { 'x-admin-password': 'short' })).status; const b = (await postF({ store: 'makeup', kind: 'شكوى', message: 'رسالة اختبار طويلة كفاية' })).status; process.env.ADMIN_PASSWORD = keep; eq(a, 503); eq(b, 503); return '503/503'; });
await T('AT10a', '500 password guesses from one client: at most 5 get a 401, the rest 429', async () => {
  reset(); const st = {}; for (let i = 0; i < 500; i++) { const r = await getC('?range=30', { 'x-admin-password': 'guess' + i }, '66.66.66.66'); st[r.status] = (st[r.status] || 0) + 1; }
  eq(st[401], 5); eq(st[429], 495); return JSON.stringify(st); });
await T('AT10b', 'while locked even the CORRECT password is refused (429 + Retry-After + Arabic message)', async () => {
  const r = await getC('?range=30', { 'x-admin-password': PASS }, '66.66.66.66'); eq(r.status, 429); ok(r.headers.get('retry-after')); ok((await r.json()).error.includes('محاولات')); return '429'; });
await T('AT10c', 'another client is unaffected; lock expires after 15 minutes', async () => {
  eq((await getC('?range=30', { 'x-admin-password': PASS }, '77.77.77.77')).status, 200);
  const t = realNow(); Date.now = () => t + 15 * 60e3 + 2000; const r = await getC('?range=30', { 'x-admin-password': PASS }, '66.66.66.66'); restore(); eq(r.status, 200); return '200 / 200 after 15m'; });
await T('AT10d', 'concurrent burst of 100 guesses: at most 5 reach the password check', async () => {
  reset(); const rs = await Promise.all(Array.from({ length: 100 }, (_, i) => getC('?range=30', { 'x-admin-password': 'g' + i }, '88.88.88.88'))); const c401 = rs.filter((r) => r.status === 401).length; ok(c401 <= 6, '401 count ' + c401); return `401=${c401} 429=${rs.filter((r) => r.status === 429).length}`; });
await T('AT10e', 'successful logins never count toward lockout (30 in a row)', async () => { reset(); for (let i = 0; i < 30; i++) eq((await getC('?range=30', { 'x-admin-password': PASS }, '99.99.99.99')).status, 200); return '30×200'; });
await T('AT10f', 'guard storage failure fails CLOSED for admin (503), never open', async () => { reset(); cfg.failWrites = true; const r = await getC('?range=30', { 'x-admin-password': PASS }, '55.5.5.5'); eq(r.status, 503); return '503'; });
await T('AT10g', 'raw IPs are never stored (markers use salted hash)', async () => { reset(); await getC('?range=30', { 'x-admin-password': 'bad' }, '123.45.67.89'); const keys = [...db.get('rate-guard').keys()].join(' '); ok(!keys.includes('123.45.67.89')); return keys.slice(0, 60); });

/* ---- #11 feedback ---- */
const good = { store: 'makeup', kind: 'شكوى', message: 'رسالة عربية اختبارية طويلة كفاية' };
await T('AT11a', 'new feedback accepted; old-format and undated records still readable; inbox not broken', async () => {
  reset(); eq((await postF(good)).status, 201); const fbs = new Map(db.get('customer-feedback')); db.set('customer-feedback', fbs);
  fbs.set('legacy-1', JSON.stringify({ id: 'legacy-1', store: 'perfume', kind: 'اقتراح', message: 'رسالة قديمة بلا تاريخ' }));
  fbs.set('legacy-2', JSON.stringify({ id: 'legacy-2', store: 'perfume', kind: 'ملاحظة', message: 'قديمة بتاريخ', createdAt: '2026-01-01T00:00:00.000Z' }));
  fbs.set('junk', 'not json'); fbs.set('junk2', JSON.stringify({ foo: 1 }));
  const j = await (await getF()).json(); eq(j.items.length, 3); eq(j.undated, 1); eq(j.skipped, 2); eq(j.items[j.items.length - 1].id, 'legacy-1', 'undated last'); eq(j.complete, true); return `items=3 undated=1 skipped=2 (no 503)`; });
await T('AT11b', 'inbox with 1200 messages, page size 500: all read, newest 500 returned, hasMore true, no truncation', async () => {
  reset(); cfg.pageSize = 500; const m = new Map(); db.set('customer-feedback', m); for (let i = 0; i < 1200; i++) m.set('id' + i, JSON.stringify({ id: 'id' + i, store: 'makeup', kind: 'شكوى', message: 'x'.repeat(12), createdAt: new Date(1.7e12 + i * 1000).toISOString() }));
  const j = await (await getF()).json(); eq(j.total, 1200); eq(j.items.length, 500); eq(j.hasMore, true); eq(j.items[0].id, 'id1199'); return 'total=1200 items=500 newest first'; });
await T('AT11c', 'feedback never deleted/rewritten by any V1.2.1 code path', async () => {
  reset(); const m = new Map([['k1', JSON.stringify({ id: 'k1', store: 'makeup', kind: 'شكوى', message: 'x'.repeat(12), createdAt: '2026-01-01T00:00:00Z' })]]); db.set('customer-feedback', m); calls.delete = 0; await getF(); await getC('?range=30');
  const snap = JSON.stringify([...m]); eq(m.size, 1); ok(snap.includes('k1')); return 'record untouched; (only rate-guard markers are ever deleted)'; });
await T('AT11d', 'feedback flood: 5 per client per 10 min, then 429; other client fine', async () => {
  reset(); const st = []; for (let i = 0; i < 12; i++) st.push((await postF(good, '31.1.1.1')).status); eq(st.filter((s) => s === 201).length, 5); eq(st.filter((s) => s === 429).length, 7); eq((await postF(good, '31.1.1.2')).status, 201); eq(db.get('customer-feedback').size, 6); return st.join(','); });
await T('AT11e', 'global daily cap protects storage (default 300) and releases the client marker', async () => {
  reset(); process.env.FEEDBACK_DAILY_CAP = '10'; const st = []; for (let i = 0; i < 14; i++) st.push((await postF(good, `32.0.0.${i}`)).status); delete process.env.FEEDBACK_DAILY_CAP; eq(st.filter((s) => s === 201).length, 10); eq(st.filter((s) => s === 429).length, 4); return st.join(','); });
await T('AT11f', 'feedback: same-origin required; honeypot silent; validation unchanged', async () => {
  reset(); eq((await postF(good, '33.0.0.1', {})).status, 403); eq((await postF({ ...good, website: 'x' }, '33.0.0.2')).status, 200); eq(db.get('customer-feedback')?.size ?? 0, 0);
  eq((await postF({ ...good, message: 'قصير' }, '33.0.0.3')).status, 400); eq((await postF({ ...good, kind: 'x' }, '33.0.0.4')).status, 400); eq((await postF('{bad', '33.0.0.5')).status, 400); eq((await postF({ ...good, message: 'x'.repeat(3001) }, '33.0.0.6')).status, 400); return 'ok'; });

/* ---- misc ---- */
await T('AT-misc1', 'tracking record contains no personal data', async () => { reset(); await post({ store: 'makeup', channel: 'phone', name: 'Ali', phone: '777' }, '40.0.0.1'); const v = JSON.parse([...db.get('contact-click-events').values()][0]); eq(Object.keys(v).sort().join(), 'at,channel,store,v'); return 'keys: at,channel,store,v'; });
await T('AT-misc2', 'rate-limit markers swept by admin-clicks (older than 1h)', async () => {
  reset(); const g = new Map(); db.set('rate-guard', g); const old = Date.now() - 2 * 3600e3; for (let i = 0; i < 30; i++) g.set(`rl/c/abc/${String(old).padStart(13, '0')}-00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, '1'); g.set(`rl/c/abc/${String(Date.now()).padStart(13, '0')}-00000000-0000-4000-8000-ffffffffffff`, '1');
  await getC('?range=today'); await new Promise((r) => setTimeout(r, 200)); const left = [...g.keys()].filter((k) => k.startsWith('rl/c/abc/')).length; ok(left <= 2, 'left ' + left); return `old markers swept; left=${left} (includes recent)`; });

await T('GUARD-TTL', 'cleanup preserves active scopes, unknown keys, and business stores', async () => {
  reset();
  const { sweepGuards } = await import('../netlify/lib/common.mjs');
  const now = Date.now(), g = new Map(); db.set('rate-guard', g);
  const key = (scope, age) => `rl/${scope}/bucket/${now-age}-00000000-0000-4000-8000-000000000001`;
  for (const [scope, ttl] of Object.entries({c:60000,f:600000,a:900000,fcap:86400000})) {
    g.set(key(scope,ttl-1),'1');g.set(key(scope,ttl),'1');
  }
  g.set(key('unknown',999999999),'1'); g.set('unrecognized','1');
  db.set('customer-feedback',new Map([['old','keep']]));db.set('contact-click-events',new Map([['old','keep']]));
  eq(await sweepGuards({now}),4);
  for (const [scope,ttl] of Object.entries({c:60000,f:600000,a:900000,fcap:86400000})) ok(g.has(key(scope,ttl-1)),scope);
  eq(g.size,6);eq(db.get('customer-feedback').get('old'),'keep');eq(db.get('contact-click-events').get('old'),'keep');
});
await T('GUARD-DAILY', 'admin cleanup cannot reopen the 24-hour feedback cap', async () => {
  reset();process.env.FEEDBACK_DAILY_CAP='1';
  try {
    setNow('2026-11-18T00:00:00Z');eq((await postF(good,'cap1')).status,201);
    setNow('2026-11-18T02:00:00Z');eq((await postF(good,'cap2')).status,429);
    await getC();await new Promise(r=>setTimeout(r,200));eq((await postF(good,'cap3')).status,429);
    setNow('2026-11-19T00:00:01Z');eq((await postF(good,'cap4')).status,201);
  } finally {restore();delete process.env.FEEDBACK_DAILY_CAP;}
});

await T('GUARD-LOGIN', 'cleanup preserves a live login lockout and removes only expired attempts', async () => {
  reset();const { sweepGuards } = await import('../netlify/lib/common.mjs');
  try {
    setNow('2026-11-18T02:00:00Z');
    for(let i=0;i<5;i++) eq((await getC('?range=30',{'x-admin-password':'wrong'},'locked')).status,401);
    setNow('2026-11-18T02:14:00Z');await sweepGuards();
    eq((await getC('?range=30',{'x-admin-password':PASS},'locked')).status,429);
    setNow('2026-11-18T02:16:00Z');await sweepGuards();
    eq((await getC('?range=30',{'x-admin-password':PASS},'locked')).status,200);
  } finally {restore();}
});

process.exit(save('backend.json') ? 1 : 0);
