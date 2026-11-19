// Cloudflare Pages staging guard: legacy endpoints fail closed unless explicitly ported.
export async function onRequest({request,next}) {
 const path=new URL(request.url).pathname;
 if(path.startsWith('/.netlify/functions/') && !['/.netlify/functions/community','/.netlify/functions/feedback','/.netlify/functions/track-click'].includes(path))
  return Response.json({error:'Backend not available on this staging deployment'},{status:503,headers:{'cache-control':'no-store'}});
 if(path.startsWith('/api/admin/'))
  return Response.json({error:'Backend not available on this staging deployment'},{status:503,headers:{'cache-control':'no-store'}});
 return next();
}
