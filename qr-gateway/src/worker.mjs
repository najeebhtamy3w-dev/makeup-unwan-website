// QR gateway (prototype, NOT deployed): one stable URL per QR, redirected to the first
// healthy hosting origin, with store routing, path/query preservation and a static
// last-resort contact page when every origin is down.
//
// Configuration (wrangler vars):
//   ORIGINS           comma-separated https origins in priority order, e.g.
//                     "https://primary.example,https://secondary.example"
//   PROBE_TIMEOUT_MS  per-origin health probe timeout (default 2500)
//   HEALTH_TTL_S      how long a probe result is reused (default 30)
import {STORES} from './contacts.mjs';

// Short store paths for printed codes. The store page is a section of the single
// landing page, so it is expressed as a URL fragment (#makeup / #perfume).
export const STORE_PATHS={'/m':'makeup','/makeup':'makeup','/u':'perfume','/unwan':'perfume','/perfume':'perfume'};
// Never send QR visitors to admin or backend paths through the gateway.
const BLOCKED=/^\/(admin|community-admin|api|\.netlify)(\/|\.html$|$)/i;

export function parseOrigins(env,gatewayHost){
 const list=String(env.ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const out=[];
 for(const raw of list){
  let u;try{u=new URL(raw)}catch{continue}
  const localTest=env.LOCAL_TEST==='1'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.protocol==='http:';
  if(u.protocol!=='https:'&&!localTest)continue;     // HTTPS only (plain http allowed for localhost tests only)
  if(u.host===gatewayHost)continue;                  // never redirect to itself (loop)
  out.push(u.origin);
 }
 return [...new Set(out)];
}

const memory=new Map(); // per-isolate cache (also used in tests)
export function _resetHealthCache(){memory.clear()}

// Healthy = the origin itself serves the landing page (HTTP 200, HTML).
// A 3xx is NOT healthy: it would chain the visitor to some other host we cannot vouch
// for, and treating it as healthy could create redirect loops.
export async function isHealthy(origin,env,{fetchImpl=fetch,now=Date.now()}={}){
 const ttl=(Number(env.HEALTH_TTL_S)||30)*1000;
 const hit=memory.get(origin);
 if(hit&&now-hit.at<ttl)return hit.ok;
 let ok=false;
 try{
  const res=await fetchImpl(origin+'/',{method:'GET',redirect:'manual',headers:{'user-agent':'makeup-unwan-qr-gateway/1 health'},
   signal:AbortSignal.timeout(Number(env.PROBE_TIMEOUT_MS)||2500)});
  ok=res.status===200&&/text\/html/i.test(res.headers.get('content-type')||'');
  try{res.body?.cancel?.()}catch{}
 }catch{ok=false}
 memory.set(origin,{ok,at:now});
 return ok;
}

export function targetFor(url){
 const key=url.pathname.replace(/\/+$/,'').toLowerCase();
 const store=STORE_PATHS[key]||null;
 // store shortcut -> landing page + store section; anything else keeps its exact path.
 return {store,path:store?'/':url.pathname,search:url.search,hash:store?'#'+store:''};
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fallbackPage(store){
 const order=store?[store,...Object.keys(STORES).filter(k=>k!==store)]:Object.keys(STORES);
 const block=k=>{const s=STORES[k];return `<section id="${k}"><h2>${esc(s.name)}</h2>
${s.whatsapp.map(([t,h])=>`<a class="btn" href="${esc(h)}">${esc(t)}</a>`).join('')}
${s.phones.map(p=>`<a class="btn alt" href="tel:${esc(p)}">اتصال ${esc(p.replace('+967',''))}</a>`).join('')}
<p>${s.links.map(([t,h])=>`<a href="${esc(h)}">${esc(t)}</a>`).join(' · ')}</p></section>`};
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>ميك أب هاوس × عنوان العطر</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#fff8f6;color:#222;max-width:560px;margin-inline:auto}
h1{font-size:1.2rem}section{background:#fff;border-radius:14px;padding:14px;margin:12px 0;box-shadow:0 1px 4px #0002}
.btn{display:block;text-align:center;padding:12px;margin:8px 0;border-radius:10px;background:#1f9d55;color:#fff;text-decoration:none;font-weight:600}
.btn.alt{background:#444}p{line-height:2;overflow-wrap:anywhere}small{color:#666}</style></head><body>
<h1>الموقع غير متاح مؤقتًا</h1><small>يمكنك التواصل مباشرة مع المحل:</small>
${order.map(block).join('\n')}</body></html>`;
}

export default {
 async fetch(request,env,ctx,{fetchImpl=fetch}={}){
  const url=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  if(BLOCKED.test(url.pathname))return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
  const t=targetFor(url);
  const origins=parseOrigins(env,url.host);
  for(const origin of origins){
   if(await isHealthy(origin,env,{fetchImpl})){
    // 302 + no-store: browsers re-ask the gateway every scan, so failover AND failback work.
    return new Response(null,{status:302,headers:{location:origin+t.path+t.search+t.hash,'cache-control':'no-store','x-qr-origin':new URL(origin).host}});
   }
  }
  return new Response(fallbackPage(t.store),{status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','retry-after':'60',
   'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"}});
 }
};
