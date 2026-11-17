
import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';

const respond = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });

export default async function handler(request, context) {
  if (request.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  const password = process.env.ADMIN_PASSWORD || '';

  if (password.length < 12) {
    return respond({
      error: 'خدمة الاستقبال غير مهيأة من الإدارة'
    }, 503);
  }

  let bodyText;

  try {
    bodyText = await request.text();
  } catch {
    return respond({ error: 'تعذر قراءة الطلب' }, 400);
  }

  if (bodyText.length > 12000) {
    return respond({ error: 'الرسالة طويلة جدًا' }, 413);
  }

  let data;

  try {
    data = JSON.parse(bodyText || '{}');
  } catch {
    return respond({ error: 'بيانات غير صالحة' }, 400);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return respond({ error: 'بيانات غير صالحة' }, 400);
  }

  if (data.website) {
    return respond({ reference: 'RECEIVED' });
  }

  if (
    !['makeup', 'perfume'].includes(data.store) ||
    !['شكوى', 'ملاحظة', 'اقتراح', 'شكر وتقييم'].includes(data.kind) ||
    typeof data.message !== 'string' ||
    data.message.trim().length < 10 ||
    data.message.length > 3000
  ) {
    return respond({
      error: 'تحقق من المحل ونوع الرسالة وطول النص'
    }, 400);
  }

  const id = randomUUID();

  const item = {
    id,
    store: data.store,
    kind: data.kind,
    message: data.message.trim(),
    createdAt: new Date().toISOString()
  };

  try {
    const store = getStore('customer-feedback');

    await store.setJSON(id, item);

    return respond({
      reference: id.slice(0, 8).toUpperCase()
    }, 201);
  } catch (error) {
    console.error('FEEDBACK_STORAGE_ERROR', error);

    return respond({
      error: 'تعذر حفظ الرسالة، حاول لاحقًا'
    }, 503);
  }
}
