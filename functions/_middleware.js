// Root Pages middleware: block legacy APIs until real Cloudflare handlers are verified.
export async function onRequest({request,next}) {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/.netlify/functions/') || path.startsWith('/api/admin/')) {
    return Response.json({error:'Backend not available on this staging deployment'},{status:503,headers:{'cache-control':'no-store'}});
  }
  return next();
}
