import { randomUUID, createHash } from 'node:crypto';
import { json, sameOrigin, strongStore, requireAdmin, hit, ipKey, clientIp } from '../lib/common.mjs';
const kinds=['تطلعاتي وأمنياتي','أفكار واقتراحات','تجاربي','أسئلة للنقاش','مناسباتي'];
const emojis=['❤️','🌸','✨','👏','💡'];
const posts=()=>strongStore('community-v1');
const events=()=>strongStore('community-events-v2');
const polls=()=>strongStore('community-polls-v1');
const rejectLinks=s=>/(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|net|org|io|app|ly|me|co|ye)\b|(?:\+?\d[\d\s-]{7,}\d)|@)/iu.test(s);
const clean=s=>typeof s==='string'?s.trim():'';
// Normalize invisible separators before screening URL and contact obfuscation.
const forbidden=s=>{
 const n=s.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u064B-\u065F]/g,'');
 return rejectLinks(n)||rejectLinks(n.replace(/\s+/g,''))||
 /(?:[a-z0-9-]+\s*\.\s*)+[a-z]{2,}(?:\b|\/)/iu.test(n)||
 /(?:\+?\d[\d\s().-]{7,}\d)/u.test(n);
};
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const token=s=>typeof s==='string'&&/^[0-9a-f]{32}$/i.test(s);
const ownerHash=(req,ctx)=>createHash('sha256').update(ipKey(clientIp(req,ctx))+'|'+(req.headers.get('user-agent')||'').slice(0,200)).digest('hex').slice(0,32);
async function read(req){const t=await req.text();if(t.length>4000)throw Error('payload too large');return JSON.parse(t||'{}');}
async function limited(req,ctx,scope,max=8){const r=await hit(strongStore('rate-guard'),scope,ipKey(clientIp(req,ctx)),3600000,max);return r.allowed?null:json(429,{error:'طلبات كثيرة. حاول لاحقًا.'});}
async function listing(s,prefix){const keys=[];for await(const page of s.list({prefix,paginate:true}))for(const b of page.blobs)keys.push(b.key);return keys;}
async function reactionCounts(id){const keys=await listing(events(),'reaction/'+id+'/');const counts=Object.fromEntries(emojis.map(e=>[e,0]));for(const key of keys){const e=key.split('/')[2];if(emojis.includes(e))counts[e]++;}return counts;}
async function votes(id){const keys=await listing(events(),'vote/'+id+'/');const counts=[0,0];for(const key of keys){const n=Number(key.split('/')[2]);if(n===0||n===1)counts[n]++;}return counts;}
const publicItem=async x=>({id:x.id,kind:x.kind,text:x.text,createdAt:x.createdAt,reactions:await reactionCounts(x.id)});
export default async function handler(request,context){
 const url=new URL(request.url),action=url.searchParams.get('action')||'list';
 try{
 if(request.method==='GET'&&action==='list'){
  const keys=(await listing(posts(),'posts/')).slice(-400);const items=[];
  for(const key of keys){const x=await posts().get(key,{type:'json'});if(x?.status==='approved')items.push(x);}
  items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return json(200,{items:await Promise.all(items.slice(0,60).map(publicItem))});
 }
 if(action==='poll'&&request.method==='GET'){
  const id=url.searchParams.get('id');if(!uuid(id))return json(400,{error:'معرف غير صالح'});
  const p=await polls().get('polls/'+id,{type:'json'});if(!p)return json(404,{error:'المقارنة غير موجودة'});
  return json(200,{id:p.id,question:p.question,choices:p.choices,createdAt:p.createdAt,counts:await votes(id)});
 }
 if(action==='admin-list'&&request.method==='GET'){
  const denied=await requireAdmin(request,context);if(denied)return denied;
  const keys=(await listing(posts(),'posts/')).slice(-500),items=[];
  for(const key of keys){const x=await posts().get(key,{type:'json'});if(x)items.push(x);}
  const reports=(await listing(events(),'report/')).map(k=>k.split('/')[1]);
  return json(200,{items:items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100),reports:Object.fromEntries([...new Set(reports)].map(id=>[id,reports.filter(x=>x===id).length]))});
 }
 if(request.method!=='POST')return json(405,{error:'طريقة طلب غير مدعومة'});
 if(!sameOrigin(request))return json(403,{error:'مصدر الطلب غير مسموح'});
 if(action==='create'){
  const blocked=await limited(request,context,'community-create',4);if(blocked)return blocked;
  const b=await read(request),t=clean(b.text);
  if(!kinds.includes(b.kind)||t.length<15||t.length>420||forbidden(t)||/[<>]/.test(t)||b.consent!==true)return json(400,{error:'تأكد من النوع والنص والموافقة، ولا تضع روابط أو أرقام أو رموز HTML.'});
  const id=randomUUID(),x={id,kind:b.kind,text:t,status:'approved',createdAt:new Date().toISOString()};
  await posts().setJSON('posts/'+id,x);return json(201,{reference:id.slice(0,8),status:'approved'});
 }
 if(action==='moderate'){
  const denied=await requireAdmin(request,context);if(denied)return denied;
  const b=await read(request);if(!uuid(b.id)||!['approved','rejected'].includes(b.status))return json(400,{error:'بيانات غير صالحة'});
  const key='posts/'+b.id,x=await posts().get(key,{type:'json'});if(!x)return json(404,{error:'غير موجود'});
  x.status=b.status;x.reviewedAt=new Date().toISOString();await posts().setJSON(key,x);return json(200,{ok:true});
 }
 if(action==='react'){
  const blocked=await limited(request,context,'community-react',25);if(blocked)return blocked;
  const b=await read(request);if(!uuid(b.id)||!emojis.includes(b.emoji))return json(400,{error:'تفاعل غير صالح'});
  const x=await posts().get('posts/'+b.id,{type:'json'});if(!x||x.status!=='approved')return json(404,{error:'المنشور غير متاح'});
  const key='reaction/'+b.id+'/'+b.emoji+'/'+ownerHash(request,context);
  if(await events().get(key))return json(409,{error:'سبق تسجيل هذا التفاعل'});
  await events().set(key,new Date().toISOString());return json(200,{reactions:await reactionCounts(b.id)});
 }
 if(action==='report'){
  const blocked=await limited(request,context,'community-report',5);if(blocked)return blocked;
  const b=await read(request);if(!uuid(b.id))return json(400,{error:'غير صالح'});
  const x=await posts().get('posts/'+b.id,{type:'json'});if(!x||x.status!=='approved')return json(404,{error:'غير موجود'});
  const key='report/'+b.id+'/'+ownerHash(request,context);
  if(await events().get(key))return json(409,{error:'تم تسجيل البلاغ سابقًا'});
  await events().set(key,new Date().toISOString());return json(201,{ok:true});
 }
 if(action==='poll-create'){
  const blocked=await limited(request,context,'poll-create',6);if(blocked)return blocked;
  const b=await read(request),q=clean(b.question),a=clean(b.choice1),c=clean(b.choice2);
  if(q.length<5||q.length>130||a.length<2||a.length>80||c.length<2||c.length>80||[q,a,c].some(t=>forbidden(t)||/[<>]/.test(t)))return json(400,{error:'أدخل سؤالًا واختيارين دون روابط أو بيانات اتصال'});
  const id=randomUUID();await polls().setJSON('polls/'+id,{id,question:q,choices:[a,c],createdAt:new Date().toISOString()});return json(201,{id,path:'/masahatak.html?poll='+id});
 }
 if(action==='poll-vote'){
  const blocked=await limited(request,context,'poll-vote',20);if(blocked)return blocked;
  const b=await read(request);if(!uuid(b.id)||![0,1].includes(b.choice))return json(400,{error:'تصويت غير صالح'});
  const p=await polls().get('polls/'+b.id,{type:'json'});if(!p)return json(404,{error:'المقارنة غير موجودة'});
  const key='vote/'+b.id+'/'+b.choice+'/'+ownerHash(request,context);
  const other='vote/'+b.id+'/'+(1-b.choice)+'/'+ownerHash(request,context);
  if(await events().get(key)||await events().get(other))return json(409,{error:'سبق تسجيل تصويت من هذا الجهاز أو الاتصال'});
  await events().set(key,new Date().toISOString());return json(200,{counts:await votes(b.id)});
 }
 return json(404,{error:'غير موجود'});
 }catch(e){console.error('COMMUNITY_ERROR',e?.message);return json(503,{error:'تعذرت العملية، حاول لاحقًا'});}
}
