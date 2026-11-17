import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';
const json=(statusCode,obj)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(obj)});
export async function handler(event){
 if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed'});
 const expected=process.env.ADMIN_PASSWORD||'',given=event.headers['x-admin-password']||'';
 if(expected.length<12)return json(503,{error:'لوحة الإدارة غير مهيأة'});
 const a=Buffer.from(expected),b=Buffer.from(given);if(a.length!==b.length||!timingSafeEqual(a,b))return json(401,{error:'كلمة مرور غير صحيحة'});
 try{const store=getStore('customer-feedback');const result=await store.list({paginate:false});const all=[];
 for(const entry of result.blobs){const x=await store.get(entry.key,{type:'json'});if(x&&x.id)all.push(x)}
 all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return json(200,{items:all.slice(0,500),hasMore:all.length>500});
 }catch{return json(503,{error:'تعذر قراءة الرسائل'})}
}
