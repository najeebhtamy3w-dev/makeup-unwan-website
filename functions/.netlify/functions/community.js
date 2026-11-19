// Cloudflare Pages staging-only community API, existing client URL preserved.
// Only polls and approved-post reactions/reports are enabled; all other actions fail closed.
import {insertCommunityEvent,communityEventCounts} from '../../../cloudflare/lib/community-atomic.mjs';
import {checkRateLimit} from '../../../cloudflare/lib/atomic-rate-limit.mjs';
import {createD1Store} from '../../../cloudflare/lib/d1-store.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMOJI=['❤️','🌸','✨','👏','💡'];
const response=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function hmac(secret,value) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));
}
async function owner(req,env) {
 const ip=req.headers.get('cf-connecting-ip')||'unknown';
 const salt=env.RATE_LIMIT_SALT;
 const ipHash=(await hmac(salt,ip)).slice(0,16);
 const fingerprint=(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ipHash+'|'+(req.headers.get('user-agent')||'').slice(0,200))));
 return {bucket:ipHash,hash:hex(fingerprint).slice(0,32)};
}
export async function onRequest({request,env}) {
 if(env.DEPLOYMENT_ENV!=='staging'||!env.STAGING_DB?.prepare||typeof env.RATE_LIMIT_SALT!=='string'||env.RATE_LIMIT_SALT.length<32)
  return response(503,{error:'الخدمة التجريبية غير مهيأة'});
 const url=new URL(request.url),action=url.searchParams.get('action')||'list';
 const db=env.STAGING_DB;
 try {
  if(request.method==='GET'&&action==='poll') {
   const id=url.searchParams.get('id');
   if(!UUID.test(id||''))return response(400,{error:'معرف غير صالح'});
   const p=await createD1Store(db,'community-polls-v1').get('polls/'+id,{type:'json'});
   if(!p)return response(404,{error:'المقارنة غير موجودة'});
   return response(200,{id:p.id,question:p.question,choices:p.choices,createdAt:p.createdAt,counts:await communityEventCounts(db,{type:'vote',id})});
  }
  if(request.method!=='POST'||!['react','report','poll-vote'].includes(action))
   return response(503,{error:'هذه الوظيفة لم تُفعّل بعد في بيئة الاختبار'});
  if(request.headers.get('origin')!==url.origin)return response(403,{error:'مصدر الطلب غير مسموح'});
  const raw=await request.text();
  if(raw.length>4000)return response(413,{error:'الطلب طويل جدًا'});
  let body;
  try {body=JSON.parse(raw)}catch{return response(400,{error:'بيانات غير صالحة'})}
  if(!body||typeof body!=='object'||Array.isArray(body)||!UUID.test(body.id||''))
   return response(400,{error:'معرف غير صالح'});
  const who=await owner(request,env);
  const scope=action==='react'?'community-react':action==='report'?'community-report':'poll-vote';
  const limit=action==='react'?25:action==='report'?5:20;
  const allowed=await checkRateLimit(db,{scope,bucket:who.bucket,limit,windowMs:3600000});
  if(!allowed.allowed)return response(429,{error:'طلبات كثيرة. حاول لاحقًا.'});
  if(action==='poll-vote') {
   if(![0,1].includes(body.choice))return response(400,{error:'تصويت غير صالح'});
   const poll=await createD1Store(db,'community-polls-v1').get('polls/'+body.id,{type:'json'});
   if(!poll)return response(404,{error:'المقارنة غير موجودة'});
   const saved=await insertCommunityEvent(db,{type:'vote',id:body.id,owner:who.hash,choice:body.choice});
   if(!saved.inserted)return response(409,{error:'سبق تسجيل تصويت من هذا الجهاز أو الاتصال'});
   return response(200,{counts:await communityEventCounts(db,{type:'vote',id:body.id})});
  }
  const post=await createD1Store(db,'community-v1').get('posts/'+body.id,{type:'json'});
  if(!post||post.status!=='approved')return response(404,{error:'المنشور غير متاح'});
  if(action==='react') {
   if(!EMOJI.includes(body.emoji))return response(400,{error:'تفاعل غير صالح'});
   const saved=await insertCommunityEvent(db,{type:'reaction',id:body.id,owner:who.hash,emoji:body.emoji});
   if(!saved.inserted)return response(409,{error:'سبق تسجيل هذا التفاعل'});
   return response(200,{reactions:await communityEventCounts(db,{type:'reaction',id:body.id})});
  }
  const saved=await insertCommunityEvent(db,{type:'report',id:body.id,owner:who.hash});
  return saved.inserted?response(201,{ok:true}):response(409,{error:'تم تسجيل البلاغ سابقًا'});
 } catch(e) {
  console.error('CF_COMMUNITY_ERROR',e?.message);
  return response(503,{error:'تعذرت العملية، حاول لاحقًا'});
 }
}
