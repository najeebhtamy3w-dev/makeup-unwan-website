// V1.2.1 — read customer messages. Read-only: nothing is deleted, rewritten or migrated.
import { json, strongStore, mapLimit, requireAdmin } from '../lib/common.mjs';

export default async function handler(request, context) {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  const denied = await requireAdmin(request, context);
  if (denied) return denied;

  const started = Date.now();
  const budget = Number(process.env.ADMIN_READ_BUDGET_MS) || 8000;
  try {
    const store = strongStore('customer-feedback');
    const keys = [];
    for await (const page of store.list({ paginate: true })) for (const b of page.blobs) keys.push(b.key);

    let skipped = 0, complete = true;
    const all = [];
    await mapLimit(keys, 25, async (key) => {
      if (Date.now() - started > budget) { complete = false; return; }
      let item = null;
      try { item = await store.get(key, { type: 'json' }); } catch { item = null; }
      if (item && typeof item === 'object' && item.id && typeof item.message === 'string') all.push(item); else skipped++;
    });

    // Records without a valid createdAt are kept (sorted last) instead of breaking the inbox.
    const ts = (x) => { const t = Date.parse(x.createdAt); return Number.isFinite(t) ? t : -Infinity; };
    all.sort((a, b) => (ts(b) === ts(a) ? 0 : ts(b) > ts(a) ? 1 : -1));
    const undated = all.filter((x) => !Number.isFinite(ts(x))).length;

    return json(200, { items: all.slice(0, 500), hasMore: all.length > 500, total: all.length, undated, skipped, complete });
  } catch (error) {
    console.error('ADMIN_FEEDBACK_STORAGE_ERROR', error);
    return json(503, { error: 'تعذر قراءة الرسائل' });
  }
}
