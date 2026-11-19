// Cloudflare staging admin feedback inbox, read-only and fail-closed.
import {requireStagingAdmin} from '../../../cloudflare/lib/admin-auth.mjs';
import {createD1Store} from '../../../cloudflare/lib/d1-store.mjs';
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function onRequest({request,env}){
 if(env.DEPLOYMENT_ENV!=='staging'||!env.STAGING_DB?.prepare||typeof env.RATE_LIMIT_SALT!=='string'||env.RATE_LIMIT_SALT.length<32)return reply(503,{error:'لوحة الإدارة غير مهيأة'});
 if(request.method!=='GET')return reply(405,{error:'Method not allowed'});
 try{
  const denied=await requireStagingAdmin(request,env);if(denied)return denied;
  const store=createD1Store(env.STAGING_DB,'customer-feedback');
  const started=Date.now(),budget=8000,all=[];
  let complete=true,skipped=0;
  for await(const page of store.list({paginate:true})){
   for(const entry of page.blobs){
    if(Date.now()-started>budget){complete=false;break;}
    let item=null;try{item=await store.get(entry.key,{type:'json'});}catch{}
    if(item&&typeof item==='object'&&item.id&&typeof item.message==='string')all.push(item);
    else skipped++;
   }
   if(!complete)break;
  }
  const time=x=>{const t=Date.parse(x.createdAt);return Number.isFinite(t)?t:-Infinity;};
  all.sort((a,b)=>time(b)-time(a));
  return reply(200,{items:all.slice(0,500),hasMore:all.length>500,total:all.length,
   undated:all.filter(x=>!Number.isFinite(time(x))).length,skipped,complete});
 }catch(e){console.error('CF_ADMIN_FEEDBACK_ERROR',e?.message);return reply(503,{error:'تعذر قراءة الرسائل'});}
}
