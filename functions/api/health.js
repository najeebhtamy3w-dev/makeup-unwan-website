import {resolveAppDatabase,diagnoseAppDatabase,deploymentEnv} from '../../cloudflare/lib/environment-db.mjs';
// Cloudflare Pages Function: GET /api/health. Read-only; explicit development or staging binding.
// Reports only setting/binding presence and missing table NAMES; never values, IDs or rows.
export const REQUIRED_TABLES=['app_records','rate_windows','community_events','community_reaction_selections'];
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export async function onRequestGet({env}) {
  const db = resolveAppDatabase(env);
  if (!db) return reply(503,{ok:false,error:'Database binding unavailable',database:diagnoseAppDatabase(env)});
  const service='makeup-unwan-'+deploymentEnv(env);
  try {
    const row = await db.prepare('SELECT 1 AS ok').first();
    if (row?.ok !== 1) throw new Error('DB failed');
    const found = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${REQUIRED_TABLES.map(()=>'?').join(',')})`)
      .bind(...REQUIRED_TABLES).all();
    const names = new Set((found?.results||[]).map(r=>r.name));
    const missingTables = REQUIRED_TABLES.filter(t=>!names.has(t));
    if (missingTables.length) return reply(503,{ok:false,service,error:'Database schema incomplete',missingTables});
    return reply(200,{ok:true,service});
  } catch {
    return reply(503,{ok:false,service,error:'Database unavailable'});
  }
}
