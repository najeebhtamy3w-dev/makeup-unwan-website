// Cloudflare Pages Functions fail-closed guard.
// Until all original Netlify endpoints are ported and tested, never serve HTML
// pretending that the APIs are working. All paths not handled by a more specific
// Pages Function continue to static asset serving.
export async function onRequest({request,next}) {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/.netlify/functions/') || path.startsWith('/api/admin/')) {
    return Response.json({error:'Backend not available on this staging deployment'},{status:503,headers:{'cache-control':'no-store'}});
  }
  return next();
}
