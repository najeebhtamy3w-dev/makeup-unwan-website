// V1.2.1 — anonymous customer message intake. Same contract as V1.2, plus abuse limits.
import { randomUUID } from 'node:crypto';
import { json, sameOrigin, clientIp, ipKey, strongStore, hit } from '../lib/common.mjs';

export default async function handler(request, context) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const password = process.env.ADMIN_PASSWORD || '';
  if (password.length < 12) return json(503, { error: 'خدمة الاستقبال غير مهيأة من الإدارة' });

  if (!sameOrigin(request)) return json(403, { error: 'Origin not allowed' });

  let bodyText;
  try { bodyText = await request.text(); } catch { return json(400, { error: 'تعذر قراءة الطلب' }); }
  if (bodyText.length > 12000) return json(413, { error: 'الرسالة طويلة جدًا' });

  let data;
  try { data = JSON.parse(bodyText || '{}'); } catch { return json(400, { error: 'بيانات غير صالحة' }); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json(400, { error: 'بيانات غير صالحة' });

  if (data.website) return json(200, { reference: 'RECEIVED' }); // honeypot

  if (
    !['makeup', 'perfume'].includes(data.store) ||
    !['شكوى', 'ملاحظة', 'اقتراح', 'شكر وتقييم'].includes(data.kind) ||
    typeof data.message !== 'string' ||
    data.message.trim().length < 10 ||
    data.message.length > 3000
  ) return json(400, { error: 'تحقق من المحل ونوع الرسالة وطول النص' });

  // Flood controls: per client (default 5 / 10 min) and a global daily ceiling (default 300).
  // Fail open on limiter errors: losing a genuine complaint is worse than a rare extra message.
  try {
    const guard = strongStore('rate-guard');
    const perClient = await hit(guard, 'f', ipKey(clientIp(request, context)), 10 * 60e3, Number(process.env.FEEDBACK_LIMIT_PER_10MIN) || 5);
    if (!perClient.allowed) return json(429, { error: 'أرسلت عدة رسائل خلال وقت قصير. حاول لاحقًا.' }, { 'retry-after': String(perClient.retryAfter) });
    const daily = await hit(guard, 'fcap', 'all', 24 * 3600e3, Number(process.env.FEEDBACK_DAILY_CAP) || 300);
    if (!daily.allowed) { await perClient.release(); return json(429, { error: 'الخدمة مشغولة الآن. حاول لاحقًا أو استخدم واتساب.' }, { 'retry-after': '3600' }); }
  } catch (e) { console.error('FEEDBACK_RATE_GUARD_ERROR', e && e.message); }

  const id = randomUUID();
  const item = { id, store: data.store, kind: data.kind, message: data.message.trim(), createdAt: new Date().toISOString() };
  try {
    await strongStore('customer-feedback').setJSON(id, item);
    return json(201, { reference: id.slice(0, 8).toUpperCase() });
  } catch (error) {
    console.error('FEEDBACK_STORAGE_ERROR', error);
    return json(503, { error: 'تعذر حفظ الرسالة، حاول لاحقًا' });
  }
}
