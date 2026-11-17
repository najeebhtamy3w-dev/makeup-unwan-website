
import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';

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
  if (request.method !== 'GET') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  const expected = process.env.ADMIN_PASSWORD || '';
  const given = request.headers.get('x-admin-password') || '';

  if (expected.length < 12) {
    return respond({
      error: 'لوحة الإدارة غير مهيأة'
    }, 503);
  }

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');

  if (
    a.length !== b.length ||
    !timingSafeEqual(a, b)
  ) {
    return respond({
      error: 'كلمة مرور غير صحيحة'
    }, 401);
  }

  try {
    const store = getStore('customer-feedback');
    const result = await store.list({ paginate: false });
    const all = [];

    for (const entry of result.blobs) {
      const item = await store.get(entry.key, { type: 'json' });

      if (item && item.id) {
        all.push(item);
      }
    }

    all.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );

    return respond({
      items: all.slice(0, 500),
      hasMore: all.length > 500
    });
  } catch (error) {
    console.error('ADMIN_FEEDBACK_STORAGE_ERROR', error);

    return respond({
      error: 'تعذر قراءة الرسائل'
    }, 503);
  }
}
