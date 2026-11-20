// Safe, read-only Pages Function for validating a staging D1 binding.
// Does not expose secrets or storage records.
export async function onRequestGet({env}) {
  if (!env.STAGING_DB) return Response.json({ok:false,error:'Staging database is not configured'},{status:503,headers:{'cache-control':'no-store'}});
  try {
    await env.STAGING_DB.prepare('SELECT 1 AS ok').first();
    return Response.json({ok:true,service:'makeup-unwan-cloudflare-staging'},{headers:{'cache-control':'no-store'}});
  } catch {
    return Response.json({ok:false,error:'Database unavailable'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
