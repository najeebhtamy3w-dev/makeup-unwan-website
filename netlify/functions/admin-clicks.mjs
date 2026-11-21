// V1.2.1 — click statistics. Counts KEYS (no per-event reads) for V1.2.1 records,
// and reads legacy V1.2 records (click/<utc-day>/<uuid>) with bounded concurrency.
import { json, STORES, CHANNELS, TZ, adenDay, addDays, dayRange, strongStore, mapLimit, requireAdmin, passwordIsWeak, sweepGuards } from '../lib/common.mjs';

const RANGES = { today: 1, '1': 1, '7': 7, '30': 30, '90': 90 };
const LEGACY_CAP = 5000;

export default async function handler(request, context) {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  const denied = await requireAdmin(request, context);
  if (denied) return denied;

  const q = new URL(request.url).searchParams;
  const rangeParam = String(q.get('range') ?? q.get('days') ?? '30');
  if (!(rangeParam in RANGES)) return json(400, { error: 'Invalid period' });
  const rangeDays = RANGES[rangeParam];
  const range = rangeParam === 'today' || rangeParam === '1' ? 'today' : String(rangeDays);

  const started = Date.now();
  const budget = Number(process.env.ADMIN_READ_BUDGET_MS) || 8000;
  const today = adenDay(started);
  const fetchDays = Math.max(rangeDays, 30); // summary (today/7/30) is always returned
  const first = addDays(today, -(fetchDays - 1));
  const daily = {};
  let complete = true;
  const add = (day, store, channel) => {
    if (!STORES.includes(store) || !CHANNELS.includes(channel)) return false;
    daily[day] ??= {};
    daily[day][store] ??= {};
    daily[day][store][channel] = (daily[day][store][channel] || 0) + 1;
    return true;
  };

  try {
    const events = strongStore('contact-click-events');

    // --- V1.2.1 records: list keys only ---
    const days = dayRange(first, today);
    for (let i = 0; i < days.length; i += 6) {
      if (Date.now() - started > budget) { complete = false; break; }
      await Promise.all(days.slice(i, i + 6).map(async (day) => {
        for await (const page of events.list({ prefix: `v2/${day}/`, paginate: true })) {
          for (const b of page.blobs) {
            const p = b.key.split('/'); // v2, day, store, channel, file
            if (p.length === 5) add(day, p[2], p[3]);
          }
        }
      }));
    }

    // --- legacy V1.2 records: need a read each (store/channel/at live in the value) ---
    let legacyCounted = 0, legacyTruncated = false;
    const lo = addDays(first, -1), hi = addDays(today, 1);
    const legacyKeys = [];
    if (complete) {
      for await (const page of events.list({ prefix: 'click/', paginate: true })) {
        for (const b of page.blobs) {
          const d = b.key.split('/')[1];
          if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= lo && d <= hi) legacyKeys.push(b.key);
        }
      }
      if (legacyKeys.length > LEGACY_CAP) { legacyKeys.length = LEGACY_CAP; legacyTruncated = true; }
      await mapLimit(legacyKeys, 20, async (key) => {
        if (Date.now() - started > budget) { complete = false; return; }
        const x = await events.get(key, { type: 'json' }).catch(() => null);
        const ms = x && Date.parse(x.at);
        if (!x || !Number.isFinite(ms)) return;
        const day = adenDay(ms);
        if (day >= first && day <= today && add(day, x.store, x.channel)) legacyCounted++;
      });
    }
    if (legacyTruncated) complete = false;

    // --- aggregate ---
    const sumDays = (from) => {
      const r = { makeup: 0, perfume: 0, total: 0, counts: { makeup: {}, perfume: {} }, daily: {} };
      for (const d of dayRange(from, today)) {
        const row = daily[d]; if (!row) continue;
        for (const s of STORES) for (const [c, n] of Object.entries(row[s] || {})) {
          r[s] += n; r.total += n; r.counts[s][c] = (r.counts[s][c] || 0) + n;
          r.daily[d] ??= { makeup: 0, perfume: 0 }; r.daily[d][s] += n;
        }
      }
      return r;
    };
    const main = sumDays(addDays(today, -(rangeDays - 1)));
    const pick = (r) => ({ makeup: r.makeup, perfume: r.perfume, total: r.total });
    const summary = { today: pick(sumDays(today)), last7: pick(sumDays(addDays(today, -6))), last30: pick(sumDays(addDays(today, -29))) };

    sweepGuards().catch(() => {}); // housekeeping, best effort

    return json(200, {
      range, days: rangeDays, from: addDays(today, -(rangeDays - 1)), to: today,
      total: main.total, counts: main.counts, daily: main.daily, summary,
      complete, legacy: { counted: legacyCounted, truncated: legacyTruncated },
      generatedAt: new Date().toISOString(), timezone: TZ, storageTime: 'UTC',
      metric: 'outbound_clicks', passwordWeak: passwordIsWeak()
    });
  } catch (e) {
    console.error('ADMIN_CLICKS_ERROR', e);
    return json(503, { error: 'تعذر قراءة إحصاءات النقرات' });
  }
}
