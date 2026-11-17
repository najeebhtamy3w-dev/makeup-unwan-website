
import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';

const json = (statusCode, obj) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  },
  body: JSON.stringify(obj)
});

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
    return json(503, { error: 'خدمة الاستقبال غير مهيأة من الإدارة' });
  }

  if ((event.body || '').length > 12000) {
    return json(413, { error: 'الرسالة طويلة جدًا' });
  }

  let b;
  try {
    b = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'بيانات غير صالحة' });
  }

  if (b.website) {
    return json(200, { reference: 'RECEIVED' });
  }

  if (
    !['makeup', 'perfume'].includes(b.store) ||
    !['شكوى', 'ملاحظة', 'اقتراح', 'شكر وتقييم'].includes(b.kind) ||
    typeof b.message !== 'string' ||
    b.message.trim().length < 10 ||
    b.message.length > 3000
  ) {
    return json(400, {
      error: 'تحقق من المحل ونوع الرسالة وطول النص'
    });
  }

  const id = randomUUID();

  const item = {
    id,
    store: b.store,
    kind: b.kind,
    message: b.message.trim(),
    createdAt: new Date().toISOString()
  };

  try {
    const store = getStore('customer-feedback');
    await store.setJSON(id, item);

    return json(201, {
      reference: id.slice(0, 8).toUpperCase()
    });
  } catch (err) {
    console.error('FEEDBACK_STORAGE_ERROR', err);

    return json(503, {
      error: 'تعذر حفظ الرسالة، حاول لاحقًا'
    });
  }
}
