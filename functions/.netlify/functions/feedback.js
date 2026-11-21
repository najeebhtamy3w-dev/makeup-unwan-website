import {resolveAppDatabase} from '../../../cloudflare/lib/environment-db.mjs';
// Cloudflare Pages staging-only feedback intake. Never reads Netlify production.
import {createD1Store} from '../../../cloudflare/lib/d1-store.mjs';
import {checkRateLimit} from '../../../cloudflare/lib/atomic-rate-limit.mjs';
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
async function bucket(secret,ip){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(ip)));return [...bytes.slice(0,8)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function onRequest({request,env}){
 if(!resolveAppDatabase(env)||!env.RATE_LIMIT_SALT||env.RATE_LIMIT_SALT.length<32||!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<15)return reply(503,{error:'خدمة الاستقبال غير مهيأة من الإدارة'});
 if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply(403,{error:'Origin not allowed'});
 try{
  const raw=await request.text();if(raw.length>12000)return reply(413,{error:'الرسالة طويلة جدًا'});
  let data;try{data=JSON.parse(raw)}catch{return reply(400,{error:'بيانات غير صالحة'})}
  if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,{error:'بيانات غير صالحة'});
  if(data.website)return reply(200,{reference:'RECEIVED'});
  if(!['makeup','perfume'].includes(data.store)||!['شكوى','ملاحظة','اقتراح','شكر وتقييم'].includes(data.kind)||typeof data.message!=='string'||data.message.trim().length<10||data.message.length>3000)return reply(400,{error:'تحقق من المحل ونوع الرسالة وطول النص'});
  const db=resolveAppDatabase(env);
  const client=await bucket(env.RATE_LIMIT_SALT,request.headers.get('cf-connecting-ip')||'unknown');
  const per=await checkRateLimit(db,{scope:'feedback',bucket:client,limit:5,windowMs:600000});
  if(!per.allowed)return reply(429,{error:'أرسلت عدة رسائل خلال وقت قصير. حاول لاحقًا.'});
  const global=await checkRateLimit(db,{scope:'feedback-daily',bucket:'a'.repeat(16),limit:300,windowMs:86400000});
  if(!global.allowed)return reply(429,{error:'الخدمة مشغولة الآن. حاول لاحقًا أو استخدم واتساب.'});
  const id=crypto.randomUUID();
  await createD1Store(db,'customer-feedback').setJSON(id,{id,store:data.store,kind:data.kind,message:data.message.trim(),createdAt:new Date().toISOString()});
  return reply(201,{reference:id.slice(0,8).toUpperCase()});
 }catch(e){console.error('CF_FEEDBACK_ERROR',e?.message);return reply(503,{error:'تعذر حفظ الرسالة، حاول لاحقًا'});}
}
