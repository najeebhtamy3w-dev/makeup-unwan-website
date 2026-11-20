import {resolveAppDatabase} from '../../cloudflare/lib/environment-db.mjs';
// Cloudflare Pages Function: GET /api/health. Read-only; staging-only.
export async function onRequestGet({env}) {
  if (!resolveAppDatabase(env)) return Response.json({ok:false,error:'Staging only'},{status:503,headers:{'cache-control':'no-store'}});
  if (!resolveAppDatabase(env)) return Response.json({ok:false,error:'Staging database unavailable'},{status:503,headers:{'cache-control':'no-store'}});
  try {
    const row = await resolveAppDatabase(env).prepare('SELECT 1 AS ok').first();
    if (row?.ok !== 1) throw new Error('DB failed');
    return Response.json({ok:true,service:'makeup-unwan-staging'},{headers:{'cache-control':'no-store'}});
  } catch {
    return Response.json({ok:false,error:'Staging database unavailable'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
