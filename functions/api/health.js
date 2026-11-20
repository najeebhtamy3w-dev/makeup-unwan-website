import {resolveAppDatabase} from '../../cloudflare/lib/environment-db.mjs';
// Cloudflare Pages Function: GET /api/health. Read-only; explicit development or staging binding.
export async function onRequestGet({env}) {
  const db = resolveAppDatabase(env);
  if (!db) return Response.json({ok:false,error:'Database binding unavailable'},{status:503,headers:{'cache-control':'no-store'}});
  try {
    const row = await db.prepare('SELECT 1 AS ok').first();
    if (row?.ok !== 1) throw new Error('DB failed');
    return Response.json({ok:true,service:'makeup-unwan-'+env.DEPLOYMENT_ENV},{headers:{'cache-control':'no-store'}});
  } catch {
    return Response.json({ok:false,error:'Staging database unavailable'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
