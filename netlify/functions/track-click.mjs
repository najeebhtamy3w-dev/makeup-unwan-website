// V1.2.1 — anonymous outbound-click counter.
// One append-only record per click (no shared counter => no lost updates).
// Key layout:  v2/<Asia/Aden day>/<store>/<channel>/<utc-iso>-<uuid>
// so the admin endpoint can COUNT KEYS without reading each blob.
import { randomUUID } from 'node:crypto';
import { json, STORES, CHANNELS, adenDay, sameOrigin, clientIp, ipKey, strongStore, hit } from '../lib/common.mjs';

export default async function handler(request, context) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  // Speed bump only (scripts can fake headers); real protection is the limiter below.
  if (!sameOrigin(request)) return json(403, { error: 'Origin not allowed' });

  const size = Number(request.headers.get('content-length') || 0);
  if (size > 2048) return json(413, { error: 'Payload too large' });
  let raw;
  try { raw = await request.text(); if (raw.length > 2048) return json(413, { error: 'Payload too large' }); }
  catch { return json(400, { error: 'Invalid request' }); }
  let data;
  try { data = JSON.parse(raw); } catch { return json(400, { error: 'Invalid JSON' }); }
  if (!data || typeof data !== 'object' || !STORES.includes(data.store) || !CHANNELS.includes(data.channel)) {
    return json(400, { error: 'Invalid event' });
  }

  // Per-client limit (salted hash of IP, never stored raw). Fails OPEN: a limiter
  // outage must not lose genuine clicks.
  const limit = Number(process.env.CLICK_LIMIT_PER_MIN) || 20;
  try {
    const g = await hit(strongStore('rate-guard'), 'c', ipKey(clientIp(request, context)), 60e3, limit);
    if (!g.allowed) return json(429, { error: 'Too many requests' }, { 'retry-after': String(g.retryAfter) });
  } catch (e) { console.error('CLICK_RATE_GUARD_ERROR', e && e.message); }

  const now = Date.now();
  const at = new Date(now).toISOString();
  const key = `v2/${adenDay(now)}/${data.store}/${data.channel}/${at.replace(/[-:.]/g, '')}-${randomUUID()}`;
  try {
    await strongStore('contact-click-events').setJSON(key, { store: data.store, channel: data.channel, at, v: 2 });
    return json(201, { ok: true });
  } catch (e) {
    console.error('CLICK_STORAGE_ERROR', e);
    return json(503, { error: 'Tracking unavailable' });
  }
}
