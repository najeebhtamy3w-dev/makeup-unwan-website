// Shared helpers for all Netlify Functions (V1.2.1).
// Kept OUTSIDE netlify/functions so Netlify does not treat it as a function,
// and OUTSIDE public/ so it is never served as a static file.
import { createHmac, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';

export const STORES = ['makeup', 'perfume'];
export const CHANNELS = ['whatsapp', 'instagram', 'facebook', 'phone', 'maps', 'whatsapp_channel', 'whatsapp_group'];
export const TZ = 'Asia/Aden';

export const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra
    }
  });

/* ---------- time: storage stays UTC (ISO), grouping uses Asia/Aden ---------- */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export function adenDay(ms) {
  try {
    const s = dayFmt.format(new Date(ms));
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch { /* fall through */ }
  // Yemen has no DST (UTC+3); used only if ICU data were missing.
  return new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
}
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function dayRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ---------- Blobs ---------- */
// Strong consistency so a click that was just written is visible to the next list/read.
export const strongStore = (name) => getStore({ name, consistency: 'strong' });

/* ---------- request provenance ---------- */
// This is a *speed bump*, not authentication: a script can set these headers.
// Real limits come from hit() below.
export function sameOrigin(request) {
  const allowed = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const host = (h) => { try { return new URL(h).host.toLowerCase(); } catch { return null; } };
  const own = host(request.url);
  const sfs = request.headers.get('sec-fetch-site');
  const origin = request.headers.get('origin');
  if (origin) {
    const oh = host(origin);
    if (!oh) return false;
    return oh === own || allowed.includes(oh);
  }
  if (sfs) return sfs === 'same-origin';
  return false; // neither header: not a browser page request
}

export function clientIp(request, context) {
  return (
    (context && context.ip) ||
    request.headers.get('x-nf-client-connection-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  );
}
// Raw IPs are never stored: only a salted HMAC prefix is used as a rate-limit bucket id.
export function ipKey(ip) {
  const secret = process.env.RATE_LIMIT_SALT || process.env.ADMIN_PASSWORD || 'makeup-unwan';
  return createHmac('sha256', secret).update(ip || 'unknown').digest('hex').slice(0, 16);
}

/* ---------- append-only sliding-window limiter ----------
   Each attempt writes ONE marker blob (no read-modify-write => no lost updates),
   then counts markers inside the window. If over the limit, its own marker is
   removed and the request is refused. Markers older than 2x window are purged.
   Marker key: rl/<scope>/<bucket>/<ts13>-<uuid>                                */
const pad = (n) => String(n).padStart(13, '0');
export async function hit(store, scope, bucket, windowMs, limit, now = Date.now()) {
  const prefix = `rl/${scope}/${bucket}/`;
  const key = `${prefix}${pad(now)}-${randomUUID()}`;
  await store.set(key, '1');
  const look = async () => {
    const inWindow = [];
    const stale = [];
    for await (const page of store.list({ prefix, paginate: true })) {
      for (const b of page.blobs) {
        const ts = Number(b.key.slice(prefix.length, prefix.length + 13));
        if (!Number.isFinite(ts)) continue;
        if (ts > now - windowMs) inWindow.push(b.key);
        else if (ts < now - 2 * windowMs) stale.push(b.key);
      }
    }
    await Promise.allSettled(stale.slice(0, 25).map((k) => store.delete(k)));
    // Rank by key order (timestamp, then uuid): the first `limit` markers win.
    return { inWindow, rank: inWindow.filter((k) => k <= key).length };
  };
  let seen = await look();
  // Concurrent requests may not see each other's markers yet. When there is any contention,
  // wait briefly and look again so a burst cannot slip far past the limit.
  if (seen.rank <= limit && seen.inWindow.length >= 2) {
    await new Promise((r) => setTimeout(r, Number(process.env.GUARD_SETTLE_MS ?? 40)));
    seen = await look();
  }
  if (seen.rank > limit) {
    await store.delete(key).catch(() => {});
    const oldest = Math.min(...seen.inWindow.map((k) => Number(k.slice(prefix.length, prefix.length + 13))));
    return { allowed: false, count: seen.inWindow.length, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)), release: async () => {} };
  }
  return { allowed: true, count: seen.inWindow.length, retryAfter: 0, release: async () => { await store.delete(key).catch(() => {}); } };
}

// Only known, expired protection markers may be cleaned. Unknown keys stay intact.
const GUARD_TTL = Object.freeze({ c: 60e3, f: 10 * 60e3, a: 15 * 60e3, fcap: 24 * 3600e3 });
export async function sweepGuards({ maxDeletes = 500, now = Date.now() } = {}) {
  const store = strongStore('rate-guard');
  let deleted = 0;
  for await (const page of store.list({ prefix: 'rl/', paginate: true })) {
    for (const b of page.blobs) {
      const m = /^rl\/(c|f|a|fcap)\/[^/]+\/(\d{13})-[0-9a-f-]{36}$/.exec(b.key);
      if (m && Number(m[2]) + GUARD_TTL[m[1]] <= now) {
        await store.delete(b.key);
        if (++deleted >= maxDeletes) return deleted;
      }
    }
  }
  return deleted;
}

/* ---------- misc ---------- */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* ---------- admin gate shared by admin-clicks and admin-feedback ----------
   - hard minimum 12 chars (unchanged from V1.2, so existing Netlify settings keep working)
   - at most ADMIN_MAX_FAILS failed attempts per client per 15 minutes (default 5)  */
import { timingSafeEqual } from 'node:crypto';
export async function requireAdmin(request, context) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (expected.length < 12) return json(503, { error: 'لوحة الإدارة غير مهيأة' });
  // Ignore surrounding spaces / NBSP that phone copy-paste can add; the comparison stays exact.
  const given = (request.headers.get('x-admin-password') || '').replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, '');
  const max = Number(process.env.ADMIN_MAX_FAILS) || 5;
  const windowMs = 15 * 60e3;
  let attempt;
  try {
    attempt = await hit(strongStore('rate-guard'), 'a', ipKey(clientIp(request, context)), windowMs, max);
  } catch (e) {
    console.error('ADMIN_GUARD_ERROR', e && e.message);
    return json(503, { error: 'تعذر التحقق الآن، حاول لاحقًا' }); // fail closed
  }
  if (!attempt.allowed) {
    return json(429, { error: `محاولات كثيرة. أعد المحاولة بعد ${Math.ceil(attempt.retryAfter / 60)} دقيقة.` }, { 'retry-after': String(attempt.retryAfter) });
  }
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json(401, { error: 'كلمة مرور غير صحيحة' });
  }
  await attempt.release(); // successful logins never count toward the lockout
  return null;
}
export const passwordIsWeak = () => (process.env.ADMIN_PASSWORD || '').length < 20;
