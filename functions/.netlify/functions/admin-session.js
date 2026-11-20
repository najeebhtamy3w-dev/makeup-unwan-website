import {requireStagingAdmin} from '../../../cloudflare/lib/admin-auth.mjs';
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function onRequest({request,env}){
 if(request.method!=='GET')return reply(405,{error:'Method not allowed'});
 try{
  const denied=await requireStagingAdmin(request,env);
  if(denied)return denied;
  return reply(200,{ok:true,role:'admin'});
 }catch(e){
  console.error('CF_ADMIN_SESSION_ERROR',e?.message);
  return reply(503,{error:'تعذر التحقق من الدخول حاليًا'});
 }
}
