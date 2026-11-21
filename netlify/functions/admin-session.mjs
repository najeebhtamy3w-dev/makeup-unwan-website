// Lightweight credential check for the unified admin dashboard (Netlify parity with the
// Cloudflare admin-session route). Login no longer depends on loading messages or clicks.
import { json, requireAdmin } from '../lib/common.mjs';

export default async function handler(request, context) {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const denied = await requireAdmin(request, context);
    if (denied) return denied;
    return json(200, { ok: true, role: 'admin' });
  } catch (error) {
    console.error('ADMIN_SESSION_ERROR', error?.message);
    return json(503, { error: 'تعذر التحقق من الدخول حاليًا (خطأ في الخادم)', code: 'ADMIN_CHECK_FAILED' });
  }
}
