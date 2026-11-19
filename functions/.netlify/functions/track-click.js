// Staging-only outbound click tracking with the original response contract.
import {createD1Store} from '../../../cloudflare/lib/d1-store.mjs';
import {checkRateLimit} from '../../../cloudflare/lib/atomic-rate-limit.mjs';
const stores=['makeup','perfume'],channels=['whatsapp','instagram','facebook','phone','maps','whatsapp_channel','whatsapp_group'];
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Aden',year:'numeric',month:'2-digit',day:'2-digit'});
async function bucket(secret,ip){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ip))).slice(0,8)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function onRequest({request,env}){
 if(env.DEPLOYMENT_ENV!=='staging'||!env.STAGING_DB?.prepare||!env.RATE_LIMIT_SALT||env.RATE_LIMIT_SALT.length<32)return reply(503,{error:'Tracking unavailable'});
 if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply(403,{error:'Origin not allowed'});
 try{
  const raw=await request.text();if(raw.length>2048)return reply(413,{error:'Payload too large'});
  let data;try{data=JSON.parse(raw)}catch{return reply(400,{error:'Invalid JSON'})}
  if(!data||typeof data!=='object'||Array.isArray(data)||!stores.includes(data.store)||!channels.includes(data.channel))return reply(400,{error:'Invalid event'});
  const client=await bucket(env.RATE_LIMIT_SALT,request.headers.get('cf-connecting-ip')||'unknown');
  const limit=await checkRateLimit(env.STAGING_DB,{scope:'click',bucket:client,limit:20,windowMs:60000});
  if(!limit.allowed)return reply(429,{error:'Too many requests'});
  const now=Date.now(),at=new Date(now).toISOString();
  const day=dayFmt.format(new Date(now));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid local day');
  const key='v2/'+day+'/'+data.store+'/'+data.channel+'/'+at.replace(/[-:.]/g,'')+'-'+crypto.randomUUID();
  await createD1Store(env.STAGING_DB,'contact-click-events').setJSON(key,{store:data.store,channel:data.channel,at,v:2});
  return reply(201,{ok:true});
 }catch(e){console.error('CF_CLICK_ERROR',e?.message);return reply(503,{error:'Tracking unavailable'});}
}
